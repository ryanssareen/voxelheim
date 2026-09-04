import { getArmorDef, getToolDef } from "@data/items";
import { findRecipeForCells } from "@systems/crafting/recipes";

/** An item stack as used inside a crafting grid or on the cursor. */
export interface CraftStack {
  blockId: number;
  count: number;
  durability?: number;
}

/** The result of resolving one click on a crafting result slot. */
export interface CraftOutcome {
  grid: CraftStack[];
  cursor: CraftStack;
}

/** Looks up the recipe (if any) that matches a flattened grid of block ids. */
export type RecipeFinder = (cells: number[]) => { result: number; count: number } | null;

/**
 * Resolves one click on a crafting result slot against the LIVE grid and
 * cursor. Returns null when nothing matches or the cursor cannot take the
 * result (foreign item, tool on cursor, or stack overflow) — the click is then
 * a no-op, so nothing is consumed and nothing is lost.
 */
export function resolveCraft(
  grid: ReadonlyArray<CraftStack>,
  cursor: CraftStack,
  maxStack: number,
  find: RecipeFinder = findRecipeForCells
): CraftOutcome | null {
  const recipe = find(grid.map((c) => (c.count > 0 ? c.blockId : 0)));
  if (!recipe) return null;
  const tool = getToolDef(recipe.result);
  const armor = getArmorDef(recipe.result);
  const durability = tool?.durability ?? armor?.durability;
  let next: CraftStack;
  if (cursor.count === 0) {
    next = { blockId: recipe.result, count: recipe.count, durability };
  } else if (!tool && !armor && cursor.blockId === recipe.result && cursor.count + recipe.count <= maxStack) {
    next = { blockId: recipe.result, count: cursor.count + recipe.count };
  } else {
    return null;
  }
  const consumed = grid.map((c) =>
    c.count <= 1 ? { blockId: 0, count: 0 } : { blockId: c.blockId, count: c.count - 1 }
  );
  return { grid: consumed, cursor: next };
}
