import * as THREE from "three";
import { ChunkManager } from "@engine/world/ChunkManager";
import { RemotePlayerAvatar } from "@engine/multiplayer/RemotePlayerAvatar";
import { connectMultiplayerSession } from "@lib/multiplayer/sessionClient";
import type { MultiplayerConnection, MultiplayerPlayerState, MultiplayerSessionMeta } from "@lib/multiplayer/types";
import { useAuthStore } from "@store/useAuthStore";
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
  private readonly playerId = getStablePlayerId();
  private readonly playerName = getPlayerName();
  private readonly avatars = new Map<string, RemotePlayerAvatar>();
  private readonly appliedBlockTimestamps = new Map<string, number>();
  private connection: MultiplayerConnection | null = null;
  private sendTimer = PLAYER_SEND_INTERVAL_MS;

  constructor(scene: THREE.Scene, chunkManager: ChunkManager) {
    this.scene = scene;
    this.chunkManager = chunkManager;
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
    useMultiplayerStore.getState().setConnected(connection.session);

    connection.subscribePlayers((players) => {
      const now = Date.now();
      const activePlayers = players.filter(
        (player) => now - player.updatedAt <= PLAYER_STALE_AFTER_MS
      );
      useMultiplayerStore.getState().setPlayers(activePlayers);
      this.syncRemotePlayers(activePlayers);
    });

    connection.subscribeBlockChanges((change) => {
      if (change.updatedBy === this.playerId) return;
      const key = `${change.x},${change.y},${change.z}`;
      const previous = this.appliedBlockTimestamps.get(key) ?? 0;
      if (change.updatedAt <= previous) return;

      this.appliedBlockTimestamps.set(key, change.updatedAt);
      this.chunkManager.setBlock(change.x, change.y, change.z, change.blockId, "remote");
    });

    return connection.session;
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

  async disconnect(): Promise<void> {
    const connection = this.connection;
    this.connection = null;
    this.sendTimer = 0;

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
  }

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
