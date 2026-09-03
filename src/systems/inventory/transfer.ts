import type { ItemStack } from "@store/useHotbarStore";

/**
 * Container-transfer contract (quick-move / shift-click).
 *
 * Every open screen describes itself as a flat slot space plus a list of
 * regions. Slot indices 0..TOTAL_SLOTS-1 are always the player's hotbar
 * (0..8) and main storage (9..35) from useHotbarStore; a container appends
 * its own slots after that. Each region says what it accepts and how
 * attractive it is as a quick-move destination. The resolver is pure: it
 * never touches a store, it only returns a plan the caller applies.
 *
 * Adding a container means declaring regions. Nothing else.
 */

export type SlotRole =
  | "storage"
  | "hotbar"
  | "craftInput"
  | "furnaceInput"
  | "furnaceFuel"
  | "output"
  | "armor"
  | "offhand";

export interface Region {
  role: SlotRole;
  /** Half-open [start, end) index range in the flat slot space. */
  range: [number, number];
  /** Whether this region may receive the given stack (type gate only, not capacity). */
  accepts: (item: ItemStack) => boolean;
  /**
   * Destination preference. Higher wins. A region with priority < 0 is never a
   * quick-move destination (e.g. offhand); `output` regions are take-only and
   * ignore priority.
   */
  priority: number;
}

export interface TransferMove {
  from: number;
  to: number;
  count: number;
}

export interface TransferPlan {
  /** Ordered moves; applying them in sequence realises the transfer. */
  moves: TransferMove[];
  /** Items that found no destination and stay in the source slot. */
  remainder: number;
}

export interface QuickMoveContext {
  /** Current contents of the whole flat slot space. */
  slots: ReadonlyArray<ItemStack>;
  /** Source slot index inside `fromRegion.range`. */
  fromSlot: number;
  /** Stack cap for stackable items — pass MAX_STACK from useHotbarStore. */
  maxStack: number;
  /** Items that never merge (tools, armor) report false here. */
  stackable: (item: ItemStack) => boolean;
}

/**
 * Plan a quick-move of `item` out of `fromRegion` into the best accepting
 * region(s) among `regions`.
 *
 * Rules:
 * - Destinations are the accepting regions other than `fromRegion`, ordered by
 *   descending priority. Ties keep declaration order.
 * - Within a destination, merge into existing partial stacks of the same item
 *   first, then fill empty slots, in ascending slot order.
 * - Move the whole stack, or as much as fits; the rest is `remainder`.
 * - Regions with role "output" are never destinations.
 * - Regions with priority < 0 are never destinations.
 * - The plan never exceeds `maxStack` in any slot and never merges an
 *   unstackable item.
 */
export function quickMove(
  item: ItemStack,
  fromRegion: Region,
  regions: ReadonlyArray<Region>,
  ctx: QuickMoveContext
): TransferPlan {
  void item;
  void fromRegion;
  void regions;
  void ctx;
  throw new Error("quickMove is not implemented yet (Workstream G)");
}
