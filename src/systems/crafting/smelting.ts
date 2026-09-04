import { BLOCK_ID, BLOCK_DEFINITIONS, isBurnable } from "@data/blocks";

/** A smelting recipe: input + fuel → output. */
export interface SmeltingRecipe {
  input: number;
  result: number;
  count: number;
  name: string;
}

/** Items that can be used as furnace fuel — every block flagged burnable in the block data. */
export const FUEL_ITEMS: ReadonlySet<number> = new Set(
  BLOCK_DEFINITIONS.filter((d) => isBurnable(d.id)).map((d) => d.id)
);

export const SMELTING_RECIPES: SmeltingRecipe[] = [
  { input: BLOCK_ID.RAW_PORK, result: BLOCK_ID.COOKED_PORK, count: 1, name: "Cooked Pork" },
  { input: BLOCK_ID.RAW_BEEF, result: BLOCK_ID.COOKED_BEEF, count: 1, name: "Cooked Beef" },
  { input: BLOCK_ID.RAW_MUTTON, result: BLOCK_ID.COOKED_MUTTON, count: 1, name: "Cooked Mutton" },
  { input: BLOCK_ID.SAND, result: BLOCK_ID.STONE, count: 1, name: "Stone (Smelted)" },
  { input: BLOCK_ID.IRON_ORE, result: BLOCK_ID.IRON_INGOT, count: 1, name: "Iron Ingot" },
  { input: BLOCK_ID.DIAMOND_ORE, result: BLOCK_ID.DIAMOND, count: 1, name: "Diamond" },
];

/** Find a smelting recipe for the given input item. */
export function findSmeltingRecipe(inputId: number): SmeltingRecipe | null {
  return SMELTING_RECIPES.find((r) => r.input === inputId) ?? null;
}

/** Check if an item can be used as fuel. */
export function isFuel(itemId: number): boolean {
  return isBurnable(itemId);
}
