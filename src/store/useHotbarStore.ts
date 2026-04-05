import { create } from "zustand";
import { BLOCK_ID } from "@data/blocks";

interface HotbarState {
  selectedIndex: number;
  slots: number[];
  select: (index: number) => void;
  scrollUp: () => void;
  scrollDown: () => void;
  getSelectedBlockId: () => number;
}

/** Hotbar state: 8 block type slots with selection cycling. */
export const useHotbarStore = create<HotbarState>((set, get) => ({
  selectedIndex: 0,
  slots: [
    BLOCK_ID.GRASS,
    BLOCK_ID.DIRT,
    BLOCK_ID.STONE,
    BLOCK_ID.SAND,
    BLOCK_ID.LOG,
    BLOCK_ID.LEAVES,
    BLOCK_ID.CRYSTAL,
    BLOCK_ID.AIR,
  ],

  select: (index: number) => set({ selectedIndex: Math.max(0, Math.min(7, index)) }),

  scrollUp: () => {
    const { selectedIndex } = get();
    set({ selectedIndex: (selectedIndex + 7) % 8 });
  },

  scrollDown: () => {
    const { selectedIndex } = get();
    set({ selectedIndex: (selectedIndex + 1) % 8 });
  },

  getSelectedBlockId: () => {
    const { slots, selectedIndex } = get();
    return slots[selectedIndex];
  },
}));
