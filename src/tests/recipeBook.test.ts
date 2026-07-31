import { describe, it, expect, beforeEach } from "vitest";
import { BLOCK_ID } from "@data/blocks";
import { useHotbarStore, TOTAL_SLOTS, type ItemStack } from "@store/useHotbarStore";
import { RECIPES, RECIPES_3x3 } from "@systems/crafting/recipes";
import {
  canCraft,
  countAvailable,
  fillGridFromRecipe,
  listRecipes,
  requirementsFor,
  sortForDisplay,
  type BookEntry,
  type GridFillHost,
} from "@systems/crafting/recipeBook";

const stacks = (...pairs: Array<[number, number]>): ItemStack[] =>
  pairs.map(([blockId, count]) => ({ blockId, count }));

/** The recipe that turns 4 planks into a crafting table. */
function craftingTableEntry(gridSize: 2 | 3): BookEntry {
  const entry = listRecipes(gridSize).find((e) => e.result === BLOCK_ID.CRAFTING_TABLE);
  if (!entry) throw new Error("crafting table recipe missing");
  return entry;
}

describe("recipe listing", () => {
  it("shows only 2x2 recipes on the inventory grid", () => {
    expect(listRecipes(2)).toHaveLength(RECIPES.length);
    expect(listRecipes(2).every((e) => e.cells.length === 4)).toBe(true);
  });

  it("shows 2x2 and table recipes on the 3x3 grid", () => {
    expect(listRecipes(3)).toHaveLength(RECIPES.length + RECIPES_3x3.length);
    expect(listRecipes(3).every((e) => e.cells.length === 9)).toBe(true);
  });

  it("lifts a 2x2 recipe into the top-left of the 3x3 grid", () => {
    const table = craftingTableEntry(3);
    // 4 planks occupy the top-left square; the rest of the 3x3 stays empty.
    expect(table.cells).toEqual([
      BLOCK_ID.PLANKS, BLOCK_ID.PLANKS, 0,
      BLOCK_ID.PLANKS, BLOCK_ID.PLANKS, 0,
      0, 0, 0,
    ]);
  });

  it("gives every entry a unique id", () => {
    const ids = listRecipes(3).map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("requirements and availability", () => {
  it("counts repeated ingredients", () => {
    expect(requirementsFor(craftingTableEntry(2))).toEqual(
      new Map([[BLOCK_ID.PLANKS, 4]])
    );
  });

  it("totals a block id spread across several slots", () => {
    const have = countAvailable(stacks([BLOCK_ID.PLANKS, 2], [BLOCK_ID.PLANKS, 3]));
    expect(have.get(BLOCK_ID.PLANKS)).toBe(5);
  });

  it("ignores empty slots", () => {
    const have = countAvailable(stacks([BLOCK_ID.AIR, 0], [BLOCK_ID.PLANKS, 0]));
    expect(have.size).toBe(0);
  });

  it("is craftable only when every ingredient is covered", () => {
    const table = craftingTableEntry(2);
    expect(canCraft(table, new Map([[BLOCK_ID.PLANKS, 4]]))).toBe(true);
    expect(canCraft(table, new Map([[BLOCK_ID.PLANKS, 3]]))).toBe(false);
    expect(canCraft(table, new Map())).toBe(false);
  });

  it("floats craftable recipes to the top", () => {
    const entries = listRecipes(2);
    const sorted = sortForDisplay(entries, new Map([[BLOCK_ID.PLANKS, 64]]));
    const firstUncraftable = sorted.findIndex(
      (e) => !canCraft(e, new Map([[BLOCK_ID.PLANKS, 64]]))
    );
    const lastCraftable = sorted.reduce(
      (acc, e, i) => (canCraft(e, new Map([[BLOCK_ID.PLANKS, 64]])) ? i : acc),
      -1
    );
    expect(lastCraftable).toBeLessThan(firstUncraftable);
  });
});

/** In-memory host so fill logic can be exercised without React or zustand. */
function makeHost(inventory: Map<number, number>, gridLen: number) {
  const grid: ItemStack[] = Array.from({ length: gridLen }, () => ({
    blockId: 0,
    count: 0,
  }));
  const host: GridFillHost = {
    readGrid: () => grid,
    setCell: (i, blockId, count) => {
      grid[i] = { blockId, count };
    },
    takeItems: (blockId, count) => {
      const have = inventory.get(blockId) ?? 0;
      const took = Math.min(have, count);
      inventory.set(blockId, have - took);
      return took;
    },
    addItem: (blockId) => {
      inventory.set(blockId, (inventory.get(blockId) ?? 0) + 1);
      return true;
    },
  };
  return { host, grid, inventory };
}

describe("laying a recipe into the grid", () => {
  it("places ingredients and deducts them from the inventory", () => {
    const { host, grid, inventory } = makeHost(new Map([[BLOCK_ID.PLANKS, 4]]), 4);
    expect(fillGridFromRecipe(craftingTableEntry(2), host)).toBe(true);
    expect(grid.map((c) => c.blockId)).toEqual([
      BLOCK_ID.PLANKS, BLOCK_ID.PLANKS, BLOCK_ID.PLANKS, BLOCK_ID.PLANKS,
    ]);
    expect(grid.every((c) => c.count === 1)).toBe(true);
    expect(inventory.get(BLOCK_ID.PLANKS)).toBe(0);
  });

  it("leaves empty cells empty on the 3x3 grid", () => {
    const { host, grid } = makeHost(new Map([[BLOCK_ID.PLANKS, 4]]), 9);
    expect(fillGridFromRecipe(craftingTableEntry(3), host)).toBe(true);
    expect(grid.map((c) => c.blockId)).toEqual([
      BLOCK_ID.PLANKS, BLOCK_ID.PLANKS, 0,
      BLOCK_ID.PLANKS, BLOCK_ID.PLANKS, 0,
      0, 0, 0,
    ]);
  });

  it("refuses and returns everything when materials fall short", () => {
    const { host, grid, inventory } = makeHost(new Map([[BLOCK_ID.PLANKS, 3]]), 4);
    expect(fillGridFromRecipe(craftingTableEntry(2), host)).toBe(false);
    expect(grid.every((c) => c.count === 0)).toBe(true);
    // Nothing was eaten by the failed attempt.
    expect(inventory.get(BLOCK_ID.PLANKS)).toBe(3);
  });

  it("returns whatever was already in the grid before laying the new recipe", () => {
    const { host, grid, inventory } = makeHost(new Map([[BLOCK_ID.PLANKS, 4]]), 4);
    host.setCell(0, BLOCK_ID.DIRT, 2);
    expect(fillGridFromRecipe(craftingTableEntry(2), host)).toBe(true);
    expect(inventory.get(BLOCK_ID.DIRT)).toBe(2);
    expect(grid[0].blockId).toBe(BLOCK_ID.PLANKS);
  });

  it("keeps items in the grid when the inventory is too full to take them back", () => {
    const { host, grid } = makeHost(new Map([[BLOCK_ID.PLANKS, 4]]), 4);
    host.setCell(3, BLOCK_ID.DIRT, 2);
    const full: GridFillHost = { ...host, addItem: () => false };
    expect(fillGridFromRecipe(craftingTableEntry(2), full)).toBe(true);
    // The dirt could not go back, so it must still be accounted for somewhere.
    expect(grid[3].blockId).toBe(BLOCK_ID.PLANKS);
  });
});

describe("useHotbarStore.takeItems", () => {
  beforeEach(() => {
    useHotbarStore.getState().resetSlots();
  });

  it("takes from a single stack", () => {
    useHotbarStore.setState({
      slots: Array.from({ length: TOTAL_SLOTS }, (_, i) =>
        i === 0 ? { blockId: BLOCK_ID.PLANKS, count: 5 } : { blockId: 0, count: 0 }
      ),
    });
    expect(useHotbarStore.getState().takeItems(BLOCK_ID.PLANKS, 3)).toBe(3);
    expect(useHotbarStore.getState().slots[0].count).toBe(2);
  });

  it("drains across several stacks", () => {
    useHotbarStore.setState({
      slots: Array.from({ length: TOTAL_SLOTS }, (_, i) =>
        i < 3 ? { blockId: BLOCK_ID.PLANKS, count: 2 } : { blockId: 0, count: 0 }
      ),
    });
    expect(useHotbarStore.getState().takeItems(BLOCK_ID.PLANKS, 5)).toBe(5);
    const total = useHotbarStore
      .getState()
      .slots.filter((s) => s.blockId === BLOCK_ID.PLANKS)
      .reduce((n, s) => n + s.count, 0);
    expect(total).toBe(1);
  });

  it("empties a slot completely rather than leaving a zero-count ghost", () => {
    useHotbarStore.setState({
      slots: Array.from({ length: TOTAL_SLOTS }, (_, i) =>
        i === 0 ? { blockId: BLOCK_ID.PLANKS, count: 2 } : { blockId: 0, count: 0 }
      ),
    });
    useHotbarStore.getState().takeItems(BLOCK_ID.PLANKS, 2);
    expect(useHotbarStore.getState().slots[0]).toEqual({
      blockId: BLOCK_ID.AIR,
      count: 0,
    });
  });

  it("returns only what it could take", () => {
    useHotbarStore.setState({
      slots: Array.from({ length: TOTAL_SLOTS }, (_, i) =>
        i === 0 ? { blockId: BLOCK_ID.PLANKS, count: 1 } : { blockId: 0, count: 0 }
      ),
    });
    expect(useHotbarStore.getState().takeItems(BLOCK_ID.PLANKS, 4)).toBe(1);
  });

  it("takes nothing for air or a non-positive count", () => {
    expect(useHotbarStore.getState().takeItems(BLOCK_ID.AIR, 3)).toBe(0);
    expect(useHotbarStore.getState().takeItems(BLOCK_ID.PLANKS, 0)).toBe(0);
  });
});
