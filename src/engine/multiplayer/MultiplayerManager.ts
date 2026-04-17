import * as THREE from "three";
import { ChunkManager } from "@engine/world/ChunkManager";
import { ItemDropManager } from "@engine/world/ItemDropManager";
import { RemotePlayerAvatar } from "@engine/multiplayer/RemotePlayerAvatar";
import { connectMultiplayerSession } from "@lib/multiplayer/sessionClient";
import type {
  ChatMessageKind,
  MultiplayerConnection,
  MultiplayerDropState,
  MultiplayerPlayerState,
  MultiplayerSessionMeta,
} from "@lib/multiplayer/types";
import { useAuthStore } from "@store/useAuthStore";
import { useChatStore } from "@store/useChatStore";
import { useMultiplayerStore } from "@store/useMultiplayerStore";

const PLAYER_SEND_INTERVAL_MS = 120;
const PLAYER_STALE_AFTER_MS = 15_000;
const LOCAL_PLAYER_STORAGE_KEY = "voxelheim-multiplayer-player-id";

interface LocalPlayerSnapshot {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  isCrouching: boolean;
}

function getStablePlayerId(): string {
  const authUser = useAuthStore.getState().user;
  if (authUser?.uid) return authUser.uid;

  if (typeof window === "undefined") {
    return "offline-player";
  }

  const existing = window.localStorage.getItem(LOCAL_PLAYER_STORAGE_KEY);
  if (existing) return existing;

  const next = `guest-${Math.random().toString(36).slice(2, 10)}`;
  window.localStorage.setItem(LOCAL_PLAYER_STORAGE_KEY, next);
  return next;
}

function getPlayerName(): string {
  const authUser = useAuthStore.getState().user;
  const emailName = authUser?.email?.split("@")[0]?.trim();
  if (emailName) return emailName.slice(0, 16);
  return "Guest";
}

export class MultiplayerManager {
  private readonly scene: THREE.Scene;
  private readonly chunkManager: ChunkManager;
  private readonly itemDrops: ItemDropManager;
  private readonly playerId = getStablePlayerId();
  private readonly playerName = getPlayerName();
  private readonly avatars = new Map<string, RemotePlayerAvatar>();
  private readonly appliedBlockTimestamps = new Map<string, number>();
  private readonly cleanup: Array<() => void> = [];
  private connection: MultiplayerConnection | null = null;
  private sendTimer = PLAYER_SEND_INTERVAL_MS;

  constructor(
    scene: THREE.Scene,
    chunkManager: ChunkManager,
    itemDrops: ItemDropManager
  ) {
    this.scene = scene;
    this.chunkManager = chunkManager;
    this.itemDrops = itemDrops;
  }

  async connect(sessionCode: string): Promise<MultiplayerSessionMeta> {
    useMultiplayerStore.getState().beginConnecting();
    let connection: MultiplayerConnection;
    try {
      connection = await connectMultiplayerSession(sessionCode, {
        playerId: this.playerId,
        name: this.playerName,
      });
    } catch (error) {
      useMultiplayerStore.getState().setError(
        error instanceof Error ? error.message : "Failed to connect"
      );
      throw error;
    }

    this.connection = connection;
    this.sendTimer = PLAYER_SEND_INTERVAL_MS;
    useMultiplayerStore.getState().setConnected(connection.session);

    this.cleanup.push(
      connection.subscribePlayers((players) => {
        const now = Date.now();
        const activePlayers = players.filter(
          (player) => now - player.updatedAt <= PLAYER_STALE_AFTER_MS
        );
        useMultiplayerStore.getState().setPlayers(activePlayers);
        this.syncRemotePlayers(activePlayers);
      })
    );

    this.cleanup.push(
      connection.subscribeBlockChanges((change) => {
        if (change.updatedBy === this.playerId) return;
        const key = `${change.x},${change.y},${change.z}`;
        const previous = this.appliedBlockTimestamps.get(key) ?? 0;
        if (change.updatedAt <= previous) return;

        this.appliedBlockTimestamps.set(key, change.updatedAt);
        this.chunkManager.setBlock(
          change.x,
          change.y,
          change.z,
          change.blockId,
          "remote"
        );
      })
    );

    this.cleanup.push(
      connection.subscribeDropEvents((event) => {
        if (event.type === "upsert") {
          this.itemDrops.upsertRemoteDrop(event.drop);
          return;
        }
        this.itemDrops.removeRemoteDrop(event.dropId);
      })
    );

    this.cleanup.push(
      connection.subscribeChat((message) => {
        useChatStore.getState().appendMessage(message);
      })
    );

    this.cleanup.push(
      connection.subscribeHits((hit) => {
        // Ignore hits targeted at others — only apply damage if we're the target
        if (hit.targetId !== this.playerId) return;
        this.onHitReceived?.(hit);
      })
    );

    return connection.session;
  }

  onHitReceived: ((hit: import("@lib/multiplayer/types").MultiplayerHitEvent) => void) | null = null;

  /** Raycast against remote avatars — returns the nearest one hit within range, if any. */
  hitTestRemote(
    origin: { x: number; y: number; z: number },
    dir: { x: number; y: number; z: number },
    maxDist: number
  ): { playerId: string; name: string; position: { x: number; y: number; z: number } } | null {
    let best: { playerId: string; name: string; position: { x: number; y: number; z: number }; t: number } | null = null;
    const HALF_WIDTH = 0.4;
    const HEIGHT = 1.9;
    for (const [playerId, avatar] of this.avatars) {
      const pos = avatar.group.position;
      const minX = pos.x - HALF_WIDTH;
      const maxX = pos.x + HALF_WIDTH;
      const minY = pos.y;
      const maxY = pos.y + HEIGHT;
      const minZ = pos.z - HALF_WIDTH;
      const maxZ = pos.z + HALF_WIDTH;
      const t = rayAabb(origin, dir, minX, minY, minZ, maxX, maxY, maxZ);
      if (t !== null && t >= 0 && t <= maxDist && (!best || t < best.t)) {
        // Get player name from the avatar's state — fall back to playerId
        const state = useMultiplayerStore.getState().players.find(p => p.playerId === playerId);
        best = {
          playerId,
          name: state?.name ?? playerId,
          position: { x: pos.x, y: pos.y, z: pos.z },
          t,
        };
      }
    }
    return best ? { playerId: best.playerId, name: best.name, position: best.position } : null;
  }

