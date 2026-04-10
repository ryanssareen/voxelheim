import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  runTransaction,
  setDoc,
  writeBatch,
  type Firestore,
} from "firebase/firestore";
import { firestore, firebaseConfigured } from "@lib/firebase";
import {
  createSessionCode,
  isLocalSessionCode,
  normalizeSessionCode,
} from "@lib/multiplayer/sessionCode";
import type {
  CreateSessionInput,
  MultiplayerBlockState,
  MultiplayerConnection,
  MultiplayerDropEvent,
  MultiplayerDropState,
  MultiplayerIdentity,
  MultiplayerPlayerState,
  MultiplayerSessionMeta,
} from "@lib/multiplayer/types";

const LOCAL_SESSION_PREFIX = "voxelheim-mp-session:";
const LOCAL_BLOCK_PREFIX = "voxelheim-mp-blocks:";
const LOCAL_WORLD_PREFIX = "voxelheim-mp-world:";
const LOCAL_DROP_PREFIX = "voxelheim-mp-drops:";
const CHANNEL_PREFIX = "voxelheim-mp:";

type LocalBlockMap = Record<string, MultiplayerBlockState>;
type LocalWorldMap = Record<string, string>;
type LocalDropMap = Record<string, MultiplayerDropState>;

type LocalMessage =
  | { type: "hello-request"; playerId: string }
  | { type: "player-state"; payload: MultiplayerPlayerState }
  | { type: "player-leave"; playerId: string }
  | { type: "block-state"; payload: MultiplayerBlockState }
  | { type: "drop-upsert"; payload: MultiplayerDropState }
  | { type: "drop-remove"; dropId: string };

function sessionStorageKey(code: string): string {
  return `${LOCAL_SESSION_PREFIX}${code}`;
}

function blockStorageKey(code: string): string {
  return `${LOCAL_BLOCK_PREFIX}${code}`;
}

function worldStorageKey(code: string): string {
  return `${LOCAL_WORLD_PREFIX}${code}`;
}

function dropStorageKey(code: string): string {
  return `${LOCAL_DROP_PREFIX}${code}`;
}

