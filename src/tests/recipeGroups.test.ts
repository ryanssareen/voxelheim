import { describe, it, expect } from "vitest";
import { BLOCK_ID, BLOCK_DEFINITIONS, isBurnable } from "@data/blocks";
import { RECIPES_3x3, findRecipe, findRecipe3x3, findRecipeForCells } from "@systems/crafting/recipes";
import { FUEL_ITEMS, isFuel } from "@systems/crafting/smelting";
import {
  canCraft,
  fillGridFromRecipe,
  listRecipes,
  type BookEntry,
  type GridFillHost,
} from "@systems/crafting/recipeBook";
import type { ItemStack } from "@store/useHotbarStore";

/**
 * Wood ingredient-group tests: any species of log/planks satisfies a recipe
 * that calls for "log" or "planks", the result follows a single-species
 * input, mixed species fall back to the canonical (oak) result, fuel is
 * derived from block data, and the recipe-book's craftable check and
 * grid-fill both understand species groups without ever rewriting the
 * species that was actually taken.
 */

const empty4: [number, number, number, number] = [0, 0, 0, 0];
const empty9: [number, number, number, number, number, number, number, number, number] =
  [0, 0, 0, 0, 0, 0, 0, 0, 0];

describe("findRecipe — species-following result (2x2)", () => {
  it.each([
    [BLOCK_ID.LOG, BLOCK_ID.PLANKS],
    [BLOCK_ID.BIRCH_LOG, BLOCK_ID.BIRCH_PLANKS],
    [BLOCK_ID.SPRUCE_LOG, BLOCK_ID.SPRUCE_PLANKS],
  ])("a lone %i log crafts into 4 of %i planks", (logId, planksId) => {
    const recipe = findRecipe([logId, 0, 0, 0]);
    expect(recipe).not.toBeNull();
    expect(recipe!.result).toBe(planksId);
    expect(recipe!.count).toBe(4);
  });

  it("crafts a crafting table from 4 spruce planks (non-wood result unaffected)", () => {
    const recipe = findRecipe([
      BLOCK_ID.SPRUCE_PLANKS,
      BLOCK_ID.SPRUCE_PLANKS,
      BLOCK_ID.SPRUCE_PLANKS,
      BLOCK_ID.SPRUCE_PLANKS,
    ]);
    expect(recipe).not.toBeNull();
    expect(recipe!.result).toBe(BLOCK_ID.CRAFTING_TABLE);
    expect(recipe!.count).toBe(1);
  });

  it("crafts a crafting table from mixed oak + birch planks (non-wood result unaffected)", () => {
    const recipe = findRecipe([
      BLOCK_ID.PLANKS,
      BLOCK_ID.BIRCH_PLANKS,
      BLOCK_ID.PLANKS,
      BLOCK_ID.BIRCH_PLANKS,
    ]);
    expect(recipe).not.toBeNull();
    expect(recipe!.result).toBe(BLOCK_ID.CRAFTING_TABLE);
    expect(recipe!.count).toBe(1);
  });

  it("crafts sticks from 2 birch planks (non-wood-tagged result stays canonical STICK)", () => {
    const recipe = findRecipe([BLOCK_ID.BIRCH_PLANKS, 0, BLOCK_ID.BIRCH_PLANKS, 0]);
    expect(recipe).not.toBeNull();
    expect(recipe!.result).toBe(BLOCK_ID.STICK);
    expect(recipe!.count).toBe(4);
  });

  it("still refuses a non-wood-part match: 4 spruce logs is not the stone-crushing recipe", () => {
    expect(findRecipe([BLOCK_ID.SPRUCE_LOG, BLOCK_ID.SPRUCE_LOG, BLOCK_ID.SPRUCE_LOG, BLOCK_ID.SPRUCE_LOG])).toBeNull();
  });

  it("non-wood cells still require an exact match (4 dirt -> grass, unaffected)", () => {
    const recipe = findRecipe([BLOCK_ID.DIRT, BLOCK_ID.DIRT, BLOCK_ID.DIRT, BLOCK_ID.DIRT]);
    expect(recipe).not.toBeNull();
    expect(recipe!.result).toBe(BLOCK_ID.GRASS);
  });

  it("an empty grid still matches nothing", () => {
    expect(findRecipe(empty4)).toBeNull();
  });
});

