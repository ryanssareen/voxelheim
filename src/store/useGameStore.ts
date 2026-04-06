import { create } from "zustand";

interface GameState {
  shardsCollected: number;
  shardsTotal: number;
  isComplete: boolean;
  isPaused: boolean;
  isDead: boolean;
  breakProgress: number;
  timeOfDay: number;
  collectShard: () => void;
  resetObjective: () => void;
  setPaused: (paused: boolean) => void;
  setDead: (dead: boolean) => void;
  setBreakProgress: (progress: number) => void;
  setTimeOfDay: (t: number) => void;
}

/** Global game state: objectives, pause, death, break progress. */
export const useGameStore = create<GameState>((set, get) => ({
  shardsCollected: 0,
  shardsTotal: 5,
  isComplete: false,
  isPaused: false,
  isDead: false,
  breakProgress: 0,
  timeOfDay: 0,

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
  setDead: (dead: boolean) => set({ isDead: dead }),
  setBreakProgress: (progress: number) => set({ breakProgress: progress }),
  setTimeOfDay: (t: number) => set({ timeOfDay: t }),
}));
