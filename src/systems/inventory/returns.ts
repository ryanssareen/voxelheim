import { BLOCK_ID } from "@data/blocks";
import { MAX_STACK, type ItemStack } from "@store/useHotbarStore";
import { applyPlan, quickMove, type QuickMoveContext, type Region } from "@systems/inventory/transfer";
import { buildLayout } from "@systems/inventory/layout";
import { hotbarRegion, storageRegion, stackable } from "@systems/inventory/regions";

/**
 * Moves one item stack into the player's hotbar/storage (same priority order
 * and merge-then-empty rule as any other quick-move). Returns the leftover
 * stack (empty if it all fit) and the updated player array.
 */
function moveIntoPlayer(item: ItemStack, player: ReadonlyArray<ItemStack>): { player: ItemStack[]; leftover: ItemStack } {
  if (item.count === 0) return { player: [...player], leftover: item };

  const layout = buildLayout(player, [item], [], { blockId: BLOCK_ID.AIR, count: 0 });
  const sourceIndex = layout.ranges.container[0];
  const sourceRegion: Region = { role: "storage", range: [sourceIndex, sourceIndex + 1], priority: -1, accepts: () => false };
  const destinations = [hotbarRegion(layout), storageRegion(layout)];

  const ctx: QuickMoveContext = { slots: layout.slots, fromSlot: sourceIndex, maxStack: MAX_STACK, stackable };
  const plan = quickMove(item, sourceRegion, destinations, ctx);
  const applied = applyPlan(layout.slots, plan);
  return { player: applied.slice(0, sourceIndex), leftover: applied[sourceIndex] };
}

/**
 * Returns every non-empty container slot and the cursor to the player's
 * hotbar/storage (merging whole stacks, not one unit at a time), leaving
 * whatever does not fit exactly where it was. Pure — never touches a store.
 * Used by close/closeTable/closeFurnace so leftovers are parked rather than
 * lost when the player's inventory is full.
 */
export function returnToPlayer(
  container: ReadonlyArray<ItemStack>,
  cursor: ItemStack,
  player: ReadonlyArray<ItemStack>
): { player: ItemStack[]; container: ItemStack[]; cursor: ItemStack } {
  let nextPlayer: ItemStack[] = [...player];
  const nextContainer: ItemStack[] = [];

  for (const slot of container) {
    const { player: p, leftover } = moveIntoPlayer(slot, nextPlayer);
    nextPlayer = p;
    nextContainer.push(leftover);
  }

  const { player: finalPlayer, leftover: nextCursor } = moveIntoPlayer(cursor, nextPlayer);

  return { player: finalPlayer, container: nextContainer, cursor: nextCursor };
}