describe("findRecipe3x3 — species-following result and mixed-species fallback", () => {
  const columnMill = (a: number, b: number, c: number) =>
    [0, a, 0, 0, b, 0, 0, c, 0] as [number, number, number, number, number, number, number, number, number];

  it("3 birch logs in the column mill craft 12 birch planks", () => {
    const recipe = findRecipe3x3(columnMill(BLOCK_ID.BIRCH_LOG, BLOCK_ID.BIRCH_LOG, BLOCK_ID.BIRCH_LOG));
    expect(recipe).not.toBeNull();
    expect(recipe!.result).toBe(BLOCK_ID.BIRCH_PLANKS);
    expect(recipe!.count).toBe(12);
  });

  it("mixed-species logs in the column mill fall back to canonical oak planks", () => {
    const recipe = findRecipe3x3(columnMill(BLOCK_ID.LOG, BLOCK_ID.BIRCH_LOG, BLOCK_ID.SPRUCE_LOG));
    expect(recipe).not.toBeNull();
    expect(recipe!.result).toBe(BLOCK_ID.PLANKS);
    expect(recipe!.count).toBe(12);
  });

  it("resolves species through the 2x2-in-3x3 subgrid path", () => {
    // Lone birch log in the top-left corner of the subgrid used by the "Planks" 2x2 recipe.
    const grid = [BLOCK_ID.BIRCH_LOG, 0, 0, 0, 0, 0, 0, 0, 0] as typeof empty9;
    const recipe = findRecipe3x3(grid);
    expect(recipe).not.toBeNull();
    expect(recipe!.result).toBe(BLOCK_ID.BIRCH_PLANKS);
    expect(recipe!.count).toBe(4);
  });

  it("an empty 3x3 grid still matches nothing", () => {
    expect(findRecipe3x3(empty9)).toBeNull();
  });

  it("still matches every non-wood 3x3 recipe exactly, unaffected", () => {
    for (const recipe of RECIPES_3x3) {
      if (BLOCK_DEFINITIONS[recipe.result]?.wood) continue;
      const found = findRecipe3x3(recipe.grid);
      expect(found).not.toBeNull();
      expect(found!.result).toBe(recipe.result);
    }
  });
});

describe("findRecipeForCells — dispatches by grid length with the same species resolution", () => {
  it("resolves a 4-cell grid through findRecipe", () => {
    expect(findRecipeForCells([BLOCK_ID.SPRUCE_LOG, 0, 0, 0])?.result).toBe(BLOCK_ID.SPRUCE_PLANKS);
  });

  it("resolves a 9-cell grid through findRecipe3x3", () => {
    const grid = [0, BLOCK_ID.SPRUCE_LOG, 0, 0, BLOCK_ID.SPRUCE_LOG, 0, 0, BLOCK_ID.SPRUCE_LOG, 0];
    expect(findRecipeForCells(grid)?.result).toBe(BLOCK_ID.SPRUCE_PLANKS);
  });
});

describe("fuel derivation — FUEL_ITEMS / isFuel come from block.burnable", () => {
  it("every burnable block is fuel and nothing else is", () => {
    const expected = new Set(BLOCK_DEFINITIONS.filter((d) => d.burnable === true).map((d) => d.id));
    expect(FUEL_ITEMS).toEqual(expected);
    for (const def of BLOCK_DEFINITIONS) {
      expect(isFuel(def.id)).toBe(isBurnable(def.id));
    }
  });

  it.each([
    BLOCK_ID.BIRCH_LOG,
    BLOCK_ID.BIRCH_LEAVES,
    BLOCK_ID.BIRCH_PLANKS,
    BLOCK_ID.SPRUCE_LOG,
    BLOCK_ID.SPRUCE_LEAVES,
    BLOCK_ID.SPRUCE_PLANKS,
  ])("wood variant %i is fuel", (id) => {
    expect(isFuel(id)).toBe(true);
    expect(FUEL_ITEMS.has(id)).toBe(true);
  });

  it("non-burnable blocks are not fuel", () => {
    expect(isFuel(BLOCK_ID.CRAFTING_TABLE)).toBe(false);
    expect(isFuel(BLOCK_ID.STONE)).toBe(false);
    expect(FUEL_ITEMS.has(BLOCK_ID.CRAFTING_TABLE)).toBe(false);
  });
});

/** Locates the 2x2 "Planks" and 3x3 "Planks (Column Mill)" book entries by name. */
function entryNamed(gridSize: 2 | 3, name: string): BookEntry {
  const entry = listRecipes(gridSize).find((e) => e.name === name);
  if (!entry) throw new Error(`recipe entry "${name}" missing`);
  return entry;
}

