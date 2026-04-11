import { create } from "zustand";
import { useHotbarStore } from "@store/useHotbarStore";

interface InventoryState {
  isOpen: boolean;
  /** 2x2 crafting grid: [TL, TR, BL, BR] as { blockId, count } */
  craftingGrid: Array<{ blockId: number; count: number; durability?: number }>;
  /** Currently held item on cursor (from clicking a slot) */
  cursorItem: { blockId: number; count: number; durability?: number };
  /** Whether the 3x3 crafting table UI is open */
  tableOpen: boolean;
  /** 3x3 crafting table grid (9 slots, row-major) */
  tableGrid: Array<{ blockId: number; count: number; durability?: number }>;
  /** Whether the furnace UI is open */
  furnaceOpen: boolean;
  /** Furnace slots: [input, fuel] */
  furnaceSlots: Array<{ blockId: number; count: number }>;
  /** Whether the creative inventory is open */
  creativeOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  setCraftingSlot: (index: number, blockId: number, count: number) => void;
  clearCraftingGrid: () => void;
  setCursorItem: (blockId: number, count: number, durability?: number) => void;
  clearCursor: () => void;
  openTable: () => void;
  closeTable: () => void;
  setTableSlot: (index: number, blockId: number, count: number) => void;
  openFurnace: () => void;
  closeFurnace: () => void;
  setFurnaceSlot: (index: number, blockId: number, count: number) => void;
  openCreative: () => void;
  closeCreative: () => void;
}

function emptyGrid() {
  return [
    { blockId: 0, count: 0 },
    { blockId: 0, count: 0 },
    { blockId: 0, count: 0 },
    { blockId: 0, count: 0 },
  ];
}

function emptyTableGrid() {
  return Array.from({ length: 9 }, () => ({ blockId: 0, count: 0 }));
}

function emptyFurnaceSlots() {
  return [{ blockId: 0, count: 0 }, { blockId: 0, count: 0 }];
}

/** Return all non-empty items to the player's hotbar/inventory. */
function returnItemsToHotbar(
  slots: Array<{ blockId: number; count: number; durability?: number }>,
  cursor: { blockId: number; count: number; durability?: number }
): void {
  const hotbar = useHotbarStore.getState();
  for (const slot of slots) {
    for (let i = 0; i < slot.count; i++) {
      if (slot.blockId !== 0) hotbar.addItem(slot.blockId);
    }
  }
  for (let i = 0; i < cursor.count; i++) {
    if (cursor.blockId !== 0) hotbar.addItem(cursor.blockId);
  }
}

export const useInventoryStore = create<InventoryState>((set) => ({
  isOpen: false,
  craftingGrid: emptyGrid(),
  cursorItem: { blockId: 0, count: 0 },
  tableOpen: false,
  tableGrid: emptyTableGrid(),
  furnaceOpen: false,
  furnaceSlots: emptyFurnaceSlots(),
  creativeOpen: false,

  open: () => set({ isOpen: true }),
  close: () =>
    set((state) => {
      returnItemsToHotbar(state.craftingGrid, state.cursorItem);
      return { isOpen: false, craftingGrid: emptyGrid(), cursorItem: { blockId: 0, count: 0 } };
    }),
  toggle: () =>
    set((state) => {
      if (state.isOpen) returnItemsToHotbar(state.craftingGrid, state.cursorItem);
      return {
        isOpen: !state.isOpen,
        ...(!state.isOpen ? {} : { craftingGrid: emptyGrid(), cursorItem: { blockId: 0, count: 0 } }),
      };
    }),

  setCraftingSlot: (index, blockId, count) =>
    set((state) => {
      const grid = [...state.craftingGrid];
      grid[index] = { blockId, count };
      return { craftingGrid: grid };
    }),

  clearCraftingGrid: () => set({ craftingGrid: emptyGrid() }),

  setCursorItem: (blockId, count, durability) =>
    set({ cursorItem: { blockId, count, durability } }),

  clearCursor: () => set({ cursorItem: { blockId: 0, count: 0 } }),

  openTable: () => set({ tableOpen: true, tableGrid: emptyTableGrid(), cursorItem: { blockId: 0, count: 0 } }),
  closeTable: () =>
    set((state) => {
      returnItemsToHotbar(state.tableGrid, state.cursorItem);
      return { tableOpen: false, tableGrid: emptyTableGrid(), cursorItem: { blockId: 0, count: 0 } };
    }),

  setTableSlot: (index, blockId, count) =>
    set((state) => {
      const grid = [...state.tableGrid];
      grid[index] = { blockId, count };
      return { tableGrid: grid };
    }),

  openFurnace: () => set({ furnaceOpen: true, furnaceSlots: emptyFurnaceSlots(), cursorItem: { blockId: 0, count: 0 } }),
  closeFurnace: () =>
    set((state) => {
      returnItemsToHotbar(state.furnaceSlots, state.cursorItem);
      return { furnaceOpen: false, furnaceSlots: emptyFurnaceSlots(), cursorItem: { blockId: 0, count: 0 } };
    }),

  setFurnaceSlot: (index, blockId, count) =>
    set((state) => {
      const slots = [...state.furnaceSlots];
      slots[index] = { blockId, count };
      return { furnaceSlots: slots };
    }),

  openCreative: () => set({ creativeOpen: true }),
  closeCreative: () => set({ creativeOpen: false }),
}));
