import { describe, it, expect } from "vitest";
import { BLOCK_ID } from "@data/blocks";
import { getArmorDef, getToolDef } from "@data/items";
import { MAX_STACK } from "@store/useHotbarStore";
import { RECIPES, RECIPES_3x3, findRecipeForCells } from "@systems/crafting/recipes";
import { resolveCraft, type CraftStack } from "@systems/crafting/craft";

const empty = (): CraftStack => ({ blockId: 0, count: 0 });
const stack = (blockId: number, count: number): CraftStack => ({ blockId, count });

/** "Planks": 1 log (top-left of a 2x2) -> 4 planks. */
const plankGrid = (logCount: number): CraftStack[] => [stack(BLOCK_ID.LOG, logCount), empty(), empty(), empty()];

/** "Sticks": 2 planks (top-left + bottom-left of a 2x2) -> 4 sticks. */
const stickGrid = (): CraftStack[] => [stack(BLOCK_ID.PLANKS, 1), empty(), stack(BLOCK_ID.PLANKS, 1), empty()];

/** "Wooden Pickaxe": 3 planks + 2 sticks on the 3x3 crafting-table grid. */
const pickaxeGrid = (materialCount: number): CraftStack[] => [
  stack(BLOCK_ID.PLANKS, materialCount),
  stack(BLOCK_ID.PLANKS, materialCount),
  stack(BLOCK_ID.PLANKS, materialCount),
  empty(),
  stack(BLOCK_ID.STICK, materialCount),
  empty(),
  empty(),
  stack(BLOCK_ID.STICK, materialCount),
  empty(),
];

describe("resolveCraft — basic consumption", () => {
  it("consumes the last item in a cell and empties it", () => {
    const outcome = resolveCraft(plankGrid(1), empty(), MAX_STACK);
    expect(outcome).not.toBeNull();
    expect(outcome!.grid).toEqual([empty(), empty(), empty(), empty()]);
    expect(outcome!.cursor).toEqual(stack(BLOCK_ID.PLANKS, 4));
  });

  it("decrements a cell by one when more than one item sits there", () => {
    const outcome = resolveCraft(plankGrid(2), empty(), MAX_STACK);
    expect(outcome).not.toBeNull();
    expect(outcome!.grid).toEqual([stack(BLOCK_ID.LOG, 1), empty(), empty(), empty()]);
    expect(outcome!.cursor).toEqual(stack(BLOCK_ID.PLANKS, 4));
  });
});

describe("resolveCraft — cursor merge and overflow", () => {
  it("merges into a matching cursor stack up to MAX_STACK", () => {
    const cursor = stack(BLOCK_ID.STICK, MAX_STACK - 4);
    const outcome = resolveCraft(stickGrid(), cursor, MAX_STACK);
    expect(outcome).not.toBeNull();
    expect(outcome!.cursor).toEqual(stack(BLOCK_ID.STICK, MAX_STACK));
  });

  it("is a no-op when the merge would overflow MAX_STACK, leaving the grid untouched", () => {
    const grid = stickGrid();
    const gridSnapshot = grid.map((c) => ({ ...c }));
    const cursor = stack(BLOCK_ID.STICK, MAX_STACK - 3);
    const outcome = resolveCraft(grid, cursor, MAX_STACK);
    expect(outcome).toBeNull();
    expect(grid).toEqual(gridSnapshot);
  });

  it("is a no-op when the cursor holds a foreign item, leaving the grid untouched", () => {
    const grid = stickGrid();
    const gridSnapshot = grid.map((c) => ({ ...c }));
    const outcome = resolveCraft(grid, stack(BLOCK_ID.DIRT, 5), MAX_STACK);
    expect(outcome).toBeNull();
    expect(grid).toEqual(gridSnapshot);
  });
});

