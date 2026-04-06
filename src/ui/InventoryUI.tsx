"use client";

import { useCallback, useMemo } from "react";
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
};

const BLOCK_NAMES: Record<number, string> = {
  [BLOCK_ID.GRASS]: "Grass",
  [BLOCK_ID.DIRT]: "Dirt",
  [BLOCK_ID.STONE]: "Stone",
  [BLOCK_ID.SAND]: "Sand",
  [BLOCK_ID.LOG]: "Log",
  [BLOCK_ID.LEAVES]: "Leaves",
  [BLOCK_ID.CRYSTAL]: "Crystal",
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
          className="absolute bottom-0 right-0.5 text-[10px] font-mono font-bold text-white"
          style={{ textShadow: "1px 1px 0 #000" }}
        >
          {item.count}
        </span>
      )}
      {label && !hasItem && (
        <span className="text-[8px] text-[#666] font-mono">{label}</span>
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
  const selectedIndex = useHotbarStore((s) => s.selectedIndex);

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
          const fit = Math.min(total, 64);
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

  return (
    <div className="absolute inset-0 flex items-center justify-center z-30 bg-black/60">
      <div
        className="flex flex-col gap-3 p-5 rounded"
        style={{
          background: "#c6c6c6",
          border: "4px solid #555",
          boxShadow:
            "inset 2px 2px 0 #fafafa, inset -2px -2px 0 #8a8a8a, 0 8px 24px rgba(0,0,0,0.5)",
        }}
      >
        {/* Top row: Crafting + Armor */}
        <div className="flex gap-6">
          {/* Armor slots (left) */}
          <div className="flex flex-col gap-1">
            <p className="text-[10px] font-mono text-[#606060] mb-0.5">Armor</p>
            {armor.map((slot, i) => (
              <ItemSlot
                key={`armor-${i}`}
                item={slot}
                onClick={() => handleArmorClick(i)}
                size={36}
                label={ARMOR_LABELS[i]}
              />
            ))}
          </div>

          {/* Crafting grid (center) */}
          <div className="flex flex-col items-center">
            <p className="text-[10px] font-mono text-[#606060] mb-1">Crafting</p>
            <div className="flex items-center gap-3">
              <div className="grid grid-cols-2 gap-0.5">
                {craftingGrid.map((slot, i) => (
                  <ItemSlot
                    key={`craft-${i}`}
                    item={slot}
                    onClick={() => handleCraftClick(i)}
                    size={36}
                  />
                ))}
              </div>
              <div className="text-2xl text-[#606060] font-bold select-none">→</div>
              <ItemSlot
                item={
                  recipe
                    ? { blockId: recipe.result, count: recipe.count }
                    : { blockId: 0, count: 0 }
                }
                onClick={handleCraftResult}
                size={40}
                highlight={!!recipe}
              />
            </div>
            {recipe && (
              <p className="text-[10px] font-mono text-[#505050] mt-1">
                {recipe.name}
              </p>
            )}
          </div>
        </div>

        {/* Separator */}
        <div className="w-full h-px bg-[#999]" />

        {/* Main inventory: 3 rows x 9 columns */}
        <div>
          <p className="text-[10px] font-mono text-[#606060] mb-1">Inventory</p>
          <div className="grid grid-cols-9 gap-0.5">
            {mainSlots.map((slot, i) => (
              <ItemSlot
                key={`inv-${i}`}
                item={slot}
                onClick={() => handleSlotClick(HOTBAR_SLOTS + i)}
                size={36}
              />
            ))}
          </div>
        </div>

        {/* Separator */}
        <div className="w-full h-px bg-[#999]" />

        {/* Hotbar: 1 row x 9 */}
        <div className="grid grid-cols-9 gap-0.5">
          {hotbarSlots.map((slot, i) => (
            <ItemSlot
              key={`hot-${i}`}
              item={slot}
              onClick={() => handleSlotClick(i)}
              size={36}
              highlight={i === selectedIndex}
            />
          ))}
        </div>

        {/* Cursor + close hint */}
        <div className="flex justify-between items-center">
          {cursorItem.count > 0 ? (
            <p className="text-[10px] font-mono text-[#707070]">
              Holding: {BLOCK_NAMES[cursorItem.blockId] ?? "?"} x{cursorItem.count}
            </p>
          ) : (
            <span />
          )}
          <p className="text-[10px] font-mono text-[#909090]">Press E to close</p>
        </div>
      </div>
    </div>
  );
}
