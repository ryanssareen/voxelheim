import { create } from "zustand";
import {
  generateName,
  readPlayerNameOverride,
  resolvePlayerId,
  resolvePlayerName,
  writePlayerNameOverride,
} from "@lib/identity";
import { useAuthStore } from "@store/useAuthStore";

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

function snapshot() {
  const playerId = resolvePlayerId();
  return {
    playerId,
    playerName: resolvePlayerName(),
    generatedName: generateName(playerId),
    nameOverride: readPlayerNameOverride(),
  };
}

export const useIdentityStore = create<IdentityState>((set) => ({
  ...snapshot(),
  setPlayerName: (name: string) => {
    writePlayerNameOverride(name);
    set(snapshot());
  },
}));

// Auth hydrates in an effect, after this module is evaluated. Without this the
// store would keep a guest id for a signed-in player while MultiplayerManager
// (constructed later) resolves the auth uid -- two names for one player.
useAuthStore.subscribe((state, prev) => {
  if (state.user?.uid !== prev.user?.uid) {
    useIdentityStore.setState(snapshot());
  }
});
