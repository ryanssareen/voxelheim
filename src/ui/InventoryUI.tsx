"use client";

import { useCallback, useMemo, useState, useEffect } from "react";
import { useInventoryStore } from "@store/useInventoryStore";
import {
  useHotbarStore,
  HOTBAR_SLOTS,
  TOTAL_SLOTS,
  ARMOR_SLOTS,
  type ItemStack,
} from "@store/useHotbarStore";
import { BLOCK_ID } from "@data/blocks";
import { getToolDef } from "@data/items";
import { findRecipe } from "@systems/crafting/recipes";
import { ItemIcon, InventorySlot } from "@ui/ItemIcon";

const ARMOR_LABELS = ["Helmet", "Chest", "Legs", "Boots"];

export function InventoryUI() {
  const isOpen = useInventoryStore((s) => s.isOpen);
  const craftingGrid = useInventoryStore((s) => s.craftingGrid);
  const cursorItem = useInventoryStore((s) => s.cursorItem);
  const slots = useHotbarStore((s) => s.slots);
  const armor = useHotbarStore((s) => s.armor);
  const offhand = useHotbarStore((s) => s.offhand);
  const selectedIndex = useHotbarStore((s) => s.selectedIndex);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => setMousePos({ x: e.clientX, y: e.clientY });
    window.addEventListener("mousemove", handler);
    return () => window.removeEventListener("mousemove", handler);
  }, [isOpen]);

  const recipe = useMemo(() => {
    const grid = craftingGrid.map((s) =>
      s.count > 0 ? s.blockId : 0
    ) as [number, number, number, number];
    return findRecipe(grid);
  }, [craftingGrid]);

  // Click any inventory/hotbar slot
  const handleSlotClick = useCallback(
    (index: number) => {
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
    },
    []
  );

  const handleArmorClick = useCallback((index: number) => {
    // Armor slots are cosmetic for now — no functional armor
    const store = useHotbarStore.getState();
    const invStore = useInventoryStore.getState();
    const slot = store.armor[index];
    const cursor = invStore.cursorItem;

    if (cursor.count === 0 && slot.count > 0) {
      invStore.setCursorItem(slot.blockId, slot.count, slot.durability);
      const newArmor = [...store.armor];
      newArmor[index] = { blockId: BLOCK_ID.AIR, count: 0 };
      useHotbarStore.setState({ armor: newArmor });
    } else if (cursor.count > 0 && slot.count === 0 && !getToolDef(cursor.blockId)) {
      const newArmor = [...store.armor];
      newArmor[index] = { blockId: cursor.blockId, count: 1, durability: cursor.durability };
      if (cursor.count === 1) invStore.clearCursor();
      else invStore.setCursorItem(cursor.blockId, cursor.count - 1, cursor.durability);
      useHotbarStore.setState({ armor: newArmor });
    }
  }, []);

  const handleOffhandClick = useCallback(() => {
    const store = useHotbarStore.getState();
    const invStore = useInventoryStore.getState();
    const slot = store.offhand;
    const cursor = invStore.cursorItem;

    if (cursor.count === 0 && slot.count > 0) {
      invStore.setCursorItem(slot.blockId, slot.count, slot.durability);
      useHotbarStore.setState({ offhand: { blockId: BLOCK_ID.AIR, count: 0 } });
    } else if (cursor.count > 0 && slot.count === 0) {
      useHotbarStore.setState({ offhand: { blockId: cursor.blockId, count: cursor.count, durability: cursor.durability } });
      invStore.clearCursor();
    } else if (cursor.count > 0 && slot.count > 0) {
      useHotbarStore.setState({ offhand: { blockId: cursor.blockId, count: cursor.count, durability: cursor.durability } });
      invStore.setCursorItem(slot.blockId, slot.count, slot.durability);
    }
  }, []);

  const handleCraftClick = useCallback(
    (index: number) => {
      const invStore = useInventoryStore.getState();
      const slot = invStore.craftingGrid[index];
      const cursor = invStore.cursorItem;

      if (cursor.count === 0 && slot.count > 0) {
        invStore.setCursorItem(slot.blockId, slot.count, slot.durability);
        invStore.setCraftingSlot(index, 0, 0);
      } else if (cursor.count > 0 && slot.count === 0) {
        invStore.setCraftingSlot(index, cursor.blockId, 1);
        if (cursor.count === 1) invStore.clearCursor();
        else invStore.setCursorItem(cursor.blockId, cursor.count - 1, cursor.durability);
      } else if (cursor.count > 0 && slot.count > 0 && cursor.blockId === slot.blockId) {
        invStore.setCraftingSlot(index, slot.blockId, slot.count + 1);
        if (cursor.count === 1) invStore.clearCursor();
        else invStore.setCursorItem(cursor.blockId, cursor.count - 1, cursor.durability);
      }
    },
    []
  );

  const handleCraftResult = useCallback(() => {
    if (!recipe) return;
    const invStore = useInventoryStore.getState();
    const newGrid = invStore.craftingGrid.map((slot) => {
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
      useHotbarStore.getState().addItem(recipe.result);
    }
    useInventoryStore.setState({ craftingGrid: newGrid });
  }, [recipe]);

  if (!isOpen) return null;

  const hotbarSlots = slots.slice(0, HOTBAR_SLOTS);
  const mainSlots = slots.slice(HOTBAR_SLOTS, TOTAL_SLOTS);
  const S = 48;
  const SC = 52;

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
        {/* Top row: Armor + Offhand | Crafting */}
        <div className="flex gap-6">
          {/* Armor + Offhand (left) */}
          <div className="flex flex-col gap-1">
            <p className="text-[11px] font-mono text-[#606060] mb-0.5">Armor</p>
            {armor.map((slot, i) => (
              <InventorySlot
                key={`armor-${i}`}
                item={slot}
                onClick={() => handleArmorClick(i)}
                size={S}
                label={ARMOR_LABELS[i]}
              />
            ))}
            <div className="mt-2">
              <p className="text-[11px] font-mono text-[#606060] mb-0.5">Offhand</p>
              <InventorySlot
                item={offhand}
                onClick={handleOffhandClick}
                size={S}
                label="Off"
              />
            </div>
          </div>

          {/* Crafting grid (center) */}
          <div className="flex flex-col items-center">
            <p className="text-[11px] font-mono text-[#606060] mb-1">Crafting</p>
            <div className="flex items-center gap-4">
              <div className="grid grid-cols-2 gap-1">
                {craftingGrid.map((slot, i) => (
                  <InventorySlot
                    key={`craft-${i}`}
                    item={slot}
                    onClick={() => handleCraftClick(i)}
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
                size={SC}
                highlight={!!recipe}
              />
            </div>
            {recipe && (
              <p className="text-[11px] font-mono text-[#505050] mt-1">
                {recipe.name}
              </p>
            )}
          </div>
        </div>

        {/* Separator */}
        <div className="w-full h-px bg-[#999]" />

        {/* Main inventory: 3 rows x 9 columns */}
        <div>
          <p className="text-[11px] font-mono text-[#606060] mb-1">Inventory</p>
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
        </div>

        {/* Separator */}
        <div className="w-full h-px bg-[#999]" />

        {/* Hotbar: 1 row x 9 */}
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

        {/* Close hint */}
        <div className="flex justify-end">
          <p className="text-[11px] font-mono text-[#909090]">Press E to close</p>
        </div>
      </div>

      {/* Floating cursor item following mouse */}
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