function blockRecordKey(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

function encodeBytes(data: Uint8Array): string {
  let binary = "";
  for (const byte of data) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function decodeBytes(encoded: string): Uint8Array {
  const binary = atob(encoded);
  const data = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    data[index] = binary.charCodeAt(index);
  }
  return data;
}

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;

  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

function readLocalSession(code: string): MultiplayerSessionMeta | null {
  return readJson<MultiplayerSessionMeta | null>(sessionStorageKey(code), null);
}

function writeLocalSession(session: MultiplayerSessionMeta): void {
  writeJson(sessionStorageKey(session.code), session);
}

function readLocalBlocks(code: string): LocalBlockMap {
  return readJson<LocalBlockMap>(blockStorageKey(code), {});
}

function writeLocalBlock(code: string, change: MultiplayerBlockState): void {
  const existing = readLocalBlocks(code);
  existing[blockRecordKey(change.x, change.y, change.z)] = change;
  writeJson(blockStorageKey(code), existing);
}

function readLocalDrops(code: string): LocalDropMap {
  return readJson<LocalDropMap>(dropStorageKey(code), {});
}

function writeLocalDrop(code: string, drop: MultiplayerDropState): void {
  const existing = readLocalDrops(code);
  existing[drop.dropId] = drop;
  writeJson(dropStorageKey(code), existing);
}

function deleteLocalDrop(code: string, dropId: string): boolean {
  const existing = readLocalDrops(code);
  if (!existing[dropId]) return false;
  delete existing[dropId];
  writeJson(dropStorageKey(code), existing);
  return true;
}

function readLocalWorldState(code: string): Map<string, Uint8Array> {
  const existing = readJson<LocalWorldMap>(worldStorageKey(code), {});
  const chunks = new Map<string, Uint8Array>();
  for (const [chunkKey, encoded] of Object.entries(existing)) {
    chunks.set(chunkKey, decodeBytes(encoded));
  }
  return chunks;
}

function writeLocalWorldState(
  code: string,
  chunks: Map<string, Uint8Array>
): void {
  const payload: LocalWorldMap = {};
  for (const [chunkKey, data] of chunks) {
    payload[chunkKey] = encodeBytes(data);
  }
  writeJson(worldStorageKey(code), payload);
}

class LocalMultiplayerConnection implements MultiplayerConnection {
  readonly transport = "local" as const;

  private readonly channel: BroadcastChannel;
  private readonly identity: MultiplayerIdentity;
  private readonly playerListeners = new Set<
    (players: MultiplayerPlayerState[]) => void
  >();
  private readonly blockListeners = new Set<
    (change: MultiplayerBlockState) => void
  >();
  private readonly dropListeners = new Set<
    (event: MultiplayerDropEvent) => void
  >();
  private readonly playerStates = new Map<string, MultiplayerPlayerState>();
  private latestLocalState: MultiplayerPlayerState | null = null;

  constructor(
    readonly session: MultiplayerSessionMeta,
    identity: MultiplayerIdentity
  ) {
    this.identity = identity;
    this.channel = new BroadcastChannel(`${CHANNEL_PREFIX}${session.code}`);
    this.channel.addEventListener("message", this.handleMessage);

    queueMicrotask(() => {
      this.channel.postMessage({
        type: "hello-request",
        playerId: this.identity.playerId,
      } satisfies LocalMessage);
    });
  }

  subscribePlayers(
    callback: (players: MultiplayerPlayerState[]) => void
  ): () => void {
    this.playerListeners.add(callback);
    callback(this.getSortedPlayers());
    return () => {
      this.playerListeners.delete(callback);
    };
  }

  subscribeBlockChanges(
    callback: (change: MultiplayerBlockState) => void
  ): () => void {
    this.blockListeners.add(callback);

    const existing = Object.values(readLocalBlocks(this.session.code)).sort(
      (left, right) => left.updatedAt - right.updatedAt
    );
    for (const change of existing) {
      callback(change);
    }

    return () => {
      this.blockListeners.delete(callback);
    };
  }

  subscribeDropEvents(
    callback: (event: MultiplayerDropEvent) => void
  ): () => void {
    this.dropListeners.add(callback);

    const existingDrops = Object.values(readLocalDrops(this.session.code)).sort(
      (left, right) => left.createdAt - right.createdAt
    );
    for (const drop of existingDrops) {
      callback({ type: "upsert", drop });
    }

    return () => {
      this.dropListeners.delete(callback);
    };
  }

  async setPlayerState(
    state: Omit<MultiplayerPlayerState, "updatedAt">
  ): Promise<void> {
    const next: MultiplayerPlayerState = {
      ...state,
      updatedAt: Date.now(),
    };

    this.latestLocalState = next;
    this.playerStates.set(next.playerId, next);
    this.emitPlayers();
    this.channel.postMessage({
      type: "player-state",
      payload: next,
    } satisfies LocalMessage);
  }

  async setBlockState(
    change: Omit<MultiplayerBlockState, "updatedAt">
  ): Promise<void> {
    const next: MultiplayerBlockState = {
      ...change,
      updatedAt: Date.now(),
    };

    writeLocalBlock(this.session.code, next);
    this.emitBlock(next);
    this.channel.postMessage({
      type: "block-state",
      payload: next,
    } satisfies LocalMessage);
  }

  async upsertDrop(drop: MultiplayerDropState): Promise<void> {
    writeLocalDrop(this.session.code, drop);
    this.emitDrop({ type: "upsert", drop });
    this.channel.postMessage({
      type: "drop-upsert",
      payload: drop,
    } satisfies LocalMessage);
  }

  async removeDrop(dropId: string): Promise<boolean> {
    const removed = deleteLocalDrop(this.session.code, dropId);
    if (!removed) return false;

    this.emitDrop({ type: "remove", dropId });
    this.channel.postMessage({
      type: "drop-remove",
      dropId,
    } satisfies LocalMessage);
    return true;
  }

  async loadWorldState(): Promise<Map<string, Uint8Array>> {
    return readLocalWorldState(this.session.code);
  }

  async saveWorldState(chunks: Map<string, Uint8Array>): Promise<void> {
    writeLocalWorldState(this.session.code, chunks);
  }

  async close(): Promise<void> {
    this.channel.postMessage({
      type: "player-leave",
      playerId: this.identity.playerId,
    } satisfies LocalMessage);
    this.channel.removeEventListener("message", this.handleMessage);
    this.channel.close();
  }

  private readonly handleMessage = (event: MessageEvent<LocalMessage>): void => {
    const message = event.data;
    if (!message) return;

    if (message.type === "hello-request") {
      if (message.playerId !== this.identity.playerId && this.latestLocalState) {
        this.channel.postMessage({
          type: "player-state",
          payload: this.latestLocalState,
        } satisfies LocalMessage);
      }
      return;
    }

    if (message.type === "player-state") {
      this.playerStates.set(message.payload.playerId, message.payload);
      this.emitPlayers();
      return;
    }

    if (message.type === "player-leave") {
      this.playerStates.delete(message.playerId);
      this.emitPlayers();
      return;
    }

    if (message.type === "block-state") {
      writeLocalBlock(this.session.code, message.payload);
      this.emitBlock(message.payload);
      return;
    }

    if (message.type === "drop-upsert") {
      writeLocalDrop(this.session.code, message.payload);
      this.emitDrop({ type: "upsert", drop: message.payload });
      return;
    }

    if (message.type === "drop-remove") {
      deleteLocalDrop(this.session.code, message.dropId);
      this.emitDrop({ type: "remove", dropId: message.dropId });
    }
  };

  private emitPlayers(): void {
    const players = this.getSortedPlayers();
    for (const listener of this.playerListeners) {
      listener(players);
    }
  }

  private emitBlock(change: MultiplayerBlockState): void {
    for (const listener of this.blockListeners) {
      listener(change);
    }
  }

  private emitDrop(event: MultiplayerDropEvent): void {
    for (const listener of this.dropListeners) {
      listener(event);
    }
  }

  private getSortedPlayers(): MultiplayerPlayerState[] {
    return [...this.playerStates.values()].sort((left, right) => {
      if (left.playerId === this.identity.playerId) return -1;
      if (right.playerId === this.identity.playerId) return 1;
      return left.name.localeCompare(right.name);
    });
  }
}

class CloudMultiplayerConnection implements MultiplayerConnection {
  readonly transport = "cloud" as const;

  private readonly playerListeners = new Set<
    (players: MultiplayerPlayerState[]) => void
  >();
  private readonly blockListeners = new Set<
    (change: MultiplayerBlockState) => void
  >();
  private readonly dropListeners = new Set<
    (event: MultiplayerDropEvent) => void
  >();
  private readonly cleanup: Array<() => void> = [];
  private latestPlayers: MultiplayerPlayerState[] = [];
  private readonly playerDocRef;
  private readonly playersColRef;
  private readonly blocksColRef;
  private readonly dropsColRef;
  private readonly worldStateColRef;

  constructor(
    readonly session: MultiplayerSessionMeta,
    private readonly identity: MultiplayerIdentity,
    private readonly database: Firestore
  ) {
    this.playerDocRef = doc(
      database,
      "multiplayerSessions",
      session.code,
      "players",
      identity.playerId
    );
    this.playersColRef = collection(
      database,
      "multiplayerSessions",
      session.code,
      "players"
    );
    this.blocksColRef = collection(
      database,
      "multiplayerSessions",
      session.code,
      "blocks"
    );
    this.dropsColRef = collection(
      database,
      "multiplayerSessions",
      session.code,
      "drops"
    );
    this.worldStateColRef = collection(
      database,
      "multiplayerSessions",
      session.code,
      "worldState"
    );

    this.cleanup.push(
      onSnapshot(this.playersColRef, (snapshot) => {
        const players = snapshot.docs
          .map((entry) => entry.data() as MultiplayerPlayerState)
          .sort((left, right) => {
            if (left.playerId === this.identity.playerId) return -1;
            if (right.playerId === this.identity.playerId) return 1;
            return left.name.localeCompare(right.name);
          });

        this.latestPlayers = players;
        for (const listener of this.playerListeners) {
          listener(players);
        }
      })
    );

    this.cleanup.push(
      onSnapshot(this.blocksColRef, (snapshot) => {
        for (const change of snapshot.docChanges()) {
          if (change.type === "removed") continue;
          const payload = change.doc.data() as MultiplayerBlockState;
          for (const listener of this.blockListeners) {
            listener(payload);
          }
        }
      })
    );

    this.cleanup.push(
      onSnapshot(this.dropsColRef, (snapshot) => {
        for (const change of snapshot.docChanges()) {
          if (change.type === "removed") {
            for (const listener of this.dropListeners) {
              listener({ type: "remove", dropId: change.doc.id });
            }
            continue;
          }

          const drop = change.doc.data() as MultiplayerDropState;
          for (const listener of this.dropListeners) {
            listener({ type: "upsert", drop });
          }
        }
      })
    );
  }

  subscribePlayers(
    callback: (players: MultiplayerPlayerState[]) => void
  ): () => void {
    this.playerListeners.add(callback);
    callback(this.latestPlayers);
    return () => {
      this.playerListeners.delete(callback);
    };
  }

  subscribeBlockChanges(
    callback: (change: MultiplayerBlockState) => void
  ): () => void {
    this.blockListeners.add(callback);
    return () => {
      this.blockListeners.delete(callback);
    };
  }

  subscribeDropEvents(
    callback: (event: MultiplayerDropEvent) => void
  ): () => void {
    this.dropListeners.add(callback);
    return () => {
      this.dropListeners.delete(callback);
    };
  }

  async setPlayerState(
    state: Omit<MultiplayerPlayerState, "updatedAt">
  ): Promise<void> {
    await setDoc(
      this.playerDocRef,
      {
        ...state,
        updatedAt: Date.now(),
      } satisfies MultiplayerPlayerState,
      { merge: true }
    );
  }

  async setBlockState(
    change: Omit<MultiplayerBlockState, "updatedAt">
  ): Promise<void> {
    const target = doc(
      this.blocksColRef,
      blockRecordKey(change.x, change.y, change.z).replaceAll(",", "_")
    );
    await setDoc(target, {
      ...change,
      updatedAt: Date.now(),
    } satisfies MultiplayerBlockState);
  }

  async upsertDrop(drop: MultiplayerDropState): Promise<void> {
    await setDoc(doc(this.dropsColRef, drop.dropId), drop);
  }

  async removeDrop(dropId: string): Promise<boolean> {
    const target = doc(this.dropsColRef, dropId);
    return runTransaction(this.database, async (transaction) => {
      const snapshot = await transaction.get(target);
      if (!snapshot.exists()) return false;
      transaction.delete(target);
      return true;
    });
  }

  async loadWorldState(): Promise<Map<string, Uint8Array>> {
    const snapshot = await getDocs(this.worldStateColRef);
    const chunks = new Map<string, Uint8Array>();
    for (const entry of snapshot.docs) {
      const payload = entry.data() as { data: string };
      chunks.set(entry.id, decodeBytes(payload.data));
    }
    return chunks;
  }

  async saveWorldState(chunks: Map<string, Uint8Array>): Promise<void> {
    const batch = writeBatch(this.database);
    for (const [chunkKey, data] of chunks) {
      batch.set(doc(this.worldStateColRef, chunkKey), {
        data: encodeBytes(data),
        updatedAt: Date.now(),
      });
    }
    await batch.commit();
  }

  async close(): Promise<void> {
    for (const disposer of this.cleanup) {
      disposer();
    }
    this.cleanup.length = 0;

    try {
      await deleteDoc(this.playerDocRef);
    } catch {
      // Ignore disconnect cleanup failures.
    }
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Firestore timeout")), ms)
    ),
  ]);
}

