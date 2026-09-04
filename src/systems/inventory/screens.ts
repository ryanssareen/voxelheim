import { useHotbarStore, type ItemStack } from "@store/useHotbarStore";
import { useInventoryStore } from "@store/useInventoryStore";
import { findRecipeForCells } from "@systems/crafting/recipes";
import { findSmeltingRecipe, isFuel } from "@systems/crafting/smelting";
import type { RecipeFinder } from "@systems/crafting/craft";
import { buildLayout, splitLayout, type Layout } from "@systems/inventory/layout";
import {
  hotbarRegion,
  storageRegion,
  craftInputRegion,
  furnaceInputRegion,
  furnaceFuelRegion,
  armorRegions,
  offhandRegion,
  outputRegion,
} from "@systems/inventory/regions";
import { outputStackFor } from "@systems/inventory/craft";
import type { Region } from "@systems/inventory/transfer";

/**
 * One descriptor per open UI screen: the flat layout, the regions that
 * govern quick-move, the recipe finder for its output slot (if any), and the
 * single place stores are written back to. Every factory here reads the
 * stores fresh (via getState()) so it reflects state at click time, not at
 * whatever point the caller happened to render.
 */
export interface ScreenDescriptor {
  layout: Layout;
  regions: Region[];
  find: RecipeFinder;
  /** Commits a resolved flat slot array: exactly one hotbar setState, one inventory setState. */
  write: (next: ItemStack[]) => void;
}

/** A furnace grid is [input, fuel]; smelting is fuel-gated, unlike the craft grids. */
export const furnaceFinder: RecipeFinder = (cells) => {
  const [inputId, fuelId] = cells;
  if (!isFuel(fuelId)) return null;
  return findSmeltingRecipe(inputId);
};

function craftScreen(
  grid: ReadonlyArray<ItemStack>,
  writeGrid: (grid: ItemStack[]) => void
): ScreenDescriptor {
  const hotbar = useHotbarStore.getState();
  const find = findRecipeForCells;
  const output = outputStackFor(grid, find);
  const container = [...grid, output];
  const layout = buildLayout(hotbar.slots, container, hotbar.armor, hotbar.offhand);
  const outputIndex = layout.ranges.container[1] - 1;
  const craftRange: [number, number] = [layout.ranges.container[0], outputIndex];

  const regions: Region[] = [
    hotbarRegion(layout),
    storageRegion(layout),
    craftInputRegion(craftRange),
    outputRegion(outputIndex),
    ...armorRegions(layout),
    offhandRegion(layout),
  ];

  return {
    layout,
    regions,
    find,
    write: (next) => {
      const split = splitLayout(next, layout.ranges);
      useHotbarStore.setState({ slots: split.player, armor: split.armor, offhand: split.offhand });
      writeGrid(split.container.slice(0, split.container.length - 1));
    },
  };
}

/** The survival inventory's 2x2 crafting grid. */
export function inventoryScreen(): ScreenDescriptor {
  const inv = useInventoryStore.getState();
  return craftScreen(inv.craftingGrid, (grid) => useInventoryStore.setState({ craftingGrid: grid }));
}

/** The crafting table's 3x3 grid. */
export function tableScreen(): ScreenDescriptor {
  const inv = useInventoryStore.getState();
  return craftScreen(inv.tableGrid, (grid) => useInventoryStore.setState({ tableGrid: grid }));
}

/** The furnace's [input, fuel] pair. */
export function furnaceScreen(): ScreenDescriptor {
  const hotbar = useHotbarStore.getState();
  const inv = useInventoryStore.getState();
  const find = furnaceFinder;
  const output = outputStackFor(inv.furnaceSlots, find);
  const container = [...inv.furnaceSlots, output];
  const layout = buildLayout(hotbar.slots, container, hotbar.armor, hotbar.offhand);
  const [containerStart] = layout.ranges.container;
  const inputIndex = containerStart;
  const fuelIndex = containerStart + 1;
  const outputIndex = containerStart + 2;

  const regions: Region[] = [
    hotbarRegion(layout),
    storageRegion(layout),
    furnaceInputRegion(inputIndex),
    furnaceFuelRegion(fuelIndex),
    outputRegion(outputIndex),
    ...armorRegions(layout),
    offhandRegion(layout),
  ];

  return {
    layout,
    regions,
    find,
    write: (next) => {
      const split = splitLayout(next, layout.ranges);
      useHotbarStore.setState({ slots: split.player, armor: split.armor, offhand: split.offhand });
      useInventoryStore.setState({ furnaceSlots: split.container.slice(0, split.container.length - 1) });
    },
  };
}

/** The creative palette has no container of its own — only player/armor/offhand. */
export function creativeScreen(): ScreenDescriptor {
  const hotbar = useHotbarStore.getState();
  const layout = buildLayout(hotbar.slots, [], hotbar.armor, hotbar.offhand);

  const regions: Region[] = [
    hotbarRegion(layout),
    storageRegion(layout),
    ...armorRegions(layout),
    offhandRegion(layout),
  ];

  return {
    layout,
    regions,
    find: () => null,
    write: (next) => {
      const split = splitLayout(next, layout.ranges);
      useHotbarStore.setState({ slots: split.player, armor: split.armor, offhand: split.offhand });
    },
  };
}