describe("resolveCraft — tools and armor are unstackable", () => {
  it("carries durability from getToolDef on the fresh cursor stack", () => {
    const outcome = resolveCraft(pickaxeGrid(2), empty(), MAX_STACK);
    expect(outcome).not.toBeNull();
    const tool = getToolDef(BLOCK_ID.WOODEN_PICKAXE);
    expect(outcome!.cursor).toEqual({
      blockId: BLOCK_ID.WOODEN_PICKAXE,
      count: 1,
      durability: tool?.durability,
    });
    expect(outcome!.cursor.durability).toBeGreaterThan(0);
  });

  it("is a no-op — never stacks — when the same tool already sits on the cursor", () => {
    const grid = pickaxeGrid(2);
    const first = resolveCraft(grid, empty(), MAX_STACK);
    expect(first).not.toBeNull();
    const second = resolveCraft(grid, first!.cursor, MAX_STACK);
    expect(second).toBeNull();
  });

  it("carries durability from getArmorDef on a freshly crafted armor piece", () => {
    // Iron Helmet: 5 ingots (top row + sides of middle), recipes.ts's [I, I, I, I, _, I, _, _, _].
    const grid: CraftStack[] = [
      stack(BLOCK_ID.IRON_INGOT, 1),
      stack(BLOCK_ID.IRON_INGOT, 1),
      stack(BLOCK_ID.IRON_INGOT, 1),
      stack(BLOCK_ID.IRON_INGOT, 1),
      empty(),
      stack(BLOCK_ID.IRON_INGOT, 1),
      empty(),
      empty(),
      empty(),
    ];
    const outcome = resolveCraft(grid, empty(), MAX_STACK);
    expect(outcome).not.toBeNull();
    const armor = getArmorDef(BLOCK_ID.IRON_HELMET);
    expect(outcome!.cursor).toEqual({
      blockId: BLOCK_ID.IRON_HELMET,
      count: 1,
      durability: armor?.durability,
    });
    expect(outcome!.cursor.durability).toBeGreaterThan(0);
  });

  it("is a no-op — never stacks — when the same armor piece already sits on the cursor", () => {
    const grid: CraftStack[] = [
      stack(BLOCK_ID.IRON_INGOT, 2),
      stack(BLOCK_ID.IRON_INGOT, 2),
      stack(BLOCK_ID.IRON_INGOT, 2),
      stack(BLOCK_ID.IRON_INGOT, 2),
      empty(),
      stack(BLOCK_ID.IRON_INGOT, 2),
      empty(),
      empty(),
      empty(),
    ];
    const first = resolveCraft(grid, empty(), MAX_STACK);
    expect(first).not.toBeNull();
    const second = resolveCraft(grid, first!.cursor, MAX_STACK);
    expect(second).toBeNull();
  });
});

describe("resolveCraft — no match", () => {
  it("returns null for an empty grid regardless of any recipe previously matched", () => {
    const outcome = resolveCraft([empty(), empty(), empty(), empty()], empty(), MAX_STACK);
    expect(outcome).toBeNull();
  });

  it("never touches the grid when the finder returns null", () => {
    const grid = [stack(BLOCK_ID.DIRT, 3)];
    const gridSnapshot = grid.map((c) => ({ ...c }));
    const outcome = resolveCraft(grid, empty(), MAX_STACK, () => null);
    expect(outcome).toBeNull();
    expect(grid).toEqual(gridSnapshot);
  });
});

/** Sums each block id present across a set of stacks (zero/empty stacks contribute nothing). */
function multiset(stacks: CraftStack[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const s of stacks) {
    if (s.count <= 0) continue;
    m.set(s.blockId, (m.get(s.blockId) ?? 0) + s.count);
  }
  return m;
}

/** Builds a grid of 1-count stacks (or an empty cell) from a recipe's grid literal. */
function gridFrom(cells: readonly number[]): CraftStack[] {
  return cells.map((id) => (id === 0 ? empty() : stack(id, 1)));
}

describe("resolveCraft — conservation", () => {
  it.each([
    ...RECIPES.map((r) => ({ recipe: r, cells: r.grid as readonly number[] })),
    ...RECIPES_3x3.map((r) => ({ recipe: r, cells: r.grid as readonly number[] })),
  ])("$recipe.name conserves items: consumed grid + result == starting grid", ({ recipe, cells }) => {
    const gridBefore = gridFrom(cells);
    const before = multiset([...gridBefore, empty()]);
    for (const cell of gridBefore) {
      if (cell.count > 0) {
        before.set(cell.blockId, (before.get(cell.blockId) ?? 0) - 1);
        if (before.get(cell.blockId) === 0) before.delete(cell.blockId);
      }
    }

    const outcome = resolveCraft(gridBefore, empty(), MAX_STACK, findRecipeForCells);
    expect(outcome).not.toBeNull();

    const after = multiset([...outcome!.grid, outcome!.cursor]);
    after.set(recipe.result, (after.get(recipe.result) ?? 0) - recipe.count);
    if (after.get(recipe.result) === 0) after.delete(recipe.result);

    expect(after).toEqual(before);
  });
});
