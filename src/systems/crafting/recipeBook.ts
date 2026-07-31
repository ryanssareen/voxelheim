import type { ItemStack } from "@store/useHotbarStore";
import {
  RECIPES,
  RECIPES_3x3,
  type CraftingRecipe,
  type CraftingRecipe3x3,
} from "@systems/crafting/recipes";

/**
 * Recipe-book logic, kept free of React and of the stores so the "can I craft
 * this / what does it cost" rules can be tested directly.
 *
 * A 2x2 recipe can be laid into a 3x3 grid, but not the reverse, so the book
 * shown beside the inventory's 2x2 grid is a subset of the crafting table's.
 */

/** Grid width the player is crafting on. 2 = inventory, 3 = crafting table. */
export type GridSize = 2 | 3;

/** A recipe normalised to the grid it will actually be placed into. */
export interface BookEntry {
  /** Stable identity for React keys and selection. */
  id: string;
  name: string;
  result: number;
  count: number;
  /** Cells for the target grid, row-major, length gridSize². 0 = empty. */
  cells: number[];
  /** Grid this entry's cells are laid out for. */
  gridSize: GridSize;
}

/** Lays a 2x2 recipe into the top-left corner of a 3x3 grid. */
function lift2x2To3x3(grid: CraftingRecipe["grid"]): number[] {
  return [grid[0], grid[1], 0, grid[2], grid[3], 0, 0, 0, 0];
}

function entryFrom2x2(recipe: CraftingRecipe, index: number, gridSize: GridSize): BookEntry {
  return {
    id: `2x2-${index}`,
    name: recipe.name,
    result: recipe.result,
    count: recipe.count,
    cells: gridSize === 2 ? [...recipe.grid] : lift2x2To3x3(recipe.grid),
    gridSize,
  };
}

function entryFrom3x3(recipe: CraftingRecipe3x3, index: number): BookEntry {
  return {
    id: `3x3-${index}`,
    name: recipe.name,
    result: recipe.result,
    count: recipe.count,
    cells: [...recipe.grid],
    gridSize: 3,
  };
}

/**
 * Every recipe the given grid can actually produce. The 2x2 grid sees only the
 * small recipes; the 3x3 grid sees those plus the table-only ones.
 */
export function listRecipes(gridSize: GridSize): BookEntry[] {
  const small = RECIPES.map((r, i) => entryFrom2x2(r, i, gridSize));
  if (gridSize === 2) return small;
  return [...small, ...RECIPES_3x3.map(entryFrom3x3)];
}

/** How many of each block id a recipe consumes. */
export function requirementsFor(entry: BookEntry): Map<number, number> {
  const need = new Map<number, number>();
  for (const cell of entry.cells) {
    if (cell === 0) continue;
    need.set(cell, (need.get(cell) ?? 0) + 1);
  }
  return need;
}

/** Totals every block id held across the given inventory slots. */
export function countAvailable(slots: ReadonlyArray<ItemStack>): Map<number, number> {
  const have = new Map<number, number>();
  for (const slot of slots) {
    if (slot.count <= 0 || slot.blockId === 0) continue;
    have.set(slot.blockId, (have.get(slot.blockId) ?? 0) + slot.count);
  }
  return have;
}

/** Whether the held items cover everything the recipe consumes. */
export function canCraft(
  entry: BookEntry,
  available: ReadonlyMap<number, number>
): boolean {
  for (const [blockId, needed] of requirementsFor(entry)) {
    if ((available.get(blockId) ?? 0) < needed) return false;
  }
  return true;
}

/**
 * The bits of the inventory + grid stores that laying out a recipe needs.
 * Abstracted so the item-shuffling rules can be tested without React.
 */
export interface GridFillHost {
  /** Current contents of the crafting grid, row-major. */
  readGrid: () => ReadonlyArray<ItemStack>;
  /** Write one grid cell. count 0 clears it. */
  setCell: (index: number, blockId: number, count: number) => void;
  /** Remove up to `count` of `blockId` from the inventory; returns how many. */
  takeItems: (blockId: number, count: number) => number;
  /** Put one item back into the inventory. False when there is no room. */
  addItem: (blockId: number) => boolean;
}

/** Returns everything currently in the grid to the inventory, cell by cell. */
function clearGridToInventory(host: GridFillHost): void {
  const grid = host.readGrid();
  for (let i = 0; i < grid.length; i++) {
    const cell = grid[i];
    if (cell.count <= 0 || cell.blockId === 0) continue;
    let left = cell.count;
    while (left > 0 && host.addItem(cell.blockId)) left--;
    // Anything that would not fit stays put rather than vanishing.
    host.setCell(i, left > 0 ? cell.blockId : 0, left);
  }
}

/**
 * Lays a recipe's ingredients into the crafting grid, pulling them out of the
 * inventory. Clears the grid back into the inventory first.
 *
 * Returns false and restores what it took if the inventory turns out not to
 * cover the recipe — so a click can never half-fill a grid or eat items.
 */
export function fillGridFromRecipe(entry: BookEntry, host: GridFillHost): boolean {
  clearGridToInventory(host);

  const need = requirementsFor(entry);
  const taken = new Map<number, number>();
  let short = false;

  for (const [blockId, count] of need) {
    const got = host.takeItems(blockId, count);
    taken.set(blockId, got);
    if (got < count) {
      short = true;
      break;
    }
  }

  if (short) {
    for (const [blockId, count] of taken) {
      for (let i = 0; i < count; i++) host.addItem(blockId);
    }
    return false;
  }

  for (let i = 0; i < entry.cells.length; i++) {
    const blockId = entry.cells[i];
    host.setCell(i, blockId, blockId === 0 ? 0 : 1);
  }
  return true;
}

/**
 * Recipes ordered for display: craftable first, then by name, so what the
 * player can act on right now floats to the top without the list reshuffling
 * unpredictably as items come and go.
 */
export function sortForDisplay(
  entries: ReadonlyArray<BookEntry>,
  available: ReadonlyMap<number, number>
): BookEntry[] {
  return [...entries].sort((a, b) => {
    const aOk = canCraft(a, available);
    const bOk = canCraft(b, available);
    if (aOk !== bOk) return aOk ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}
