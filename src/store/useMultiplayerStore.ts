import { create } from "zustand";
import type { MultiplayerPlayerState, MultiplayerSessionMeta, MultiplayerTransport } from "@lib/multiplayer/types";

export type MultiplayerStatus = "idle" | "connecting" | "connected" | "error";

interface MultiplayerState {
  status: MultiplayerStatus;
  error: string | null;
  session: MultiplayerSessionMeta | null;
  transport: MultiplayerTransport | null;
  players: MultiplayerPlayerState[];
  beginConnecting: () => void;
  setConnected: (session: MultiplayerSessionMeta) => void;
  setPlayers: (players: MultiplayerPlayerState[]) => void;
  setError: (message: string) => void;
  reset: () => void;
}

export const useMultiplayerStore = create<MultiplayerState>((set) => ({
  status: "idle",
  error: null,
  session: null,
  transport: null,
  players: [],

  beginConnecting: () =>
    set({
      status: "connecting",
      error: null,
      session: null,
      transport: null,
      players: [],
    }),

  setConnected: (session) =>
    set({
      status: "connected",
      error: null,
      session,
      transport: session.transport,
    }),

  setPlayers: (players) => set({ players }),

  setError: (message) =>
    set({
      status: "error",
      error: message,
      session: null,
      transport: null,
      players: [],
    }),

  reset: () =>
    set({
      status: "idle",
      error: null,
      session: null,
      transport: null,
      players: [],
    }),
}));
