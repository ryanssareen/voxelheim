import { create } from "zustand";

interface InventoryState {
  isOpen: boolean;
  /** 2x2 crafting grid: [TL, TR, BL, BR] as { blockId, count } */
  craftingGrid: Array<{ blockId: number; count: number }>;
  /** Currently held item on cursor (from clicking a slot) */
  cursorItem: { blockId: number; count: number };
  open: () => void;
  close: () => void;
  toggle: () => void;
  setCraftingSlot: (index: number, blockId: number, count: number) => void;
  clearCraftingGrid: () => void;
  setCursorItem: (blockId: number, count: number) => void;
  clearCursor: () => void;
}

function emptyGrid() {
  return [
    { blockId: 0, count: 0 },
    { blockId: 0, count: 0 },
    { blockId: 0, count: 0 },
    { blockId: 0, count: 0 },
  ];
}

export const useInventoryStore = create<InventoryState>((set) => ({
  isOpen: false,
  craftingGrid: emptyGrid(),
  cursorItem: { blockId: 0, count: 0 },

  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false, craftingGrid: emptyGrid(), cursorItem: { blockId: 0, count: 0 } }),
  toggle: () =>
    set((state) => ({
      isOpen: !state.isOpen,
      ...(!state.isOpen ? {} : { craftingGrid: emptyGrid(), cursorItem: { blockId: 0, count: 0 } }),
    })),

  setCraftingSlot: (index, blockId, count) =>
    set((state) => {
      const grid = [...state.craftingGrid];
      grid[index] = { blockId, count };
      return { craftingGrid: grid };
    }),

  clearCraftingGrid: () => set({ craftingGrid: emptyGrid() }),

  setCursorItem: (blockId, count) =>
    set({ cursorItem: { blockId, count } }),

  clearCursor: () => set({ cursorItem: { blockId: 0, count: 0 } }),
}));
