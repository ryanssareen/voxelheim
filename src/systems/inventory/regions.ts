import { BLOCK_ID } from "@data/blocks";
import { getArmorDef, getArmorSlotIndex, getToolDef } from "@data/items";
import { findSmeltingRecipe, isFuel } from "@systems/crafting/smelting";
import type { ItemStack } from "@store/useHotbarStore";
import type { Region } from "@systems/inventory/transfer";
import type { Layout } from "@systems/inventory/layout";

/**
 * Data-driven region factories. Every predicate reads block/tool/armor/
 * recipe data — never a container name or block-id switch.
 */

export function hotbarRegion(layout: Layout): Region {
  return { role: "hotbar", range: layout.ranges.hotbar, priority: 5, accepts: () => true };
}

export function storageRegion(layout: Layout): Region {
  return { role: "storage", range: layout.ranges.storage, priority: 4, accepts: () => true };
}

/**
 * A crafting grid (2x2 or 3x3). Never a quick-move destination — Minecraft
 * does not quick-move items into a crafting grid — but still a valid source
 * (shift-clicking a grid cell sends it back to the player).
 */
export function craftInputRegion(range: [number, number]): Region {
  return {
    role: "craftInput",
    range,
    priority: -1,
    accepts: (item: ItemStack) => item.blockId !== BLOCK_ID.AIR && item.count > 0,
  };
}

export function furnaceInputRegion(index: number): Region {
  return {
    role: "furnaceInput",
    range: [index, index + 1],
    priority: 30,
    accepts: (item: ItemStack) => findSmeltingRecipe(item.blockId) !== null,
  };
}

export function furnaceFuelRegion(index: number): Region {
  return {
    role: "furnaceFuel",
    range: [index, index + 1],
    priority: 20,
    accepts: (item: ItemStack) => isFuel(item.blockId),
  };
}

/** One region per armor slot (helmet/chest/legs/boots), each accepting only its own piece. */
export function armorRegions(layout: Layout): Region[] {
  const [start, end] = layout.ranges.armor;
  return Array.from({ length: end - start }, (_, k) => {
    const index = start + k;
    const region: Region = {
      role: "armor",
      range: [index, index + 1],
      priority: 25,
      accepts: (item: ItemStack) => {
        const def = getArmorDef(item.blockId);
        return def !== null && getArmorSlotIndex(def.slot) === k;
      },
    };
    return region;
  });
}

export function offhandRegion(layout: Layout): Region {
  return {
    role: "offhand",
    range: [layout.ranges.offhand, layout.ranges.offhand + 1],
    priority: -1,
    accepts: () => true,
  };
}

/** Take-only: never a quick-move destination regardless of priority. */
export function outputRegion(index: number): Region {
  return { role: "output", range: [index, index + 1], priority: -1, accepts: () => false };
}

/** Tools and armor are unstackable; everything else stacks. */
export function stackable(item: ItemStack): boolean {
  return !getToolDef(item.blockId) && !getArmorDef(item.blockId);
}
