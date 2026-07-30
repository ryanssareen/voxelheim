import { create } from "zustand";
import {
  generateName,
  readPlayerNameOverride,
  resolvePlayerId,
  resolvePlayerName,
  writePlayerNameOverride,
} from "@lib/identity";

interface IdentityState {
  playerId: string;
  /** Effective display name: the override when set, otherwise generated. */
  playerName: string;
  /** The generated name, shown as placeholder when no override is set. */
  generatedName: string;
  /** null when the player has not chosen a custom name. */
  nameOverride: string | null;
  /** Empty or whitespace-only clears the override and restores the generated name. */
  setPlayerName: (name: string) => void;
}

export const useIdentityStore = create<IdentityState>((set) => {
  const playerId = resolvePlayerId();
  return {
    playerId,
    playerName: resolvePlayerName(),
    generatedName: generateName(playerId),
    nameOverride: readPlayerNameOverride(),
    setPlayerName: (name: string) => {
      const override = writePlayerNameOverride(name);
      set({ nameOverride: override, playerName: resolvePlayerName() });
    },
  };
});
