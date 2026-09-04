import { describe, it, expect, beforeEach } from "vitest";
import { BLOCK_ID } from "@data/blocks";
import { useHotbarStore, MAX_STACK, type ItemStack } from "@store/useHotbarStore";
import { useInventoryStore } from "@store/useInventoryStore";
import { quickMoveAt } from "@systems/inventory/craft";
import {
  inventoryScreen,
  tableScreen,
  furnaceScreen,
} from "@systems/inventory/screens";

function multiset(): Map<number, number> {
  const hotbar = useHotbarStore.getState();
  const inv = useInventoryStore.getState();
  const m = new Map<number, number>();
  const add = (s: ItemStack) => {
    if (s.count === 0) return;
    m.set(s.blockId, (m.get(s.blockId) ?? 0) + s.count);
  };
  hotbar.slots.forEach(add);
  hotbar.armor.forEach(add);
  add(hotbar.offhand);
  add(inv.cursorItem);
  inv.craftingGrid.forEach(add);
  inv.tableGrid.forEach(add);
  inv.furnaceSlots.forEach(add);
  return m;
}

beforeEach(() => {
  useHotbarStore.getState().resetSlots();
  useInventoryStore.getState().reset();
});

describe("open*/close* — conservation", () => {
  it("close() with a full inventory parks leftovers instead of losing them", () => {
    const slots = useHotbarStore.getState().slots.map(() => ({ blockId: BLOCK_ID.DIRT, count: MAX_STACK }));
    useHotbarStore.setState({ slots });
    useInventoryStore.setState({
      isOpen: true,
      craftingGrid: [
        { blockId: BLOCK_ID.LOG, count: 3 },
        { blockId: 0, count: 0 },
        { blockId: 0, count: 0 },
        { blockId: 0, count: 0 },
      ],
      cursorItem: { blockId: BLOCK_ID.STONE, count: 2 },
    });

    const before = multiset();
    useInventoryStore.getState().close();
    const after = multiset();

    expect(after).toEqual(before);
    expect(useInventoryStore.getState().isOpen).toBe(false);
    // Nothing fit, so the leftovers are still exactly where they were.
    expect(useInventoryStore.getState().craftingGrid[0]).toEqual({ blockId: BLOCK_ID.LOG, count: 3 });
    expect(useInventoryStore.getState().cursorItem).toEqual({ blockId: BLOCK_ID.STONE, count: 2 });
  });

  it("the next open shows parked leftovers rather than wiping them", () => {
    const slots = useHotbarStore.getState().slots.map(() => ({ blockId: BLOCK_ID.DIRT, count: MAX_STACK }));
    useHotbarStore.setState({ slots });
    useInventoryStore.setState({
      tableOpen: true,
      tableGrid: Array.from({ length: 9 }, (_, i) => (i === 0 ? { blockId: BLOCK_ID.LOG, count: 5 } : { blockId: 0, count: 0 })),
      cursorItem: { blockId: 0, count: 0 },
    });
    useInventoryStore.getState().closeTable();
    expect(useInventoryStore.getState().tableGrid[0]).toEqual({ blockId: BLOCK_ID.LOG, count: 5 });

    // Reopening must not wipe what close() just parked.
    useInventoryStore.getState().openTable();
    expect(useInventoryStore.getState().tableGrid[0]).toEqual({ blockId: BLOCK_ID.LOG, count: 5 });
  });

  it("closeTable() moves 40 dirt as one merged stack, not 40 individual adds", () => {
    useInventoryStore.setState({
      tableOpen: true,
      tableGrid: Array.from({ length: 9 }, (_, i) => (i === 0 ? { blockId: BLOCK_ID.DIRT, count: 40 } : { blockId: 0, count: 0 })),
      cursorItem: { blockId: 0, count: 0 },
    });

    useInventoryStore.getState().closeTable();

    const dirtSlots = useHotbarStore.getState().slots.filter((s) => s.blockId === BLOCK_ID.DIRT && s.count > 0);
    expect(dirtSlots).toHaveLength(1);
    expect(dirtSlots[0].count).toBe(40);
  });

  it("close() fires exactly one hotbar notification", () => {
    useInventoryStore.setState({
      isOpen: true,
      craftingGrid: [
        { blockId: BLOCK_ID.DIRT, count: 5 },
        { blockId: 0, count: 0 },
        { blockId: 0, count: 0 },
        { blockId: 0, count: 0 },
      ],
    });

    let notifications = 0;
    const unsubscribe = useHotbarStore.subscribe(() => {
      notifications += 1;
    });
    useInventoryStore.getState().close();
    unsubscribe();

    expect(notifications).toBe(1);
  });

  it("closeFurnace() returns a tool with durability intact", () => {
    useInventoryStore.setState({
      furnaceOpen: true,
      furnaceSlots: [
        { blockId: BLOCK_ID.WOODEN_PICKAXE, count: 1, durability: 3 },
        { blockId: 0, count: 0 },
      ],
    });
    useInventoryStore.getState().closeFurnace();
    const returned = useHotbarStore.getState().slots.find((s) => s.blockId === BLOCK_ID.WOODEN_PICKAXE);
    expect(returned?.durability).toBe(3);
  });

  it.each([
    ["inventory", () => useInventoryStore.getState().open(), () => useInventoryStore.getState().close()],
    ["table", () => useInventoryStore.getState().openTable(), () => useInventoryStore.getState().closeTable()],
    ["furnace", () => useInventoryStore.getState().openFurnace(), () => useInventoryStore.getState().closeFurnace()],
  ] as const)("every open/close pair on the %s screen conserves the multiset", (_name, open, close) => {
    useHotbarStore.getState().addItem(BLOCK_ID.DIRT);
    useHotbarStore.getState().addItem(BLOCK_ID.LOG);
    const before = multiset();
    open();
    close();
    expect(multiset()).toEqual(before);
  });

  it("openCreative/closeCreative conserve everything except the cursor (creative trash, by design)", () => {
    useHotbarStore.getState().addItem(BLOCK_ID.DIRT);
    const beforeHotbar = [...useHotbarStore.getState().slots];
    useInventoryStore.getState().openCreative();
    useInventoryStore.getState().closeCreative();
    expect(useHotbarStore.getState().slots).toEqual(beforeHotbar);
  });
});

