import { create } from "zustand";
import { BLOCK_ID } from "@data/blocks";

const MAX_STACK = 64;
const SLOT_COUNT = 8;

export interface ItemStack {
  blockId: number;
  count: number;
}

interface HotbarState {
  selectedIndex: number;
  slots: ItemStack[];
  select: (index: number) => void;
  scrollUp: () => void;
  scrollDown: () => void;
  getSelectedBlockId: () => number;
  /** Add a block to the hotbar. Returns false if inventory is full. */
  addItem: (blockId: number) => boolean;
  /** Remove one item from the selected slot. Returns the block ID removed, or AIR if empty. */
  removeSelectedItem: () => number;
  /** Reset all slots to empty. */
  resetSlots: () => void;
}

function emptySlots(): ItemStack[] {
  return Array.from({ length: SLOT_COUNT }, () => ({
    blockId: BLOCK_ID.AIR,
    count: 0,
  }));
}

export const useHotbarStore = create<HotbarState>((set, get) => ({
  selectedIndex: 0,
  slots: emptySlots(),

  select: (index: number) =>
    set({ selectedIndex: Math.max(0, Math.min(SLOT_COUNT - 1, index)) }),

  scrollUp: () => {
    const { selectedIndex } = get();
    set({ selectedIndex: (selectedIndex + SLOT_COUNT - 1) % SLOT_COUNT });
  },

  scrollDown: () => {
    const { selectedIndex } = get();
    set({ selectedIndex: (selectedIndex + 1) % SLOT_COUNT });
  },

  getSelectedBlockId: () => {
    const { slots, selectedIndex } = get();
    const slot = slots[selectedIndex];
    return slot.count > 0 ? slot.blockId : BLOCK_ID.AIR;
  },

  addItem: (blockId: number) => {
    const { slots } = get();
    // First pass: find existing stack of same type with space
    for (let i = 0; i < SLOT_COUNT; i++) {
      if (slots[i].blockId === blockId && slots[i].count < MAX_STACK) {
        const newSlots = [...slots];
        newSlots[i] = { blockId, count: slots[i].count + 1 };
        set({ slots: newSlots });
        return true;
      }
    }
    // Second pass: find empty slot
    for (let i = 0; i < SLOT_COUNT; i++) {
      if (slots[i].count === 0) {
        const newSlots = [...slots];
        newSlots[i] = { blockId, count: 1 };
        set({ slots: newSlots });
        return true;
      }
    }
    return false; // Full
  },

  removeSelectedItem: () => {
    const { slots, selectedIndex } = get();
    const slot = slots[selectedIndex];
    if (slot.count <= 0) return BLOCK_ID.AIR;
    const blockId = slot.blockId;
    const newSlots = [...slots];
    if (slot.count === 1) {
      newSlots[selectedIndex] = { blockId: BLOCK_ID.AIR, count: 0 };
    } else {
      newSlots[selectedIndex] = { blockId, count: slot.count - 1 };
    }
    set({ slots: newSlots });
    return blockId;
  },

  resetSlots: () => set({ slots: emptySlots(), selectedIndex: 0 }),
}));
