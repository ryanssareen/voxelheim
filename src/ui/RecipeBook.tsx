"use client";

import { useCallback, useMemo, useState } from "react";
import { useHotbarStore } from "@store/useHotbarStore";
import { useInventoryStore } from "@store/useInventoryStore";
import { ITEM_NAMES } from "@data/items";
import { InventorySlot } from "@ui/ItemIcon";
import {
  canCraft,
  countAvailable,
  fillGridFromRecipe,
  listRecipes,
  requirementsFor,
  sortForDisplay,
  type BookEntry,
  type GridFillHost,
  type GridSize,
} from "@systems/crafting/recipeBook";

/**
 * Binds the recipe-fill rules to the live stores. The 2x2 book fills the
 * inventory's crafting grid; the 3x3 book fills the crafting table's.
 */
export function useRecipeFill(gridSize: GridSize) {
  return useCallback(
    (entry: BookEntry) => {
      const inv = useInventoryStore.getState();
      const hotbar = useHotbarStore.getState();
      const host: GridFillHost = {
        readGrid: () =>
          gridSize === 2
            ? useInventoryStore.getState().craftingGrid
            : useInventoryStore.getState().tableGrid,
        setCell: (index, blockId, count) =>
          gridSize === 2
            ? inv.setCraftingSlot(index, blockId, count)
            : inv.setTableSlot(index, blockId, count),
        takeItems: (blockId, count) => hotbar.takeItems(blockId, count),
        addItem: (blockId) => hotbar.addItem(blockId),
      };
      fillGridFromRecipe(entry, host);
    },
    [gridSize]
  );
}

/**
 * Browsable list of every recipe the current grid can produce. Recipes the
 * player has the materials for are highlighted and clickable — clicking lays
 * the ingredients straight into the grid. The rest stay listed but dimmed, so
 * the book doubles as a reference for what to go and gather.
 */
export function RecipeBook({
  gridSize,
  onFill,
  width,
  maxHeight,
}: {
  gridSize: GridSize;
  /** Lay this recipe's ingredients into the crafting grid. */
  onFill: (entry: BookEntry) => void;
  /** Preferred width, px. The book flexes and may wrap to its own row. */
  width?: number;
  /** Max list height before it scrolls, px. */
  maxHeight?: number;
}) {
  const slots = useHotbarStore((s) => s.slots);
  const [craftableOnly, setCraftableOnly] = useState(false);

  const available = useMemo(() => countAvailable(slots), [slots]);
  const entries = useMemo(() => listRecipes(gridSize), [gridSize]);

  const shown = useMemo(() => {
    const sorted = sortForDisplay(entries, available);
    return craftableOnly ? sorted.filter((e) => canCraft(e, available)) : sorted;
  }, [entries, available, craftableOnly]);

  const craftableCount = useMemo(
    () => entries.filter((e) => canCraft(e, available)).length,
    [entries, available]
  );

  return (
    <div
      className="flex flex-col min-w-0"
      style={{ flex: `1 1 ${width ?? 260}px`, maxWidth: "100%" }}
    >
      <div className="flex items-baseline justify-between mb-1">
        <p className="text-[11px] font-mono text-[#606060]">
          Recipes{" "}
          <span className="text-[#909090]">
            ({craftableCount}/{entries.length})
          </span>
        </p>
        <button
          onClick={() => setCraftableOnly((v) => !v)}
          className="text-[10px] font-mono px-1.5 py-0.5 hover:brightness-110"
          style={{
            background: craftableOnly ? "#5a8a4a" : "#8a8a8a",
            border: "2px solid",
            borderColor: "#fafafa #6a6a6a #6a6a6a #fafafa",
            color: craftableOnly ? "#fff" : "#303030",
          }}
        >
          {craftableOnly ? "Craftable" : "All"}
        </button>
      </div>

      <div
        className="overflow-y-auto pr-1"
        style={{
          maxHeight: maxHeight ?? 232,
          background: "#8a8a8a",
          border: "2px solid",
          borderColor: "#6a6a6a #fafafa #fafafa #6a6a6a",
        }}
      >
        {shown.length === 0 ? (
          <p className="text-[11px] font-mono text-[#505050] p-3 text-center">
            Nothing craftable yet — gather some materials.
          </p>
        ) : (
          <ul className="flex flex-col">
            {shown.map((entry) => (
              <RecipeRow
                key={entry.id}
                entry={entry}
                available={available}
                onFill={onFill}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function RecipeRow({
  entry,
  available,
  onFill,
}: {
  entry: BookEntry;
  available: ReadonlyMap<number, number>;
  onFill: (entry: BookEntry) => void;
}) {
  const ok = canCraft(entry, available);
  const needs = useMemo(() => [...requirementsFor(entry)], [entry]);

  return (
    <li>
      <button
        onClick={() => ok && onFill(entry)}
        disabled={!ok}
        title={
          ok
            ? `Click to lay out ${entry.name}`
            : `Missing: ${needs
                .filter(([id, n]) => (available.get(id) ?? 0) < n)
                .map(([id, n]) => `${ITEM_NAMES[id] ?? `#${id}`} x${n - (available.get(id) ?? 0)}`)
                .join(", ")}`
        }
        className="w-full flex items-center gap-2 px-1.5 py-1 text-left hover:brightness-110 disabled:cursor-default"
        style={{
          background: ok ? "rgba(90,138,74,0.35)" : "transparent",
          opacity: ok ? 1 : 0.45,
          borderBottom: "1px solid rgba(0,0,0,0.15)",
        }}
      >
        <InventorySlot
          item={{ blockId: entry.result, count: entry.count }}
          size={30}
        />
        <span className="flex-1 min-w-0">
          <span className="block text-[11px] font-mono text-[#202020] truncate">
            {entry.name}
          </span>
          <span className="block text-[10px] font-mono text-[#404040] truncate">
            {needs
              .map(([id, n]) => `${n}x ${ITEM_NAMES[id] ?? `#${id}`}`)
              .join(" + ")}
          </span>
        </span>
      </button>
    </li>
  );
}