describe("recipeBook.canCraft — group-aware availability", () => {
  it("is craftable from a birch-only inventory for a recipe written against canonical LOG", () => {
    const planks = entryNamed(2, "Planks");
    expect(canCraft(planks, new Map([[BLOCK_ID.BIRCH_LOG, 1]]))).toBe(true);
  });

  it("sums availability across species for a multi-ingredient recipe", () => {
    const columnMill = entryNamed(3, "Planks (Column Mill)");
    expect(
      canCraft(columnMill, new Map([[BLOCK_ID.BIRCH_LOG, 2], [BLOCK_ID.SPRUCE_LOG, 1]]))
    ).toBe(true);
  });

  it("stays false when nothing of the required wood part is held", () => {
    const planks = entryNamed(2, "Planks");
    expect(canCraft(planks, new Map([[BLOCK_ID.STONE, 9]]))).toBe(false);
  });
});

/** In-memory GridFillHost, mirroring recipeBook.test.ts's makeHost. */
function makeHost(inventory: Map<number, number>, gridLen: number) {
  const grid: ItemStack[] = Array.from({ length: gridLen }, () => ({ blockId: 0, count: 0 }));
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

describe("recipeBook.fillGridFromRecipe — fills with the species actually taken", () => {
  it("fills 4 birch planks from a birch-only inventory (never rewrites to oak)", () => {
    const { host, grid, inventory } = makeHost(new Map([[BLOCK_ID.BIRCH_PLANKS, 4]]), 4);
    const table = entryNamed(2, "Crafting Table");
    expect(fillGridFromRecipe(table, host)).toBe(true);
    expect(grid.map((c) => c.blockId)).toEqual([
      BLOCK_ID.BIRCH_PLANKS, BLOCK_ID.BIRCH_PLANKS, BLOCK_ID.BIRCH_PLANKS, BLOCK_ID.BIRCH_PLANKS,
    ]);
    expect(inventory.get(BLOCK_ID.BIRCH_PLANKS)).toBe(0);
  });

  it("prefers the species already sitting in the grid", () => {
    // 1 spruce plank starts already placed in the grid (not yet deducted from
    // inventory); the other 3 come from inventory once the fill takes over.
    const { host, grid, inventory } = makeHost(
      new Map([[BLOCK_ID.PLANKS, 4], [BLOCK_ID.SPRUCE_PLANKS, 3]]),
      4
    );
    host.setCell(0, BLOCK_ID.SPRUCE_PLANKS, 1);
    const table = entryNamed(2, "Crafting Table");
    expect(fillGridFromRecipe(table, host)).toBe(true);
    expect(grid.every((c) => c.blockId === BLOCK_ID.SPRUCE_PLANKS)).toBe(true);
    expect(inventory.get(BLOCK_ID.SPRUCE_PLANKS)).toBe(0);
    expect(inventory.get(BLOCK_ID.PLANKS)).toBe(4);
  });

  it("falls through WOOD_SPECIES order when the first species runs short", () => {
    const { host, grid, inventory } = makeHost(
      new Map([[BLOCK_ID.LOG, 1], [BLOCK_ID.BIRCH_LOG, 2]]),
      9
    );
    const columnMill = entryNamed(3, "Planks (Column Mill)");
    expect(fillGridFromRecipe(columnMill, host)).toBe(true);
    const placed = grid.map((c) => c.blockId).filter((id) => id !== 0);
    expect(placed.filter((id) => id === BLOCK_ID.LOG)).toHaveLength(1);
    expect(placed.filter((id) => id === BLOCK_ID.BIRCH_LOG)).toHaveLength(2);
    expect(inventory.get(BLOCK_ID.LOG)).toBe(0);
    expect(inventory.get(BLOCK_ID.BIRCH_LOG)).toBe(0);
  });

  it("fails cleanly and refunds everything when short across every species combined", () => {
    const { host, grid, inventory } = makeHost(new Map([[BLOCK_ID.BIRCH_PLANKS, 3]]), 4);
    const table = entryNamed(2, "Crafting Table");
    expect(fillGridFromRecipe(table, host)).toBe(false);
    expect(grid.every((c) => c.count === 0)).toBe(true);
    expect(inventory.get(BLOCK_ID.BIRCH_PLANKS)).toBe(3);
  });
});
