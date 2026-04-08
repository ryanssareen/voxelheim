import { create } from "zustand";

export type DeathCause =
  | "void"
  | "fall"
  | "zombie"
  | "skeleton"
  | "creeper"
  | "starvation";

interface GameState {
  shardsCollected: number;
  shardsTotal: number;
  isComplete: boolean;
  isPaused: boolean;
  isDead: boolean;
  deathMessage: string;
  breakProgress: number;
  timeOfDay: number;
  health: number;
  maxHealth: number;
  hunger: number;
  maxHunger: number;
  lastDamageTime: number;
  lastDamageCause: DeathCause | null;
  collectShard: () => void;
  resetObjective: () => void;
  setPaused: (paused: boolean) => void;
  setDead: (dead: boolean) => void;
  setBreakProgress: (progress: number) => void;
  setTimeOfDay: (t: number) => void;
  setHealth: (h: number) => void;
  setHunger: (h: number) => void;
  damagePlayer: (amount: number, cause?: DeathCause) => void;
  killPlayer: (cause: DeathCause) => void;
  respawnPlayer: () => void;
}

const DEATH_MESSAGES: Record<DeathCause, string[]> = {
  void: ["Player left the confines of this world", "Player fell out of the world", "Player discovered the void"],
  fall: ["Player fell from a high place", "Player hit the ground too hard", "Player didn't bounce"],
  zombie: ["Player was slain by Zombie", "Player was eaten by Zombie"],
  skeleton: ["Player was shot by Skeleton", "Player was sniped by Skeleton"],
  creeper: ["Player was blown up by Creeper", "Player hugged a Creeper"],
  starvation: ["Player starved to death", "Player forgot to eat"],
};

function getDeathMessage(cause: DeathCause): string {
  const messages = DEATH_MESSAGES[cause];
  return messages[Math.floor(Math.random() * messages.length)];
}

/** Global game state: objectives, pause, death, break progress, health, hunger. */
export const useGameStore = create<GameState>((set, get) => ({
  shardsCollected: 0,
  shardsTotal: 5,
  isComplete: false,
  isPaused: false,
  isDead: false,
  deathMessage: "",
  breakProgress: 0,
  timeOfDay: 0,
  health: 20,
  maxHealth: 20,
  hunger: 20,
  maxHunger: 20,
  lastDamageTime: 0,
  lastDamageCause: null,

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

  damagePlayer: (amount: number, cause?: DeathCause) => {
    const { health } = get();
    const newHealth = Math.max(0, health - amount);
    set({ health: newHealth, lastDamageTime: performance.now(), lastDamageCause: cause ?? get().lastDamageCause });
    if (newHealth <= 0) {
      const deathCause = cause ?? get().lastDamageCause ?? "void";
      set({ isDead: true, deathMessage: getDeathMessage(deathCause) });
    }
  },

  killPlayer: (cause: DeathCause) => {
    set({ health: 0, isDead: true, deathMessage: getDeathMessage(cause), lastDamageTime: performance.now() });
  },

  respawnPlayer: () =>
    set({ health: 20, hunger: 20, isDead: false, deathMessage: "", lastDamageTime: 0, lastDamageCause: null }),
}));
