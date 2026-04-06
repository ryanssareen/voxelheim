import { create } from "zustand";
import { BLOCK_ID } from "@data/blocks";

const MAX_STACK = 64;
const HOTBAR_SLOTS = 9;
const INVENTORY_SLOTS = 27;
const TOTAL_SLOTS = HOTBAR_SLOTS + INVENTORY_SLOTS; // 36
const ARMOR_SLOTS = 4;

export interface ItemStack {
  blockId: number;
  count: number;
}

interface HotbarState {
  selectedIndex: number;
  /** First 9 = hotbar, next 27 = main inventory grid */
  slots: ItemStack[];
  /** 4 armor slots: helmet, chestplate, leggings, boots */
  armor: ItemStack[];
  select: (index: number) => void;
  scrollUp: () => void;
  scrollDown: () => void;
  getSelectedBlockId: () => number;
  addItem: (blockId: number) => boolean;
  removeSelectedItem: () => number;
  resetSlots: () => void;
}

function emptySlots(): ItemStack[] {
  return Array.from({ length: TOTAL_SLOTS }, () => ({
    blockId: BLOCK_ID.AIR,
    count: 0,
  }));
}

function emptyArmor(): ItemStack[] {
  return Array.from({ length: ARMOR_SLOTS }, () => ({
    blockId: BLOCK_ID.AIR,
    count: 0,
  }));
}

export const useHotbarStore = create<HotbarState>((set, get) => ({
  selectedIndex: 0,
  slots: emptySlots(),
  armor: emptyArmor(),

  select: (index: number) =>
    set({ selectedIndex: Math.max(0, Math.min(HOTBAR_SLOTS - 1, index)) }),

  scrollUp: () => {
    const { selectedIndex } = get();
    set({ selectedIndex: (selectedIndex + HOTBAR_SLOTS - 1) % HOTBAR_SLOTS });
  },

  scrollDown: () => {
    const { selectedIndex } = get();
    set({ selectedIndex: (selectedIndex + 1) % HOTBAR_SLOTS });
  },

  getSelectedBlockId: () => {
    const { slots, selectedIndex } = get();
    const slot = slots[selectedIndex];
    return slot.count > 0 ? slot.blockId : BLOCK_ID.AIR;
  },

  addItem: (blockId: number) => {
    const { slots } = get();
    // First: stack in existing matching slot (hotbar first, then inventory)
    for (let i = 0; i < TOTAL_SLOTS; i++) {
      if (slots[i].blockId === blockId && slots[i].count < MAX_STACK) {
        const newSlots = [...slots];
        newSlots[i] = { blockId, count: slots[i].count + 1 };
        set({ slots: newSlots });
        return true;
      }
    }
    // Second: find first empty slot (hotbar first, then inventory)
    for (let i = 0; i < TOTAL_SLOTS; i++) {
      if (slots[i].count === 0) {
        const newSlots = [...slots];
        newSlots[i] = { blockId, count: 1 };
        set({ slots: newSlots });
        return true;
      }
    }
    return false;
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

  resetSlots: () =>
    set({ slots: emptySlots(), armor: emptyArmor(), selectedIndex: 0 }),
}));

export { HOTBAR_SLOTS, INVENTORY_SLOTS, TOTAL_SLOTS, ARMOR_SLOTS };
