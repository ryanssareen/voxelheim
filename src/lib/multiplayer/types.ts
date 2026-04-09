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
  setPlayerState: (
    state: Omit<MultiplayerPlayerState, "updatedAt">
  ) => Promise<void>;
  setBlockState: (
    change: Omit<MultiplayerBlockState, "updatedAt">
  ) => Promise<void>;
  close: () => Promise<void>;
}
