import { create } from "zustand";

interface GameState {
  shardsCollected: number;
  shardsTotal: number;
  isComplete: boolean;
  isPaused: boolean;
  collectShard: () => void;
  resetObjective: () => void;
  setPaused: (paused: boolean) => void;
}

/** Global game state: crystal shard objective and pause state. */
export const useGameStore = create<GameState>((set, get) => ({
  shardsCollected: 0,
  shardsTotal: 5,
  isComplete: false,
  isPaused: false,

  collectShard: () => {
    const { shardsCollected, shardsTotal } = get();
    const newCount = shardsCollected + 1;
    set({
      shardsCollected: newCount,
      isComplete: newCount >= shardsTotal,
    });
  },

  resetObjective: () =>
    set({ shardsCollected: 0, isComplete: false }),

  setPaused: (paused: boolean) => set({ isPaused: paused }),
}));