async function createCloudSession(
  input: CreateSessionInput
): Promise<MultiplayerSessionMeta | null> {
  const database = firestore();
  if (!database) return null;

  const session: MultiplayerSessionMeta = {
    code: createSessionCode(false),
    seed: input.seed,
    worldType: input.worldType,
    worldName: input.worldName,
    hostName: input.hostName,
    createdAt: Date.now(),
    transport: "cloud",
  };

  await withTimeout(
    setDoc(doc(database, "multiplayerSessions", session.code), session),
    5000
  );
  return session;
}

function createLocalSession(input: CreateSessionInput): MultiplayerSessionMeta {
  const session: MultiplayerSessionMeta = {
    code: createSessionCode(true),
    seed: input.seed,
    worldType: input.worldType,
    worldName: input.worldName,
    hostName: input.hostName,
    createdAt: Date.now(),
    transport: "local",
  };

  writeLocalSession(session);
  return session;
}

export async function createMultiplayerSession(
  input: CreateSessionInput
): Promise<MultiplayerSessionMeta> {
  if (firebaseConfigured) {
    try {
      const cloud = await createCloudSession(input);
      if (cloud) {
        // Also write locally so same-browser joins always work
        writeLocalSession(cloud);
        return cloud;
      }
    } catch {
      // Fall back to same-browser sessions when cloud setup is unavailable.
    }
  }

  return createLocalSession(input);
}

