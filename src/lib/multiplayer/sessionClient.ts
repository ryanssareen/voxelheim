import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  setDoc,
  type Firestore,
} from "firebase/firestore";
import { firestore, firebaseConfigured } from "@lib/firebase";
import { createSessionCode, isLocalSessionCode, normalizeSessionCode } from "@lib/multiplayer/sessionCode";
import type {
  CreateSessionInput,
  MultiplayerBlockState,
  MultiplayerConnection,
  MultiplayerIdentity,
  MultiplayerPlayerState,
  MultiplayerSessionMeta,
} from "@lib/multiplayer/types";

const LOCAL_SESSION_PREFIX = "voxelheim-mp-session:";
const LOCAL_BLOCK_PREFIX = "voxelheim-mp-blocks:";
const CHANNEL_PREFIX = "voxelheim-mp:";

type LocalBlockMap = Record<string, MultiplayerBlockState>;

type LocalMessage =
  | { type: "hello-request"; playerId: string }
  | { type: "player-state"; payload: MultiplayerPlayerState }
  | { type: "player-leave"; playerId: string }
  | { type: "block-state"; payload: MultiplayerBlockState };

function sessionStorageKey(code: string): string {
  return `${LOCAL_SESSION_PREFIX}${code}`;
}

function blockStorageKey(code: string): string {
  return `${LOCAL_BLOCK_PREFIX}${code}`;
}

function blockRecordKey(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

function readLocalSession(code: string): MultiplayerSessionMeta | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(sessionStorageKey(code));
    return raw ? (JSON.parse(raw) as MultiplayerSessionMeta) : null;
  } catch {
    return null;
  }
}

function writeLocalSession(session: MultiplayerSessionMeta): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(sessionStorageKey(session.code), JSON.stringify(session));
}

function readLocalBlocks(code: string): LocalBlockMap {
  if (typeof window === "undefined") return {};

  try {
    const raw = window.localStorage.getItem(blockStorageKey(code));
    return raw ? (JSON.parse(raw) as LocalBlockMap) : {};
  } catch {
    return {};
  }
}

function writeLocalBlock(code: string, change: MultiplayerBlockState): void {
  if (typeof window === "undefined") return;

  const existing = readLocalBlocks(code);
  existing[blockRecordKey(change.x, change.y, change.z)] = change;
  window.localStorage.setItem(blockStorageKey(code), JSON.stringify(existing));
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
    this.channel.postMessage({ type: "player-state", payload: next } satisfies LocalMessage);
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
    this.channel.postMessage({ type: "block-state", payload: next } satisfies LocalMessage);
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
  private readonly cleanup: Array<() => void> = [];
  private latestPlayers: MultiplayerPlayerState[] = [];
  private readonly playerDocRef;
  private readonly playersColRef;
  private readonly blocksColRef;

  constructor(
    readonly session: MultiplayerSessionMeta,
    private readonly identity: MultiplayerIdentity,
    database: Firestore
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

  await setDoc(doc(database, "multiplayerSessions", session.code), session);
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
      if (cloud) return cloud;
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

  if (isLocalSessionCode(code) || !firebaseConfigured) {
    return readLocalSession(code);
  }

  const database = firestore();
  if (!database) return null;

  const snapshot = await getDoc(doc(database, "multiplayerSessions", code));
  if (!snapshot.exists()) return null;

  return snapshot.data() as MultiplayerSessionMeta;
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
