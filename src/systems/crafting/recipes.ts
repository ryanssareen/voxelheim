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

/** A crafting recipe for the 3x3 crafting table grid. Row-major order. */
export interface CraftingRecipe3x3 {
  grid: [number, number, number, number, number, number, number, number, number];
  result: number;
  count: number;
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
  // 1 log → 4 planks
  {
    grid: [BLOCK_ID.LOG, 0, 0, 0],
    result: BLOCK_ID.PLANKS,
    count: 4,
    name: "Planks",
  },
  // 4 planks → 1 crafting table
  {
    grid: [BLOCK_ID.PLANKS, BLOCK_ID.PLANKS, BLOCK_ID.PLANKS, BLOCK_ID.PLANKS],
    result: BLOCK_ID.CRAFTING_TABLE,
    count: 1,
    name: "Crafting Table",
  },
  // 2 planks → 4 sticks
  {
    grid: [BLOCK_ID.PLANKS, 0, BLOCK_ID.PLANKS, 0],
    result: BLOCK_ID.STICK,
    count: 4,
    name: "Sticks",
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

const _ = 0;
const P = BLOCK_ID.PLANKS;
const F = BLOCK_ID.FURNACE;
const S = BLOCK_ID.STONE;
const L = BLOCK_ID.LOG;
const D = BLOCK_ID.DIRT;
const G = BLOCK_ID.GRASS;
const C = BLOCK_ID.CRYSTAL;
const SN = BLOCK_ID.SAND;
const LV = BLOCK_ID.LEAVES;
const ST = BLOCK_ID.STICK;
const I = BLOCK_ID.IRON_INGOT;
const DM = BLOCK_ID.DIAMOND;

/** All 3x3 crafting table recipes. */
export const RECIPES_3x3: CraftingRecipe3x3[] = [
  // 8 planks around center → chest (gives stone for now)
  {
    grid: [P, P, P, P, _, P, P, P, P],
    result: BLOCK_ID.STONE,
    count: 4,
    name: "Stonework",
  },
  // 3 planks top row → slab equivalent (gives 6 planks)
  {
    grid: [_, _, _, _, _, _, P, P, P],
    result: BLOCK_ID.PLANKS,
    count: 6,
    name: "Planks (Efficient)",
  },
  // 9 dirt → 4 grass
  {
    grid: [D, D, D, D, D, D, D, D, D],
    result: BLOCK_ID.GRASS,
    count: 4,
    name: "Grass Block (Bulk)",
  },
  // 9 sand → 4 stone
  {
    grid: [SN, SN, SN, SN, SN, SN, SN, SN, SN],
    result: BLOCK_ID.STONE,
    count: 4,
    name: "Stone (Bulk Smelt)",
  },
  // 9 stone → 4 crystal
  {
    grid: [S, S, S, S, S, S, S, S, S],
    result: BLOCK_ID.CRYSTAL,
    count: 4,
    name: "Crystal (Compression)",
  },
  // 9 leaves → 3 log
  {
    grid: [LV, LV, LV, LV, LV, LV, LV, LV, LV],
    result: BLOCK_ID.LOG,
    count: 3,
    name: "Log (Bulk)",
  },
  // Cross of stone + 4 crystal corners → 8 crystal
  {
    grid: [C, S, C, S, C, S, C, S, C],
    result: BLOCK_ID.CRYSTAL,
    count: 8,
    name: "Crystal Matrix",
  },
  // Diamond of planks → crafting table
  {
    grid: [_, P, _, P, L, P, _, P, _],
    result: BLOCK_ID.CRAFTING_TABLE,
    count: 4,
    name: "Crafting Tables (Bulk)",
  },
  // Grass border with sand center → 4 dirt
  {
    grid: [G, G, G, G, SN, G, G, G, G],
    result: BLOCK_ID.DIRT,
    count: 8,
    name: "Dirt (Erosion Bulk)",
  },
  // Column of logs → 12 planks
  {
    grid: [_, L, _, _, L, _, _, L, _],
    result: BLOCK_ID.PLANKS,
    count: 12,
    name: "Planks (Column Mill)",
  },
  // Wooden Pickaxe
  {
    grid: [P, P, P, _, ST, _, _, ST, _],
    result: BLOCK_ID.WOODEN_PICKAXE,
    count: 1,
    name: "Wooden Pickaxe",
  },
  // Wooden Axe
  {
    grid: [P, P, _, P, ST, _, _, ST, _],
    result: BLOCK_ID.WOODEN_AXE,
    count: 1,
    name: "Wooden Axe",
  },
  // Wooden Shovel
  {
    grid: [_, P, _, _, ST, _, _, ST, _],
    result: BLOCK_ID.WOODEN_SHOVEL,
    count: 1,
    name: "Wooden Shovel",
  },
  // Wooden Sword
  {
    grid: [_, P, _, _, P, _, _, ST, _],
    result: BLOCK_ID.WOODEN_SWORD,
    count: 1,
    name: "Wooden Sword",
  },
  // Stone Pickaxe
  {
    grid: [S, S, S, _, ST, _, _, ST, _],
    result: BLOCK_ID.STONE_PICKAXE,
    count: 1,
    name: "Stone Pickaxe",
  },
  // Stone Axe
  {
    grid: [S, S, _, S, ST, _, _, ST, _],
    result: BLOCK_ID.STONE_AXE,
    count: 1,
    name: "Stone Axe",
  },
  // Stone Shovel
  {
    grid: [_, S, _, _, ST, _, _, ST, _],
    result: BLOCK_ID.STONE_SHOVEL,
    count: 1,
    name: "Stone Shovel",
  },
  // Stone Sword
  {
    grid: [_, S, _, _, S, _, _, ST, _],
    result: BLOCK_ID.STONE_SWORD,
    count: 1,
    name: "Stone Sword",
  },
  // Furnace: 8 stone around empty center
  {
    grid: [S, S, S, S, _, S, S, S, S],
    result: BLOCK_ID.FURNACE,
    count: 1,
    name: "Furnace",
  },
  // Iron Pickaxe
  {
    grid: [I, I, I, _, ST, _, _, ST, _],
    result: BLOCK_ID.IRON_PICKAXE,
    count: 1,
    name: "Iron Pickaxe",
  },
  // Iron Axe
  {
    grid: [I, I, _, I, ST, _, _, ST, _],
    result: BLOCK_ID.IRON_AXE,
    count: 1,
    name: "Iron Axe",
  },
  // Iron Shovel
  {
    grid: [_, I, _, _, ST, _, _, ST, _],
    result: BLOCK_ID.IRON_SHOVEL,
    count: 1,
    name: "Iron Shovel",
  },
  // Iron Sword
  {
    grid: [_, I, _, _, I, _, _, ST, _],
    result: BLOCK_ID.IRON_SWORD,
    count: 1,
    name: "Iron Sword",
  },
  // Diamond Pickaxe
  {
    grid: [DM, DM, DM, _, ST, _, _, ST, _],
    result: BLOCK_ID.DIAMOND_PICKAXE,
    count: 1,
    name: "Diamond Pickaxe",
  },
  // Diamond Axe
  {
    grid: [DM, DM, _, DM, ST, _, _, ST, _],
    result: BLOCK_ID.DIAMOND_AXE,
    count: 1,
    name: "Diamond Axe",
  },
  // Diamond Shovel
  {
    grid: [_, DM, _, _, ST, _, _, ST, _],
    result: BLOCK_ID.DIAMOND_SHOVEL,
    count: 1,
    name: "Diamond Shovel",
  },
  // Diamond Sword
  {
    grid: [_, DM, _, _, DM, _, _, ST, _],
    result: BLOCK_ID.DIAMOND_SWORD,
    count: 1,
    name: "Diamond Sword",
  },

  // ───────────── Iron Armor ─────────────
  // Iron Helmet: 5 ingots (top row + sides of middle)
  {
    grid: [I, I, I, I, _, I, _, _, _],
    result: BLOCK_ID.IRON_HELMET,
    count: 1,
    name: "Iron Helmet",
  },
  // Iron Chestplate: 8 ingots
  {
    grid: [I, _, I, I, I, I, I, I, I],
    result: BLOCK_ID.IRON_CHESTPLATE,
    count: 1,
    name: "Iron Chestplate",
  },
  // Iron Leggings: 7 ingots
  {
    grid: [I, I, I, I, _, I, I, _, I],
    result: BLOCK_ID.IRON_LEGGINGS,
    count: 1,
    name: "Iron Leggings",
  },
  // Iron Boots: 4 ingots
  {
    grid: [_, _, _, I, _, I, I, _, I],
    result: BLOCK_ID.IRON_BOOTS,
    count: 1,
    name: "Iron Boots",
  },

  // ───────────── Diamond Armor ─────────────
  {
    grid: [DM, DM, DM, DM, _, DM, _, _, _],
    result: BLOCK_ID.DIAMOND_HELMET,
    count: 1,
    name: "Diamond Helmet",
  },
  {
    grid: [DM, _, DM, DM, DM, DM, DM, DM, DM],
    result: BLOCK_ID.DIAMOND_CHESTPLATE,
    count: 1,
    name: "Diamond Chestplate",
  },
  {
    grid: [DM, DM, DM, DM, _, DM, DM, _, DM],
    result: BLOCK_ID.DIAMOND_LEGGINGS,
    count: 1,
    name: "Diamond Leggings",
  },
  {
    grid: [_, _, _, DM, _, DM, DM, _, DM],
    result: BLOCK_ID.DIAMOND_BOOTS,
    count: 1,
    name: "Diamond Boots",
  },
];

/** Shift non-empty cells to top-left corner so recipes match in any position. */
function normalize2x2(grid: [number, number, number, number]): [number, number, number, number] {
  let [tl, tr, bl, br] = grid;
  if (tl === 0 && tr === 0) { tl = bl; tr = br; bl = 0; br = 0; }
  if (tl === 0 && bl === 0) { tl = tr; bl = br; tr = 0; br = 0; }
  return [tl, tr, bl, br];
}

/** Find a matching recipe for the given 2x2 grid. Returns null if no match. */
export function findRecipe(
  grid: [number, number, number, number]
): CraftingRecipe | null {
  const n = normalize2x2(grid);
  for (const recipe of RECIPES) {
    if (
      recipe.grid[0] === n[0] &&
      recipe.grid[1] === n[1] &&
      recipe.grid[2] === n[2] &&
      recipe.grid[3] === n[3]
    ) {
      return recipe;
    }
  }
  return null;
}

/** Find a matching recipe for the given 3x3 grid. Returns null if no match. */
export function findRecipe3x3(
  grid: [number, number, number, number, number, number, number, number, number]
): CraftingRecipe3x3 | null {
  for (const recipe of RECIPES_3x3) {
    let match = true;
    for (let i = 0; i < 9; i++) {
      if (recipe.grid[i] !== grid[i]) { match = false; break; }
    }
    if (match) return recipe;
  }
  // Also check if it fits as a 2x2 recipe placed in any valid 2x2 subgrid
  const subgrids: [number, number, number, number, number, number, number, number, number][] = [
    [0, 1, 3, 4, 2, 5, 6, 7, 8], // top-left 2x2
    [1, 2, 4, 5, 0, 3, 6, 7, 8], // top-right 2x2
    [3, 4, 6, 7, 0, 1, 2, 5, 8], // bottom-left 2x2
    [4, 5, 7, 8, 0, 1, 2, 3, 6], // bottom-right 2x2
  ];
  for (const [a, b, c, d, ...rest] of subgrids) {
    const allRestEmpty = rest.every((idx) => grid[idx] === 0);
    if (!allRestEmpty) continue;
    const sub: [number, number, number, number] = [grid[a], grid[b], grid[c], grid[d]];
    const match2x2 = findRecipe(sub);
    if (match2x2) return { grid, result: match2x2.result, count: match2x2.count, name: match2x2.name };
  }
  return null;
}