export async function readMultiplayerSession(
  rawCode: string
): Promise<MultiplayerSessionMeta | null> {
  const code = normalizeSessionCode(rawCode);
  if (!code) return null;

  // Always check local first — fastest path and works for both local and cloud sessions
  const local = readLocalSession(code);
  if (local) return local;

  if (isLocalSessionCode(code) || !firebaseConfigured) {
    return null;
  }

  const database = firestore();
  if (!database) return null;

  try {
    const snapshot = await withTimeout(
      getDoc(doc(database, "multiplayerSessions", code)),
      5000
    );
    if (!snapshot.exists()) return null;

    const session = snapshot.data() as MultiplayerSessionMeta;
    // Cache locally so subsequent reads don't hit Firestore
    writeLocalSession(session);
    return session;
  } catch {
    return null;
  }
}

export async function connectMultiplayerSession(
  rawCode: string,
  identity: MultiplayerIdentity
): Promise<MultiplayerConnection> {
  const session = await readMultiplayerSession(rawCode);
  if (!session) {
    throw new Error("Session not found");
  }

  if (session.transport === "local") {
    return new LocalMultiplayerConnection(session, identity);
  }

  const database = firestore();
  if (!database) {
    throw new Error("Cloud multiplayer is not configured");
  }

  return new CloudMultiplayerConnection(session, identity, database);
}
