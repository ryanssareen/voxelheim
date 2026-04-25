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
import { findSmeltingRecipe, isFuel } from "@systems/crafting/smelting";
import { ItemIcon, InventorySlot } from "@ui/ItemIcon";

export function FurnaceUI() {
  const furnaceOpen = useInventoryStore((s) => s.furnaceOpen);
  const furnaceSlots = useInventoryStore((s) => s.furnaceSlots);
  const cursorItem = useInventoryStore((s) => s.cursorItem);
  const slots = useHotbarStore((s) => s.slots);
  const selectedIndex = useHotbarStore((s) => s.selectedIndex);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (!furnaceOpen) return;
    const handler = (e: MouseEvent) => setMousePos({ x: e.clientX, y: e.clientY });
    window.addEventListener("mousemove", handler);
    return () => window.removeEventListener("mousemove", handler);
  }, [furnaceOpen]);

  // furnaceSlots[0] = input, furnaceSlots[1] = fuel
  const recipe = useMemo(() => {
    const inputSlot = furnaceSlots[0];
    const fuelSlot = furnaceSlots[1];
    if (inputSlot.count === 0 || fuelSlot.count === 0) return null;
    if (!isFuel(fuelSlot.blockId)) return null;
    return findSmeltingRecipe(inputSlot.blockId);
  }, [furnaceSlots]);

  const handleSlotClick = useCallback((slotIndex: number) => {
    const invStore = useInventoryStore.getState();
    const slot = invStore.furnaceSlots[slotIndex];
    const cursor = invStore.cursorItem;

    if (cursor.count === 0 && slot.count > 0) {
      // Pick up whole slot
      invStore.setCursorItem(slot.blockId, slot.count);
      invStore.setFurnaceSlot(slotIndex, 0, 0);
    } else if (cursor.count > 0 && slot.count === 0) {
      // Drop whole cursor stack into empty slot
      invStore.setFurnaceSlot(slotIndex, cursor.blockId, cursor.count);
      invStore.clearCursor();
    } else if (cursor.count > 0 && slot.count > 0 && cursor.blockId === slot.blockId) {
      // Merge cursor stack onto slot (cap at 99 to match inventory UI)
      const total = slot.count + cursor.count;
      const fit = Math.min(total, 99);
      const leftover = total - fit;
      invStore.setFurnaceSlot(slotIndex, slot.blockId, fit);
      if (leftover > 0) invStore.setCursorItem(cursor.blockId, leftover);
      else invStore.clearCursor();
    } else if (cursor.count > 0 && slot.count > 0 && cursor.blockId !== slot.blockId) {
      // Swap cursor and slot
      invStore.setFurnaceSlot(slotIndex, cursor.blockId, cursor.count);
      invStore.setCursorItem(slot.blockId, slot.count);
    }
  }, []);

  const handleInventoryClick = useCallback((index: number) => {
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

  const handleSmeltResult = useCallback(() => {
    if (!recipe) return;
    const invStore = useInventoryStore.getState();
    const [input, fuel] = invStore.furnaceSlots;

    const newInput = input.count <= 1
      ? { blockId: 0, count: 0 }
      : { blockId: input.blockId, count: input.count - 1 };
    const newFuel = fuel.count <= 1
      ? { blockId: 0, count: 0 }
      : { blockId: fuel.blockId, count: fuel.count - 1 };

    const cursor = invStore.cursorItem;
    if (cursor.count === 0) {
      invStore.setCursorItem(recipe.result, recipe.count);
    } else if (cursor.blockId === recipe.result && cursor.count + recipe.count <= 64) {
      invStore.setCursorItem(recipe.result, cursor.count + recipe.count);
    } else {
      useHotbarStore.getState().addItem(recipe.result);
    }
    useInventoryStore.setState({ furnaceSlots: [newInput, newFuel] });
  }, [recipe]);

  if (!furnaceOpen) return null;

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
        <p className="text-[13px] font-mono text-[#404040] font-bold">Furnace</p>

        {/* Input + Fuel → Arrow → Result */}
        <div className="flex items-center gap-5">
          <div className="flex flex-col gap-2 items-center">
            {/* Input slot */}
            <div>
              <p className="text-[10px] font-mono text-[#707070] mb-1">Input</p>
              <InventorySlot
                item={furnaceSlots[0]}
                onClick={() => handleSlotClick(0)}
                size={S}
              />
            </div>
            {/* Fuel slot */}
            <div>
              <p className="text-[10px] font-mono text-[#707070] mb-1">Fuel</p>
              <InventorySlot
                item={furnaceSlots[1]}
                onClick={() => handleSlotClick(1)}
                size={S}
              />
            </div>
          </div>

          <div className="text-3xl text-[#606060] font-bold select-none">→</div>

          <InventorySlot
            item={
              recipe
                ? { blockId: recipe.result, count: recipe.count }
                : { blockId: 0, count: 0 }
            }
            onClick={handleSmeltResult}
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
              onClick={() => handleInventoryClick(HOTBAR_SLOTS + i)}
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
              onClick={() => handleInventoryClick(i)}
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
