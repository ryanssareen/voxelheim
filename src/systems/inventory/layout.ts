import { HOTBAR_SLOTS, TOTAL_SLOTS, type ItemStack } from "@store/useHotbarStore";

/**
 * The single mapping from the player's separate stores (hotbar+storage array,
 * a container's own slots, armor array, offhand slot) into one flat slot
 * space. Every screen builds one of these; nothing else may invent its own
 * index arithmetic.
 *
 * Layout: [0, HOTBAR_SLOTS) hotbar, [HOTBAR_SLOTS, TOTAL_SLOTS) storage,
 * [TOTAL_SLOTS, TOTAL_SLOTS+n) the container's own slots (n = container
 * length; a container that ends in a virtual "output" slot includes it as
 * its last entry), then armor, then offhand.
 */

export interface LayoutRanges {
  /** Half-open [start, end) index range. */
  hotbar: [number, number];
  storage: [number, number];
  container: [number, number];
  armor: [number, number];
  offhand: number;
}

export interface Layout {
  slots: ItemStack[];
  ranges: LayoutRanges;
}

/** Builds the flat slot space for one open screen. Pure; reads nothing. */
export function buildLayout(
  player: ReadonlyArray<ItemStack>,
  container: ReadonlyArray<ItemStack>,
  armor: ReadonlyArray<ItemStack>,
  offhand: ItemStack
): Layout {
  const containerStart = TOTAL_SLOTS;
  const containerEnd = containerStart + container.length;
  const armorStart = containerEnd;
  const armorEnd = armorStart + armor.length;
  const offhandIndex = armorEnd;

  return {
    slots: [...player, ...container, ...armor, offhand],
    ranges: {
      hotbar: [0, HOTBAR_SLOTS],
      storage: [HOTBAR_SLOTS, TOTAL_SLOTS],
      container: [containerStart, containerEnd],
      armor: [armorStart, armorEnd],
      offhand: offhandIndex,
    },
  };
}

/** Inverse of buildLayout: splits a flat slot array back into its parts. */
export function splitLayout(
  slots: ReadonlyArray<ItemStack>,
  ranges: LayoutRanges
): { player: ItemStack[]; container: ItemStack[]; armor: ItemStack[]; offhand: ItemStack } {
  return {
    player: slots.slice(ranges.hotbar[0], ranges.storage[1]),
    container: slots.slice(ranges.container[0], ranges.container[1]),
    armor: slots.slice(ranges.armor[0], ranges.armor[1]),
    offhand: slots[ranges.offhand],
  };
}
