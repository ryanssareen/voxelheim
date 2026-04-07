"use client";

import { useCallback, useMemo, useState, useEffect } from "react";
import { useInventoryStore } from "@store/useInventoryStore";
import {
  useHotbarStore,
  HOTBAR_SLOTS,
  TOTAL_SLOTS,
} from "@store/useHotbarStore";
import { BLOCK_ID } from "@data/blocks";
import { findRecipe3x3 } from "@systems/crafting/recipes";

const BLOCK_COLORS: Record<number, string> = {
  [BLOCK_ID.GRASS]: "#5cb85c",
  [BLOCK_ID.DIRT]: "#9b7653",
  [BLOCK_ID.STONE]: "#aaaaaa",
  [BLOCK_ID.SAND]: "#ffe082",
  [BLOCK_ID.LOG]: "#5D4037",
  [BLOCK_ID.LEAVES]: "#2E7D32",
  [BLOCK_ID.CRYSTAL]: "#00e5ff",
  [BLOCK_ID.RAW_PORK]: "#f0a0a0",
  [BLOCK_ID.RAW_BEEF]: "#c45050",
  [BLOCK_ID.RAW_MUTTON]: "#d4836a",
  [BLOCK_ID.PLANKS]: "#c8a55a",
  [BLOCK_ID.CRAFTING_TABLE]: "#9b7653",
};

function Slot({
  item,
  onClick,
  size = 44,
  highlight = false,
}: {
  item: { blockId: number; count: number };
  onClick?: () => void;
  size?: number;
  highlight?: boolean;
}) {
  const hasItem = item.count > 0 && item.blockId !== BLOCK_ID.AIR;
  return (
    <div
      onClick={onClick}
      className="relative flex items-center justify-center cursor-pointer select-none"
      style={{
        width: size,
        height: size,
        background: highlight ? "#c6c6c6" : "#8b8b8b",
        border: highlight ? "2px solid #fff" : "2px solid #373737",
        boxShadow: highlight
          ? "inset 2px 2px 0 #fafafa, inset -2px -2px 0 #aaa"
          : "inset 2px 2px 0 #ababab, inset -2px -2px 0 #585858",
      }}
    >
      {hasItem && (
        <div
          style={{
            width: size * 0.55,
            height: size * 0.55,
            backgroundColor: BLOCK_COLORS[item.blockId] ?? "#888",
            boxShadow:
              "inset -2px -2px 0 rgba(0,0,0,0.3), inset 2px 2px 0 rgba(255,255,255,0.15)",
          }}
        />
      )}
      {hasItem && item.count > 1 && (
        <span
          className="absolute bottom-0 right-0.5 text-[12px] font-mono font-bold text-white"
          style={{ textShadow: "1px 1px 0 #000" }}
        >
          {item.count}
        </span>
      )}
    </div>
  );
}

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
      invStore.setCursorItem(slot.blockId, slot.count);
      invStore.setTableSlot(index, 0, 0);
    } else if (cursor.count > 0 && slot.count === 0) {
      invStore.setTableSlot(index, cursor.blockId, 1);
      if (cursor.count === 1) invStore.clearCursor();
      else invStore.setCursorItem(cursor.blockId, cursor.count - 1);
    } else if (cursor.count > 0 && slot.count > 0 && cursor.blockId === slot.blockId) {
      invStore.setTableSlot(index, slot.blockId, slot.count + 1);
      if (cursor.count === 1) invStore.clearCursor();
      else invStore.setCursorItem(cursor.blockId, cursor.count - 1);
    }
  }, []);

  const handleSlotClick = useCallback((index: number) => {
    const store = useHotbarStore.getState();
    const invStore = useInventoryStore.getState();
    const slot = store.slots[index];
    const cursor = invStore.cursorItem;

    if (cursor.count === 0 && slot.count > 0) {
      invStore.setCursorItem(slot.blockId, slot.count);
      const newSlots = [...store.slots];
      newSlots[index] = { blockId: BLOCK_ID.AIR, count: 0 };
      useHotbarStore.setState({ slots: newSlots });
    } else if (cursor.count > 0 && slot.count === 0) {
      const newSlots = [...store.slots];
      newSlots[index] = { blockId: cursor.blockId, count: cursor.count };
      useHotbarStore.setState({ slots: newSlots });
      invStore.clearCursor();
    } else if (cursor.count > 0 && slot.count > 0) {
      if (cursor.blockId === slot.blockId) {
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
        newSlots[index] = { blockId: cursor.blockId, count: cursor.count };
        useHotbarStore.setState({ slots: newSlots });
        invStore.setCursorItem(slot.blockId, slot.count);
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
    if (cursor.count === 0) {
      invStore.setCursorItem(recipe.result, recipe.count);
    } else if (cursor.blockId === recipe.result && cursor.count + recipe.count <= 64) {
      invStore.setCursorItem(recipe.result, cursor.count + recipe.count);
    } else {
      return;
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
              <Slot
                key={`tbl-${i}`}
                item={slot}
                onClick={() => handleGridClick(i)}
                size={S}
              />
            ))}
          </div>
          <div className="text-3xl text-[#606060] font-bold select-none">→</div>
          <Slot
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
            <Slot
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
            <Slot
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
          <div
            style={{
              width: 28,
              height: 28,
              backgroundColor: BLOCK_COLORS[cursorItem.blockId] ?? "#888",
              boxShadow: "inset -2px -2px 0 rgba(0,0,0,0.3), inset 2px 2px 0 rgba(255,255,255,0.15), 0 2px 8px rgba(0,0,0,0.5)",
            }}
          />
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
