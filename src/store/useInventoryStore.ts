import { create } from "zustand";
import { useHotbarStore, type ItemStack } from "@store/useHotbarStore";
import { returnToPlayer } from "@systems/inventory/returns";

interface InventoryState {
  isOpen: boolean;
  /** 2x2 crafting grid: [TL, TR, BL, BR] */
  craftingGrid: ItemStack[];
  /** Currently held item on cursor (from clicking a slot) */
  cursorItem: ItemStack;
  /** Whether the 3x3 crafting table UI is open */
  tableOpen: boolean;
  /** 3x3 crafting table grid (9 slots, row-major) */
  tableGrid: ItemStack[];
  /** Whether the furnace UI is open */
  furnaceOpen: boolean;
  /** Furnace slots: [input, fuel] */
  furnaceSlots: ItemStack[];
  /** Whether the creative inventory is open */
  creativeOpen: boolean;
  open: () => void;
  close: () => void;
  setCraftingSlot: (index: number, blockId: number, count: number, durability?: number) => void;
  clearCraftingGrid: () => void;
  setCursorItem: (blockId: number, count: number, durability?: number) => void;
  clearCursor: () => void;
  openTable: () => void;
  closeTable: () => void;
  setTableSlot: (index: number, blockId: number, count: number, durability?: number) => void;
  openFurnace: () => void;
  closeFurnace: () => void;
  setFurnaceSlot: (index: number, blockId: number, count: number, durability?: number) => void;
  openCreative: () => void;
  closeCreative: () => void;
  /** Resets every field to its initial value. Test hook. */
  reset: () => void;
}

function emptyGrid(): ItemStack[] {
  return [
    { blockId: 0, count: 0 },
    { blockId: 0, count: 0 },
    { blockId: 0, count: 0 },
    { blockId: 0, count: 0 },
  ];
}

function emptyTableGrid(): ItemStack[] {
  return Array.from({ length: 9 }, () => ({ blockId: 0, count: 0 }));
}

function emptyFurnaceSlots(): ItemStack[] {
  return [{ blockId: 0, count: 0 }, { blockId: 0, count: 0 }];
}

function emptyCursor(): ItemStack {
  return { blockId: 0, count: 0 };
}

const initialState = {
  isOpen: false,
  craftingGrid: emptyGrid(),
  cursorItem: emptyCursor(),
  tableOpen: false,
  tableGrid: emptyTableGrid(),
  furnaceOpen: false,
  furnaceSlots: emptyFurnaceSlots(),
  creativeOpen: false,
};

export const useInventoryStore = create<InventoryState>((set, get) => ({
  ...initialState,

  open: () => set({ isOpen: true }),
  close: () => {
    const state = get();
    const r = returnToPlayer(state.craftingGrid, state.cursorItem, useHotbarStore.getState().slots);
    useHotbarStore.setState({ slots: r.player });
    set({ isOpen: false, craftingGrid: r.container, cursorItem: r.cursor });
  },

  setCraftingSlot: (index, blockId, count, durability) =>
    set((state) => {
      const grid = [...state.craftingGrid];
      grid[index] = { blockId, count, durability };
      return { craftingGrid: grid };
    }),

  clearCraftingGrid: () => set({ craftingGrid: emptyGrid() }),

  setCursorItem: (blockId, count, durability) =>
    set({ cursorItem: { blockId, count, durability } }),

  clearCursor: () => set({ cursorItem: emptyCursor() }),

  openTable: () => set({ tableOpen: true }),
  closeTable: () => {
    const state = get();
    const r = returnToPlayer(state.tableGrid, state.cursorItem, useHotbarStore.getState().slots);
    useHotbarStore.setState({ slots: r.player });
    set({ tableOpen: false, tableGrid: r.container, cursorItem: r.cursor });
  },

  setTableSlot: (index, blockId, count, durability) =>
    set((state) => {
      const grid = [...state.tableGrid];
      grid[index] = { blockId, count, durability };
      return { tableGrid: grid };
    }),

  openFurnace: () => set({ furnaceOpen: true }),
  closeFurnace: () => {
    const state = get();
    const r = returnToPlayer(state.furnaceSlots, state.cursorItem, useHotbarStore.getState().slots);
    useHotbarStore.setState({ slots: r.player });
    set({ furnaceOpen: false, furnaceSlots: r.container, cursorItem: r.cursor });
  },

  setFurnaceSlot: (index, blockId, count, durability) =>
    set((state) => {
      const slots = [...state.furnaceSlots];
      slots[index] = { blockId, count, durability };
      return { furnaceSlots: slots };
    }),

  // Creative has infinite items, so any cursor item is simply discarded on
  // open/close (Minecraft-style creative trash) instead of returned.
  openCreative: () => set({ creativeOpen: true, cursorItem: emptyCursor() }),
  closeCreative: () => set({ creativeOpen: false, cursorItem: emptyCursor() }),

  reset: () => set({ ...initialState, craftingGrid: emptyGrid(), tableGrid: emptyTableGrid(), furnaceSlots: emptyFurnaceSlots(), cursorItem: emptyCursor() }),
}));
