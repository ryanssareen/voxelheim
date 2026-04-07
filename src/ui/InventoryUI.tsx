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
import { findRecipe } from "@systems/crafting/recipes";

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

const BLOCK_NAMES: Record<number, string> = {
  [BLOCK_ID.GRASS]: "Grass",
  [BLOCK_ID.DIRT]: "Dirt",
  [BLOCK_ID.STONE]: "Stone",
  [BLOCK_ID.SAND]: "Sand",
  [BLOCK_ID.LOG]: "Log",
  [BLOCK_ID.LEAVES]: "Leaves",
  [BLOCK_ID.CRYSTAL]: "Crystal",
  [BLOCK_ID.RAW_PORK]: "Raw Pork",
  [BLOCK_ID.RAW_BEEF]: "Raw Beef",
  [BLOCK_ID.RAW_MUTTON]: "Raw Mutton",
  [BLOCK_ID.PLANKS]: "Planks",
  [BLOCK_ID.CRAFTING_TABLE]: "Crafting Table",
};

const ARMOR_LABELS = ["Helmet", "Chest", "Legs", "Boots"];

function ItemSlot({
  item,
  onClick,
  size = 40,
  highlight = false,
  label,
}: {
  item: { blockId: number; count: number };
  onClick?: () => void;
  size?: number;
  highlight?: boolean;
  label?: string;
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
      {label && !hasItem && (
        <span className="text-[10px] text-[#666] font-mono">{label}</span>
      )}
    </div>
  );
}

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
      invStore.setCursorItem(slot.blockId, slot.count);
      const newArmor = [...store.armor];
      newArmor[index] = { blockId: BLOCK_ID.AIR, count: 0 };
      useHotbarStore.setState({ armor: newArmor });
    } else if (cursor.count > 0 && slot.count === 0) {
      const newArmor = [...store.armor];
      newArmor[index] = { blockId: cursor.blockId, count: 1 };
      if (cursor.count === 1) invStore.clearCursor();
      else invStore.setCursorItem(cursor.blockId, cursor.count - 1);
      useHotbarStore.setState({ armor: newArmor });
    }
  }, []);

  const handleOffhandClick = useCallback(() => {
    const store = useHotbarStore.getState();
    const invStore = useInventoryStore.getState();
    const slot = store.offhand;
    const cursor = invStore.cursorItem;

    if (cursor.count === 0 && slot.count > 0) {
      invStore.setCursorItem(slot.blockId, slot.count);
      useHotbarStore.setState({ offhand: { blockId: BLOCK_ID.AIR, count: 0 } });
    } else if (cursor.count > 0 && slot.count === 0) {
      useHotbarStore.setState({ offhand: { blockId: cursor.blockId, count: cursor.count } });
      invStore.clearCursor();
    } else if (cursor.count > 0 && slot.count > 0) {
      useHotbarStore.setState({ offhand: { blockId: cursor.blockId, count: cursor.count } });
      invStore.setCursorItem(slot.blockId, slot.count);
    }
  }, []);

  const handleCraftClick = useCallback(
    (index: number) => {
      const invStore = useInventoryStore.getState();
      const slot = invStore.craftingGrid[index];
      const cursor = invStore.cursorItem;

      if (cursor.count === 0 && slot.count > 0) {
        invStore.setCursorItem(slot.blockId, slot.count);
        invStore.setCraftingSlot(index, 0, 0);
      } else if (cursor.count > 0 && slot.count === 0) {
        invStore.setCraftingSlot(index, cursor.blockId, 1);
        if (cursor.count === 1) invStore.clearCursor();
        else invStore.setCursorItem(cursor.blockId, cursor.count - 1);
      } else if (cursor.count > 0 && slot.count > 0 && cursor.blockId === slot.blockId) {
        invStore.setCraftingSlot(index, slot.blockId, slot.count + 1);
        if (cursor.count === 1) invStore.clearCursor();
        else invStore.setCursorItem(cursor.blockId, cursor.count - 1);
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
    if (cursor.count === 0) {
      invStore.setCursorItem(recipe.result, recipe.count);
    } else if (cursor.blockId === recipe.result && cursor.count + recipe.count <= 64) {
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
              <ItemSlot
                key={`armor-${i}`}
                item={slot}
                onClick={() => handleArmorClick(i)}
                size={S}
                label={ARMOR_LABELS[i]}
              />
            ))}
            <div className="mt-2">
              <p className="text-[11px] font-mono text-[#606060] mb-0.5">Offhand</p>
              <ItemSlot
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
                  <ItemSlot
                    key={`craft-${i}`}
                    item={slot}
                    onClick={() => handleCraftClick(i)}
                    size={S}
                  />
                ))}
              </div>
              <div className="text-3xl text-[#606060] font-bold select-none">→</div>
              <ItemSlot
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
              <ItemSlot
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
            <ItemSlot
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
