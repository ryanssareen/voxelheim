import { BLOCK_ID } from "@data/blocks";

/**
 * A crafting recipe for the 2x2 grid.
 * Grid is [topLeft, topRight, bottomLeft, bottomRight].
 * 0 = empty slot.
 */
export interface CraftingRecipe {
  /** 4-element array: [TL, TR, BL, BR]. 0 = empty. */
  grid: [number, number, number, number];
  /** Result block ID. */
  result: number;
  /** Number of items produced. */
  count: number;
  /** Human-readable name for the recipe. */
  name: string;
}

/**
 * All 2x2 crafting recipes.
 * Pattern matching is exact — items must be in the right positions.
 */
export const RECIPES: CraftingRecipe[] = [
  // 4 dirt → 1 grass block
  {
    grid: [BLOCK_ID.DIRT, BLOCK_ID.DIRT, BLOCK_ID.DIRT, BLOCK_ID.DIRT],
    result: BLOCK_ID.GRASS,
    count: 1,
    name: "Grass Block",
  },
  // 4 stone → 4 sand (crushing)
  {
    grid: [BLOCK_ID.STONE, BLOCK_ID.STONE, BLOCK_ID.STONE, BLOCK_ID.STONE],
    result: BLOCK_ID.SAND,
    count: 4,
    name: "Sand",
  },
  // 2 log (top row) → 4 leaves (planks equivalent)
  {
    grid: [BLOCK_ID.LOG, BLOCK_ID.LOG, 0, 0],
    result: BLOCK_ID.LEAVES,
    count: 4,
    name: "Leaves",
  },
  // 1 log → 4 dirt (stripping)
  {
    grid: [BLOCK_ID.LOG, 0, 0, 0],
    result: BLOCK_ID.DIRT,
    count: 4,
    name: "Dirt",
  },
  // 2 sand + 2 stone → 2 crystal (rare synthesis)
  {
    grid: [BLOCK_ID.SAND, BLOCK_ID.CRYSTAL, BLOCK_ID.CRYSTAL, BLOCK_ID.SAND],
    result: BLOCK_ID.CRYSTAL,
    count: 3,
    name: "Crystal Synthesis",
  },
  // 4 sand → 1 stone (smelting)
  {
    grid: [BLOCK_ID.SAND, BLOCK_ID.SAND, BLOCK_ID.SAND, BLOCK_ID.SAND],
    result: BLOCK_ID.STONE,
    count: 1,
    name: "Stone",
  },
  // 4 leaves → 1 log
  {
    grid: [BLOCK_ID.LEAVES, BLOCK_ID.LEAVES, BLOCK_ID.LEAVES, BLOCK_ID.LEAVES],
    result: BLOCK_ID.LOG,
    count: 1,
    name: "Log",
  },
  // grass + dirt → 2 sand (erosion)
  {
    grid: [BLOCK_ID.GRASS, BLOCK_ID.DIRT, 0, 0],
    result: BLOCK_ID.SAND,
    count: 2,
    name: "Sand (Erosion)",
  },
  // 2 stone → 1 crystal (rare find)
  {
    grid: [BLOCK_ID.STONE, BLOCK_ID.STONE, 0, 0],
    result: BLOCK_ID.CRYSTAL,
    count: 1,
    name: "Crystal (Rare Find)",
  },
  // stone + sand → 2 dirt (mixing)
  {
    grid: [BLOCK_ID.STONE, BLOCK_ID.SAND, 0, 0],
    result: BLOCK_ID.DIRT,
    count: 2,
    name: "Dirt (Mixing)",
  },
  // 2 dirt + 2 leaves → 1 grass (composting)
  {
    grid: [BLOCK_ID.DIRT, BLOCK_ID.DIRT, BLOCK_ID.LEAVES, BLOCK_ID.LEAVES],
    result: BLOCK_ID.GRASS,
    count: 1,
    name: "Grass (Composting)",
  },
  // crystal + 3 stone → 2 crystal (polishing)
  {
    grid: [BLOCK_ID.CRYSTAL, BLOCK_ID.STONE, BLOCK_ID.STONE, BLOCK_ID.STONE],
    result: BLOCK_ID.CRYSTAL,
    count: 2,
    name: "Crystal (Polishing)",
  },
];

/** Find a matching recipe for the given 2x2 grid. Returns null if no match. */
export function findRecipe(
  grid: [number, number, number, number]
): CraftingRecipe | null {
  for (const recipe of RECIPES) {
    if (
      recipe.grid[0] === grid[0] &&
      recipe.grid[1] === grid[1] &&
      recipe.grid[2] === grid[2] &&
      recipe.grid[3] === grid[3]
    ) {
      return recipe;
    }
  }
  return null;
}
