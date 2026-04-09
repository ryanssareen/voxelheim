import type { WorldType } from "@engine/world/constants";

export type MultiplayerTransport = "cloud" | "local";

export interface MultiplayerSessionMeta {
  code: string;
  seed: string;
  worldType: WorldType;
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

export interface MultiplayerIdentity {
  playerId: string;
  name: string;
}

export interface CreateSessionInput {
  seed: string;
  worldType: WorldType;
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
  setPlayerState: (
    state: Omit<MultiplayerPlayerState, "updatedAt">
  ) => Promise<void>;
  setBlockState: (
    change: Omit<MultiplayerBlockState, "updatedAt">
  ) => Promise<void>;
  upsertDrop: (drop: MultiplayerDropState) => Promise<void>;
  removeDrop: (dropId: string) => Promise<boolean>;
  loadWorldState: () => Promise<Map<string, Uint8Array>>;
  saveWorldState: (chunks: Map<string, Uint8Array>) => Promise<void>;
  close: () => Promise<void>;
}
