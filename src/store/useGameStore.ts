import { create } from "zustand";
import { getArmorDef } from "@data/items";
import { useHotbarStore } from "@store/useHotbarStore";
import { BLOCK_ID } from "@data/blocks";

export type DeathCause =
  | "void"
  | "fall"
  | "zombie"
  | "skeleton"
  | "creeper"
  | "starvation";

export type GameMode = "survival" | "creative" | "hardcore";

interface GameState {
  gameMode: GameMode;
  hardcoreLocked: boolean;
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
  setGameMode: (mode: GameMode) => void;
  setHardcoreLocked: (locked: boolean) => void;
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
  void: [
    "Player left the confines of this world",
    "Player fell out of the world",
    "Player discovered the void",
    "Player thought Terraria had no fall damage",
    "Player wanted to see what was under the map",
    "Player tried to speedrun to the backrooms",
  ],
  fall: [
    "Player fell from a high place",
    "Player hit the ground too hard",
    "Player didn't bounce",
    "Player thought gravity was a myth",
    "Player believed they could fly",
    "Player forgot this isn't creative mode",
    "Player tested the fall damage. It works.",
    "Player tried to MLG water bucket... without the water",
    "Player's legs disagreed with the landing",
    "Player discovered that voxels are not soft",
  ],
  zombie: [
    "Player was slain by Zombie",
    "Player was eaten by Zombie",
    "Player tried to reason with a Zombie",
    "Player forgot Zombies don't accept apologies",
    "Player thought Zombies just wanted a hug",
  ],
  skeleton: [
    "Player was shot by Skeleton",
    "Player was sniped by Skeleton",
    "Player brought fists to a bow fight",
    "Player thought they could dodge arrows",
    "Player forgot to strafe",
  ],
  creeper: [
    "Player was blown up by Creeper",
    "Player hugged a Creeper",
    "Player heard 'ssssss' and chose to investigate",
    "Player thought Creepers were just misunderstood",
    "Player learned what that hissing sound meant",
    "Player and Creeper had an explosive friendship",
  ],
  starvation: [
    "Player starved to death",
    "Player forgot to eat",
    "Player was on an involuntary diet",
    "Player thought hunger was just a suggestion",
    "Player's meal prep game was nonexistent",
  ],
};

function getDeathMessage(cause: DeathCause): string {
  const messages = DEATH_MESSAGES[cause];
  return messages[Math.floor(Math.random() * messages.length)];
}

/** Global game state: objectives, pause, death, break progress, health, hunger. */
export const useGameStore = create<GameState>((set, get) => ({
  gameMode: "survival" as GameMode,
  hardcoreLocked: false,
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

  setGameMode: (mode: GameMode) => set({ gameMode: mode }),
  setHardcoreLocked: (locked: boolean) => set({ hardcoreLocked: locked }),

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
    if (get().gameMode === "creative") return;

    // Apply armor damage reduction (starvation & void bypass armor)
    const bypassArmor = cause === "starvation" || cause === "void";
    let finalAmount = amount;
    if (!bypassArmor) {
      const armor = useHotbarStore.getState().armor;
      let reduction = 0;
      for (const slot of armor) {
        if (slot.count > 0) {
          const def = getArmorDef(slot.blockId);
          if (def) reduction += def.damageReduction;
        }
      }
      reduction = Math.min(0.8, reduction);
      finalAmount = Math.max(1, Math.round(amount * (1 - reduction)));
      // Wear armor durability — 1 point per damage event per worn piece
      if (reduction > 0) {
        const newArmor = armor.map((slot) => {
          if (slot.count <= 0 || slot.durability === undefined) return slot;
          const nextDur = slot.durability - 1;
          if (nextDur <= 0) return { blockId: BLOCK_ID.AIR, count: 0 };
          return { ...slot, durability: nextDur };
        });
        useHotbarStore.setState({ armor: newArmor });
      }
    }

    const { health } = get();
    const newHealth = Math.max(0, health - finalAmount);
    set({ health: newHealth, lastDamageTime: performance.now(), lastDamageCause: cause ?? get().lastDamageCause });
    if (newHealth <= 0) {
      const deathCause = cause ?? get().lastDamageCause ?? "void";
      const locked = get().gameMode === "hardcore";
      set({ isDead: true, deathMessage: getDeathMessage(deathCause), hardcoreLocked: locked });
    }
  },

  killPlayer: (cause: DeathCause) => {
    if (get().gameMode === "creative") return;
    const locked = get().gameMode === "hardcore";
    set({ health: 0, isDead: true, deathMessage: getDeathMessage(cause), lastDamageTime: performance.now(), hardcoreLocked: locked });
  },

  respawnPlayer: () =>
    set({ health: 20, hunger: 20, isDead: false, deathMessage: "", lastDamageTime: 0, lastDamageCause: null }),
}));
