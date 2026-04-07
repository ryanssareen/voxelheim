import { create } from "zustand";

interface InventoryState {
  isOpen: boolean;
  /** 2x2 crafting grid: [TL, TR, BL, BR] as { blockId, count } */
  craftingGrid: Array<{ blockId: number; count: number }>;
  /** Currently held item on cursor (from clicking a slot) */
  cursorItem: { blockId: number; count: number };
  /** Whether the 3x3 crafting table UI is open */
  tableOpen: boolean;
  /** 3x3 crafting table grid (9 slots, row-major) */
  tableGrid: Array<{ blockId: number; count: number }>;
  open: () => void;
  close: () => void;
  toggle: () => void;
  setCraftingSlot: (index: number, blockId: number, count: number) => void;
  clearCraftingGrid: () => void;
  setCursorItem: (blockId: number, count: number) => void;
  clearCursor: () => void;
  openTable: () => void;
  closeTable: () => void;
  setTableSlot: (index: number, blockId: number, count: number) => void;
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

export const useInventoryStore = create<InventoryState>((set) => ({
  isOpen: false,
  craftingGrid: emptyGrid(),
  cursorItem: { blockId: 0, count: 0 },
  tableOpen: false,
  tableGrid: emptyTableGrid(),

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

  openTable: () => set({ tableOpen: true, tableGrid: emptyTableGrid(), cursorItem: { blockId: 0, count: 0 } }),
  closeTable: () => set({ tableOpen: false, tableGrid: emptyTableGrid(), cursorItem: { blockId: 0, count: 0 } }),

  setTableSlot: (index, blockId, count) =>
    set((state) => {
      const grid = [...state.tableGrid];
      grid[index] = { blockId, count };
      return { tableGrid: grid };
    }),
}));