describe("quickMoveAt — conservation", () => {
  it("conserves the multiset for a hotbar->storage quick-move", () => {
    useHotbarStore.getState().addItem(BLOCK_ID.DIRT);
    useInventoryStore.setState({ isOpen: true });
    const before = multiset();

    const screen = inventoryScreen();
    const next = quickMoveAt(screen.layout, screen.regions, 0, screen.find, MAX_STACK);
    expect(next).not.toBeNull();
    if (next) screen.write(next);

    expect(multiset()).toEqual(before);
  });

  it("conserves the multiset for a craft-grid shift-click and a furnace shift-click", () => {
    useInventoryStore.setState({
      tableOpen: true,
      tableGrid: Array.from({ length: 9 }, (_, i) => (i === 0 ? { blockId: BLOCK_ID.LOG, count: 2 } : { blockId: 0, count: 0 })),
    });
    const beforeTable = multiset();
    const table = tableScreen();
    const tableCraftIndex = table.layout.ranges.container[0];
    const tableNext = quickMoveAt(table.layout, table.regions, tableCraftIndex, table.find, MAX_STACK);
    expect(tableNext).not.toBeNull();
    if (tableNext) table.write(tableNext);
    expect(multiset()).toEqual(beforeTable);

    useInventoryStore.getState().reset();
    useInventoryStore.setState({
      furnaceOpen: true,
      furnaceSlots: [
        { blockId: BLOCK_ID.SAND, count: 3 },
        { blockId: 0, count: 0 },
      ],
    });
    const beforeFurnace = multiset();
    const furnace = furnaceScreen();
    const furnaceInputIndex = furnace.layout.ranges.container[0];
    const furnaceNext = quickMoveAt(furnace.layout, furnace.regions, furnaceInputIndex, furnace.find, MAX_STACK);
    expect(furnaceNext).not.toBeNull();
    if (furnaceNext) furnace.write(furnaceNext);
    expect(multiset()).toEqual(beforeFurnace);
  });
});

describe("durability — round trips through every container", () => {
  it("survives setCraftingSlot / setTableSlot / setFurnaceSlot and damageSelectedTool", () => {
    const inv = useInventoryStore.getState();

    inv.setCraftingSlot(0, BLOCK_ID.WOODEN_PICKAXE, 1, 3);
    expect(useInventoryStore.getState().craftingGrid[0].durability).toBe(3);

    inv.setTableSlot(0, BLOCK_ID.WOODEN_PICKAXE, 1, 3);
    expect(useInventoryStore.getState().tableGrid[0].durability).toBe(3);

    inv.setFurnaceSlot(0, BLOCK_ID.WOODEN_PICKAXE, 1, 3);
    expect(useInventoryStore.getState().furnaceSlots[0].durability).toBe(3);

    useHotbarStore.setState({
      slots: useHotbarStore.getState().slots.map((s, i) =>
        i === 0 ? { blockId: BLOCK_ID.WOODEN_PICKAXE, count: 1, durability: 3 } : s
      ),
      selectedIndex: 0,
    });
    useHotbarStore.getState().damageSelectedTool();
    expect(useHotbarStore.getState().slots[0].durability).toBe(2);
  });
});
