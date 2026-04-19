"use client";

import { useCallback, useMemo, useState, useEffect } from "react";
import { useInventoryStore } from "@store/useInventoryStore";
import {
  useHotbarStore,
  HOTBAR_SLOTS,
  TOTAL_SLOTS,
} from "@store/useHotbarStore";
import { BLOCK_ID } from "@data/blocks";
import { getToolDef } from "@data/items";
import { findRecipe3x3 } from "@systems/crafting/recipes";
import { ItemIcon, InventorySlot } from "@ui/ItemIcon";

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
      invStore.setTableSlot(index, cursor.blockId, 1);
      if (cursor.count === 1) invStore.clearCursor();
      else invStore.setCursorItem(cursor.blockId, cursor.count - 1, cursor.durability);
    } else if (cursor.count > 0 && slot.count > 0 && cursor.blockId === slot.blockId) {
      invStore.setTableSlot(index, slot.blockId, slot.count + 1);
      if (cursor.count === 1) invStore.clearCursor();
      else invStore.setCursorItem(cursor.blockId, cursor.count - 1, cursor.durability);
    }
  }, []);

  const handleSlotClick = useCallback((index: number) => {
    const store = useHotbarStore.getState();
    const invStore = useInventoryStore.getState();
    const slot = store.slots[index];
    const cursor = invStore.cursorItem;

    if (cursor.count === 0 && slot.count > 0) {
      invStore.setCursorItem(slot.blockId, slot.count, slot.durability);
      const newSlots = [...store.slots];
      newSlots[index] = { blockId: BLOCK_ID.AIR, count: 0 };
      useHotbarStore.setState({ slots: newSlots });
    } else if (cursor.count > 0 && slot.count === 0) {
      const newSlots = [...store.slots];
      newSlots[index] = { blockId: cursor.blockId, count: cursor.count, durability: cursor.durability };
      useHotbarStore.setState({ slots: newSlots });
      invStore.clearCursor();
    } else if (cursor.count > 0 && slot.count > 0) {
      if (cursor.blockId === slot.blockId && !getToolDef(cursor.blockId)) {
        const total = slot.count + cursor.count;
        const fit = Math.min(total, 99);
        const leftover = total - fit;
        const newSlots = [...store.slots];
        newSlots[index] = { blockId: slot.blockId, count: fit };
        useHotbarStore.setState({ slots: newSlots });
        if (leftover > 0) invStore.setCursorItem(cursor.blockId, leftover);
        else invStore.clearCursor();
      } else {
        const newSlots = [...store.slots];
        newSlots[index] = { blockId: cursor.blockId, count: cursor.count, durability: cursor.durability };
        useHotbarStore.setState({ slots: newSlots });
        invStore.setCursorItem(slot.blockId, slot.count, slot.durability);
      }
    }
  }, []);

  const handleCraftResult = useCallback(() => {
    if (!recipe) return;
    const invStore = useInventoryStore.getState();
    const newGrid = invStore.tableGrid.map((slot) => {
      if (slot.count <= 1) return { blockId: 0, count: 0 };
      return { blockId: slot.blockId, count: slot.count - 1 };
    });

    const cursor = invStore.cursorItem;
    const isTool = !!getToolDef(recipe.result);
    const craftDur = getToolDef(recipe.result)?.durability;
    if (cursor.count === 0) {
      invStore.setCursorItem(recipe.result, recipe.count, craftDur);
    } else if (!isTool && cursor.blockId === recipe.result && cursor.count + recipe.count <= 64) {
      invStore.setCursorItem(recipe.result, cursor.count + recipe.count);
    } else {
      for (let i = 0; i < recipe.count; i++) {
        useHotbarStore.getState().addItem(recipe.result);
      }
    }
    useInventoryStore.setState({ tableGrid: newGrid });
  }, [recipe]);

  if (!tableOpen) return null;

  const hotbarSlots = slots.slice(0, HOTBAR_SLOTS);
  const mainSlots = slots.slice(HOTBAR_SLOTS, TOTAL_SLOTS);
  const S = 44;
  const RS = 52;

  return (
    <div className="absolute inset-0 flex items-center justify-center z-30 bg-black/60">
      <div
        className="flex flex-col gap-3 p-6 rounded"
        style={{
          background: "#c6c6c6",
          border: "4px solid #555",
          boxShadow:
            "inset 2px 2px 0 #fafafa, inset -2px -2px 0 #8a8a8a, 0 8px 24px rgba(0,0,0,0.5)",
        }}
      >
        {/* Title */}
        <p className="text-[13px] font-mono text-[#404040] font-bold">Crafting</p>

        {/* 3x3 grid + arrow + result */}
        <div className="flex items-center gap-5">
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
              onClick={() => handleSlotClick(HOTBAR_SLOTS + i)}
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
              onClick={() => handleSlotClick(i)}
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
