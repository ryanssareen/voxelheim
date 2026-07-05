import type { WorldType } from "@engine/world/constants";
import type { SkinColors } from "@store/useSkinStore";

export type MultiplayerTransport = "cloud" | "rtdb" | "local";

export interface MultiplayerSessionMeta {
  code: string;
  seed: string;
  worldType: WorldType;
  /** Island footprint in blocks. Absent on legacy sessions, which are 64. */
  islandSize?: number;
  worldName: string;
  hostName: string;
  createdAt: number;
  transport: MultiplayerTransport;
}

export interface MultiplayerPlayerState {
  playerId: string;
  name: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  isCrouching: boolean;
  /** Player's chosen skin colors. Absent on legacy states (falls back to a hashed skin). */
  skin?: SkinColors;
  /** Worn armor as 4 block ids [helmet, chestplate, leggings, boots]; 0 = empty. Absent on legacy states. */
  armor?: number[];
  updatedAt: number;
}

export interface MultiplayerBlockState {
  x: number;
  y: number;
  z: number;
  blockId: number;
  updatedAt: number;
  updatedBy: string;
}

export interface MultiplayerDropState {
  dropId: string;
  blockId: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  bobOffset: number;
  pickupDelay: number;
  createdAt: number;
}

export type MultiplayerDropEvent =
  | { type: "upsert"; drop: MultiplayerDropState }
  | { type: "remove"; dropId: string };

export type ChatMessageKind = "chat" | "death" | "system";

export interface MultiplayerChatMessage {
  id: string;
  playerId: string;
  name: string;
  text: string;
  kind: ChatMessageKind;
  createdAt: number;
}

/** Transient combat event — one player hitting another. Not persisted. */
export interface MultiplayerHitEvent {
  id: string;
  attackerId: string;
  attackerName: string;
  targetId: string;
  damage: number;
  fromX: number;
  fromZ: number;
  createdAt: number;
}

export interface MultiplayerIdentity {
  playerId: string;
  name: string;
}

export interface CreateSessionInput {
  seed: string;
  worldType: WorldType;
  /** Island footprint in blocks — required so joiners generate matching terrain. */
  islandSize?: number;
  worldName: string;
  hostName: string;
}

export interface MultiplayerConnection {
  readonly session: MultiplayerSessionMeta;
  readonly transport: MultiplayerTransport;
  subscribePlayers: (
    callback: (players: MultiplayerPlayerState[]) => void
  ) => () => void;
  subscribeBlockChanges: (
    callback: (change: MultiplayerBlockState) => void
  ) => () => void;
  subscribeDropEvents: (
    callback: (event: MultiplayerDropEvent) => void
  ) => () => void;
  subscribeChat: (
    callback: (message: MultiplayerChatMessage) => void
  ) => () => void;
  subscribeHits: (
    callback: (hit: MultiplayerHitEvent) => void
  ) => () => void;
  sendHit: (
    hit: Omit<MultiplayerHitEvent, "id" | "createdAt">
  ) => Promise<void>;
  setPlayerState: (
    state: Omit<MultiplayerPlayerState, "updatedAt">
  ) => Promise<void>;
  setBlockState: (
    change: Omit<MultiplayerBlockState, "updatedAt">
  ) => Promise<void>;
  sendChatMessage: (
    message: Omit<MultiplayerChatMessage, "id" | "createdAt">
  ) => Promise<void>;
  upsertDrop: (drop: MultiplayerDropState) => Promise<void>;
  removeDrop: (dropId: string) => Promise<boolean>;
  loadWorldState: () => Promise<Map<string, Uint8Array>>;
  saveWorldState: (chunks: Map<string, Uint8Array>) => Promise<void>;
  close: () => Promise<void>;
}
