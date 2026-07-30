import { create } from "zustand";
import {
  resolvePlayerId,
  resolvePlayerName,
  writePlayerNameOverride,
} from "@lib/identity";

interface IdentityState {
  playerId: string;
  playerName: string;
  /** Empty or whitespace-only clears the override and restores the generated name. */
  setPlayerName: (name: string) => void;
}

export const useIdentityStore = create<IdentityState>((set) => ({
  playerId: resolvePlayerId(),
  playerName: resolvePlayerName(),
  setPlayerName: (name: string) => {
    writePlayerNameOverride(name);
    set({ playerName: resolvePlayerName() });
  },
}));
