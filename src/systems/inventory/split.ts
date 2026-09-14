import { BLOCK_ID } from "@data/blocks";

/**
 * The split mechanic, as a pure function of the two stacks it touches.
 *
 * Extracted rather than left inside the slot hook so the tests exercise the
 * arithmetic the UI actually runs. `docs/solutions/logic-errors/aabb-max-edge-
 * phantom-block-collision.md` records the cost of the alternative: logic that
 * lives in two places is where fixes stop landing.
 */

export interface Stack {
  blockId: number;
  count: number;
  durability?: number;
}

export interface SplitResult {
  slot: Stack;
  cursor: Stack;
}

export const EMPTY: Stack = { blockId: BLOCK_ID.AIR, count: 0 };

/**
 * Resolves a split against a slot.
 *
 * With an empty cursor the larger half of the slot is taken, matching the genre
 * convention; a single item moves whole, which is also the right answer for a
 * tool. With a held cursor the gesture inverts and places one item down.
 *
 * Returns `null` when the gesture is a no-op, so the caller can skip the write
 * entirely rather than setting identical state.
 *
 * @param stackable whether the held item may merge — tools and armor may not,
 *                  since stacking them would discard one item's durability.
 */
export function splitStack(
  slot: Stack,
  cursor: Stack,
  maxStack: number,
  stackable: boolean
): SplitResult | null {
  if (cursor.count === 0) {
    if (slot.count === 0) return null;
    const take = Math.ceil(slot.count / 2);
    const keep = slot.count - take;
    return {
      cursor: { blockId: slot.blockId, count: take, durability: slot.durability },
      slot:
        keep > 0
          ? { blockId: slot.blockId, count: keep, durability: slot.durability }
          : { ...EMPTY },
    };
  }

  const nextCursor: Stack =
    cursor.count === 1
      ? { ...EMPTY }
      : { blockId: cursor.blockId, count: cursor.count - 1, durability: cursor.durability };

  if (slot.count === 0) {
    return {
      slot: { blockId: cursor.blockId, count: 1, durability: cursor.durability },
      cursor: nextCursor,
    };
  }

  if (slot.blockId === cursor.blockId && stackable && slot.count < maxStack) {
    return {
      slot: { blockId: slot.blockId, count: slot.count + 1, durability: slot.durability },
      cursor: nextCursor,
    };
  }

  return null;
}
