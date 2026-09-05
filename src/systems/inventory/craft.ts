import { BLOCK_ID } from "@data/blocks";
import { getArmorDef, getToolDef } from "@data/items";
import type { RecipeFinder } from "@systems/crafting/craft";
import { MAX_STACK, type ItemStack } from "@store/useHotbarStore";
import { applyPlan, quickMove, type QuickMoveContext, type Region } from "@systems/inventory/transfer";
import { type Layout } from "@systems/inventory/layout";
import { stackable } from "@systems/inventory/regions";

/**
 * Derives the virtual output stack a craft/furnace grid currently resolves
 * to. The output slot is never stored — it is recomputed from the live grid
 * every time it is needed.
 */
export function outputStackFor(grid: ReadonlyArray<ItemStack>, find: RecipeFinder): ItemStack {
  const cells = grid.map((c) => (c.count > 0 ? c.blockId : 0));
  const recipe = find(cells);
  if (!recipe) return { blockId: BLOCK_ID.AIR, count: 0 };
  const durability = getToolDef(recipe.result)?.durability ?? getArmorDef(recipe.result)?.durability;
  return { blockId: recipe.result, count: recipe.count, durability };
}

/**
 * Shift-click on a craft/furnace output slot. Re-derives the recipe from the
 * live grid (a by-value convention: the container's LAST slot is always the
 * virtual output slot, everything before it in the container range is the
 * craft/furnace input), then quick-moves the whole result stack into
 * hotbar/storage. Consumes the grid (one craft) only if the whole result
 * stack fits somewhere; otherwise this is a no-op and nothing is consumed.
 */
export function craftOnce(
  layout: Layout,
  regions: ReadonlyArray<Region>,
  find: RecipeFinder,
  maxStack: number
): ItemStack[] | null {
  const [containerStart, containerEnd] = layout.ranges.container;
  const outputIndex = containerEnd - 1;
  const craftRange: [number, number] = [containerStart, outputIndex];

  const grid = layout.slots.slice(craftRange[0], craftRange[1]);
  const result = outputStackFor(grid, find);
  if (result.count === 0) return null;

  const outputRegion = regions.find(
    (r) => r.role === "output" && outputIndex >= r.range[0] && outputIndex < r.range[1]
  );
  if (!outputRegion) return null;

  const withResult = [...layout.slots];
  withResult[outputIndex] = result;

  // The crafted result always goes to the player, never back into the input
  // grid it was just consumed from — craftInput is excluded even though it
  // now outranks storage as a quick-move destination for ordinary items.
  const destRegions = regions.filter((r) => r.role !== "craftInput");
  const ctx: QuickMoveContext = { slots: withResult, fromSlot: outputIndex, maxStack, stackable };
  const plan = quickMove(result, outputRegion, destRegions, ctx);
  if (plan.remainder > 0) return null;

  let next = applyPlan(withResult, plan);
  next = next.map((slot, i) => {
    if (i < craftRange[0] || i >= craftRange[1]) return slot;
    return slot.count <= 1 ? { blockId: BLOCK_ID.AIR, count: 0 } : { blockId: slot.blockId, count: slot.count - 1 };
  });
  next[outputIndex] = { blockId: BLOCK_ID.AIR, count: 0 };
  return next;
}

/**
 * Resolves one click at a flat slot index against a screen's layout: a
 * shift-click on an output slot crafts once (see craftOnce above); any other
 * slot quick-moves its contents into the best-accepting region. Returns the
 * updated flat slot array, or null when nothing happened (nothing to move,
 * or the result did not fully fit).
 */
export function quickMoveAt(
  layout: Layout,
  regions: ReadonlyArray<Region>,
  flatIndex: number,
  find: RecipeFinder,
  maxStack: number = MAX_STACK
): ItemStack[] | null {
  const fromRegion = regions.find((r) => flatIndex >= r.range[0] && flatIndex < r.range[1]);
  if (!fromRegion) return null;

  if (fromRegion.role === "output") {
    return craftOnce(layout, regions, find, maxStack);
  }

  const item = layout.slots[flatIndex];
  if (!item || item.count === 0) return null;

  const ctx: QuickMoveContext = { slots: layout.slots, fromSlot: flatIndex, maxStack, stackable };
  const plan = quickMove(item, fromRegion, regions, ctx);
  if (plan.moves.length === 0) return null;
  return applyPlan(layout.slots, plan);
}
