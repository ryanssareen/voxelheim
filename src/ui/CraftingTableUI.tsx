"use client";

import { useCallback, useMemo, useState, useEffect } from "react";
import { useInventoryStore } from "@store/useInventoryStore";
import {
  useHotbarStore,
  HOTBAR_SLOTS,
  MAX_STACK,
  TOTAL_SLOTS,
} from "@store/useHotbarStore";
import { findRecipe3x3 } from "@systems/crafting/recipes";
import { resolveCraft } from "@systems/crafting/craft";
import { quickMoveAt } from "@systems/inventory/craft";
import { tableScreen } from "@systems/inventory/screens";
import { ItemIcon, InventorySlot } from "@ui/ItemIcon";
import { RecipeBook, useRecipeFill } from "@ui/RecipeBook";
import { usePanelMetrics } from "@ui/usePanelMetrics";
import { useSlotInteractions } from "@ui/useSlotInteractions";

export function CraftingTableUI() {
  const tableOpen = useInventoryStore((s) => s.tableOpen);
  const tableGrid = useInventoryStore((s) => s.tableGrid);
  const cursorItem = useInventoryStore((s) => s.cursorItem);
  const slots = useHotbarStore((s) => s.slots);
  const selectedIndex = useHotbarStore((s) => s.selectedIndex);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (!tableOpen) return;
    const handler = (e: MouseEvent) => setMousePos({ x: e.clientX, y: e.clientY });
    window.addEventListener("mousemove", handler);
    return () => window.removeEventListener("mousemove", handler);
  }, [tableOpen]);

  const { handleSlotClick } = useSlotInteractions();
  const fillFromRecipe = useRecipeFill(3);
  const metrics = usePanelMetrics();

  const recipe = useMemo(() => {
    const grid = tableGrid.map((s) =>
      s.count > 0 ? s.blockId : 0
    ) as [number, number, number, number, number, number, number, number, number];
    return findRecipe3x3(grid);
  }, [tableGrid]);

  const handleGridClick = useCallback((index: number) => {
    const invStore = useInventoryStore.getState();
    const slot = invStore.tableGrid[index];
    const cursor = invStore.cursorItem;

    if (cursor.count === 0 && slot.count > 0) {
      invStore.setCursorItem(slot.blockId, slot.count, slot.durability);
      invStore.setTableSlot(index, 0, 0);
    } else if (cursor.count > 0 && slot.count === 0) {
      invStore.setTableSlot(index, cursor.blockId, 1, cursor.durability);
      if (cursor.count === 1) invStore.clearCursor();
      else invStore.setCursorItem(cursor.blockId, cursor.count - 1, cursor.durability);
    } else if (cursor.count > 0 && slot.count > 0 && cursor.blockId === slot.blockId) {
      invStore.setTableSlot(index, slot.blockId, slot.count + 1, cursor.durability);
      if (cursor.count === 1) invStore.clearCursor();
      else invStore.setCursorItem(cursor.blockId, cursor.count - 1, cursor.durability);
    }
  }, []);

  const handleCraftResult = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.shiftKey) {
      const screen = tableScreen();
      const outputIndex = screen.layout.ranges.container[1] - 1;
      const next = quickMoveAt(screen.layout, screen.regions, outputIndex, screen.find, MAX_STACK);
      if (next) screen.write(next);
      return;
    }
    useInventoryStore.setState((state) => {
      const outcome = resolveCraft(state.tableGrid, state.cursorItem, MAX_STACK);
      if (!outcome) return state;
      return { ...state, tableGrid: outcome.grid, cursorItem: outcome.cursor };
    });
  }, []);

  if (!tableOpen) return null;

  const hotbarSlots = slots.slice(0, HOTBAR_SLOTS);
  const mainSlots = slots.slice(HOTBAR_SLOTS, TOTAL_SLOTS);
  const S = metrics.slot;
  const RS = metrics.resultSlot;

  return (
    <div className="absolute inset-0 flex items-center justify-center z-30 bg-black/60 p-2">
      <div
        className="flex flex-col rounded overflow-y-auto"
        style={{
          gap: metrics.sectionGap,
          padding: metrics.pad,
          maxHeight: metrics.panelMaxHeight,
          maxWidth: "100%",
          background: "#c6c6c6",
          border: "4px solid #555",
          boxShadow:
            "inset 2px 2px 0 #fafafa, inset -2px -2px 0 #8a8a8a, 0 8px 24px rgba(0,0,0,0.5)",
        }}
      >
        {/* Title */}
        <p className="text-[13px] font-mono text-[#404040] font-bold">Crafting</p>

        {/* 3x3 grid + arrow + result + recipe book. Wraps on a narrow viewport. */}
        <div
          className="flex items-center gap-x-5 gap-y-3"
          style={{ flexWrap: metrics.wrapTopRow ? "wrap" : "nowrap" }}
        >
          <div className="grid grid-cols-3 gap-1">
            {tableGrid.map((slot, i) => (
              <InventorySlot
                key={`tbl-${i}`}
                item={slot}
                onClick={() => handleGridClick(i)}
                size={S}
              />
            ))}
          </div>
          <div className="text-3xl text-[#606060] font-bold select-none">→</div>
          <InventorySlot
            item={
              recipe
                ? { blockId: recipe.result, count: recipe.count }
                : { blockId: 0, count: 0 }
            }
            onClick={handleCraftResult}
            size={RS}
            highlight={!!recipe}
          />
          <RecipeBook
            gridSize={3}
            onFill={fillFromRecipe}
            width={metrics.recipeWidth}
            maxHeight={metrics.recipeMaxHeight}
          />
        </div>

        {recipe && (
          <p className="text-[11px] font-mono text-[#505050]">
            {recipe.name}
          </p>
        )}

        {/* Separator */}
        <div className="w-full h-px bg-[#999]" />

        {/* Inventory label */}
        <p className="text-[11px] font-mono text-[#606060]">Inventory</p>

        {/* Main inventory: 3 rows x 9 columns */}
        <div className="grid grid-cols-9 gap-1">
          {mainSlots.map((slot, i) => (
            <InventorySlot
              key={`inv-${i}`}
              item={slot}
              onClick={(e) => handleSlotClick(e, HOTBAR_SLOTS + i)}
              size={S}
            />
          ))}
        </div>

        {/* Separator */}
        <div className="w-full h-px bg-[#999]" />

        {/* Hotbar */}
        <div className="grid grid-cols-9 gap-1">
          {hotbarSlots.map((slot, i) => (
            <InventorySlot
              key={`hot-${i}`}
              item={slot}
              onClick={(e) => handleSlotClick(e, i)}
              size={S}
              highlight={i === selectedIndex}
            />
          ))}
        </div>

        <div className="flex justify-end">
          <p className="text-[11px] font-mono text-[#909090]">Press E to close</p>
        </div>
      </div>

      {/* Floating cursor item */}
      {cursorItem.count > 0 && (
        <div
          className="fixed pointer-events-none z-50 flex items-center justify-center"
          style={{
            left: mousePos.x + 8,
            top: mousePos.y + 8,
            width: 40,
            height: 40,
          }}
        >
          <ItemIcon blockId={cursorItem.blockId} size={40} />
          {cursorItem.count > 1 && (
            <span
              className="absolute bottom-0 right-0 text-[11px] font-mono font-bold text-white"
              style={{ textShadow: "1px 1px 0 #000" }}
            >
              {cursorItem.count}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
