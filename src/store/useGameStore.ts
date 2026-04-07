import { create } from "zustand";

interface GameState {
  shardsCollected: number;
  shardsTotal: number;
  isComplete: boolean;
  isPaused: boolean;
  isDead: boolean;
  breakProgress: number;
  timeOfDay: number;
  health: number;
  maxHealth: number;
  hunger: number;
  maxHunger: number;
  lastDamageTime: number;
  collectShard: () => void;
  resetObjective: () => void;
  setPaused: (paused: boolean) => void;
  setDead: (dead: boolean) => void;
  setBreakProgress: (progress: number) => void;
  setTimeOfDay: (t: number) => void;
  setHealth: (h: number) => void;
  setHunger: (h: number) => void;
  damagePlayer: (amount: number) => void;
  respawnPlayer: () => void;
}

/** Global game state: objectives, pause, death, break progress, health, hunger. */
export const useGameStore = create<GameState>((set, get) => ({
  shardsCollected: 0,
  shardsTotal: 5,
  isComplete: false,
  isPaused: false,
  isDead: false,
  breakProgress: 0,
  timeOfDay: 0,
  health: 20,
  maxHealth: 20,
  hunger: 20,
  maxHunger: 20,
  lastDamageTime: 0,

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
  setHealth: (h: number) => set({ health: Math.max(0, Math.min(h, get().maxHealth)) }),
  setHunger: (h: number) => set({ hunger: Math.max(0, Math.min(h, get().maxHunger)) }),

  damagePlayer: (amount: number) => {
    const { health } = get();
    const newHealth = Math.max(0, health - amount);
    set({ health: newHealth, lastDamageTime: performance.now() });
    if (newHealth <= 0) {
      set({ isDead: true });
    }
  },

  respawnPlayer: () =>
    set({ health: 20, hunger: 20, isDead: false, lastDamageTime: 0 }),
}));