  sendPlayerHit(targetId: string, damage: number, fromX: number, fromZ: number): void {
    if (!this.connection) return;
    void this.connection.sendHit({
      attackerId: this.playerId,
      attackerName: this.playerName,
      targetId,
      damage,
      fromX,
      fromZ,
    });
  }

  get localPlayerName(): string {
    return this.playerName;
  }

  get localPlayerId(): string {
    return this.playerId;
  }

  sendChat(text: string, kind: ChatMessageKind = "chat"): void {
    const trimmed = text.trim().slice(0, 256);
    if (!trimmed) return;

    if (this.connection) {
      // Transport loopback will re-emit through subscribeChat for the local client
      void this.connection.sendChatMessage({
        playerId: this.playerId,
        name: this.playerName,
        text: trimmed,
        kind,
      });
      return;
    }

    // Solo: append directly so the chat feed still works without a session
    useChatStore.getState().appendMessage({
      id: `${this.playerId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      playerId: this.playerId,
      name: this.playerName,
      text: trimmed,
      kind,
      createdAt: Date.now(),
    });
  }

  update(dt: number, localPlayer: LocalPlayerSnapshot): void {
    for (const avatar of this.avatars.values()) {
      avatar.update(dt);
    }

    if (!this.connection) return;

    this.sendTimer += dt * 1000;
    if (this.sendTimer < PLAYER_SEND_INTERVAL_MS) return;
    this.sendTimer = 0;

    void this.connection.setPlayerState({
      playerId: this.playerId,
      name: this.playerName,
      x: localPlayer.x,
      y: localPlayer.y,
      z: localPlayer.z,
      yaw: localPlayer.yaw,
      pitch: localPlayer.pitch,
      isCrouching: localPlayer.isCrouching,
    });
  }

  broadcastBlockChange(x: number, y: number, z: number, blockId: number): void {
    if (!this.connection) return;

    void this.connection.setBlockState({
      x,
      y,
      z,
      blockId,
      updatedBy: this.playerId,
    });
  }

  broadcastDrop(drop: MultiplayerDropState): void {
    if (!this.connection) return;
    void this.connection.upsertDrop(drop);
  }

  claimDrop(dropId: string): Promise<boolean> {
    if (!this.connection) {
      return Promise.resolve(true);
    }
    return this.connection.removeDrop(dropId);
  }

  loadWorldState(): Promise<Map<string, Uint8Array>> {
    if (!this.connection) {
      return Promise.resolve(new Map());
    }
    return this.connection.loadWorldState();
  }

  async saveWorldState(chunks: Map<string, Uint8Array>): Promise<void> {
    if (!this.connection || chunks.size === 0) return;
    await this.connection.saveWorldState(chunks);
  }

  async disconnect(): Promise<void> {
    const connection = this.connection;
    this.connection = null;
    this.sendTimer = PLAYER_SEND_INTERVAL_MS;

    for (const dispose of this.cleanup.splice(0)) {
      dispose();
    }

    if (connection) {
      await connection.close();
    }

    for (const avatar of this.avatars.values()) {
      this.scene.remove(avatar.group);
      avatar.dispose();
    }
    this.avatars.clear();
    this.appliedBlockTimestamps.clear();
    useMultiplayerStore.getState().reset();
    useChatStore.getState().clear();
  }

  // ------------------------------------------------------------------

  private syncRemotePlayers(players: MultiplayerPlayerState[]): void {
    const remoteIds = new Set<string>();

    for (const player of players) {
      if (player.playerId === this.playerId) continue;
      remoteIds.add(player.playerId);

      let avatar = this.avatars.get(player.playerId);
      if (!avatar) {
        avatar = new RemotePlayerAvatar(player);
        this.avatars.set(player.playerId, avatar);
        this.scene.add(avatar.group);
      }

      avatar.applyState(player);
    }

    for (const [playerId, avatar] of this.avatars) {
      if (remoteIds.has(playerId)) continue;
      this.scene.remove(avatar.group);
      avatar.dispose();
      this.avatars.delete(playerId);
    }
  }
}

/** Slab ray-vs-AABB test. Returns t along the ray, or null if no intersection. */
function rayAabb(
  origin: { x: number; y: number; z: number },
  dir: { x: number; y: number; z: number },
  minX: number, minY: number, minZ: number,
  maxX: number, maxY: number, maxZ: number
): number | null {
  let tmin = -Infinity;
  let tmax = Infinity;
  for (const axis of ["x", "y", "z"] as const) {
    const o = origin[axis];
    const d = dir[axis];
    const lo = axis === "x" ? minX : axis === "y" ? minY : minZ;
    const hi = axis === "x" ? maxX : axis === "y" ? maxY : maxZ;
    if (Math.abs(d) < 1e-8) {
      if (o < lo || o > hi) return null;
      continue;
    }
    let t1 = (lo - o) / d;
    let t2 = (hi - o) / d;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  return tmin >= 0 ? tmin : (tmax >= 0 ? tmax : null);
}
