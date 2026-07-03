"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useInventoryStore } from "@store/useInventoryStore";
import {
  useHotbarStore,
  HOTBAR_SLOTS,
  TOTAL_SLOTS,
  MAX_STACK,
  type ItemStack,
} from "@store/useHotbarStore";
import { BLOCK_DEFINITIONS, BLOCK_ID } from "@data/blocks";
import { getToolDef, getArmorDef } from "@data/items";
import { ItemIcon, InventorySlot, CursorItemOverlay } from "@ui/ItemIcon";
import { useSlotInteractions, ARMOR_LABELS } from "@ui/useSlotInteractions";

/**
 * Every obtainable item for the creative grid: all definitions except AIR.
 * WATER and LAVA are excluded because BlockInteraction gates placement on
 * the block's `solid` flag, so right-click placement silently no-ops for
 * them — re-add once fluids become placeable.
 */
const CREATIVE_ITEMS = BLOCK_DEFINITIONS.filter(
  (b) =>
    b.id !== BLOCK_ID.AIR && b.id !== BLOCK_ID.WATER && b.id !== BLOCK_ID.LAVA
);

/** Build a full creative stack: tools/armor are single items with full durability. */
function fullStackOf(blockId: number): ItemStack {
  const tool = getToolDef(blockId);
  if (tool) return { blockId, count: 1, durability: tool.durability };
  const armorDef = getArmorDef(blockId);
  if (armorDef) return { blockId, count: 1, durability: armorDef.durability };
  return { blockId, count: MAX_STACK };
}

export function CreativeInventoryUI() {
  const creativeOpen = useInventoryStore((s) => s.creativeOpen);

  // Mount the panel only while open so search state resets on each open
  if (!creativeOpen) return null;
  return <CreativePanel />;
}

function CreativePanel() {
  const cursorItem = useInventoryStore((s) => s.cursorItem);
  const slots = useHotbarStore((s) => s.slots);
  const armor = useHotbarStore((s) => s.armor);
  const offhand = useHotbarStore((s) => s.offhand);
  const selectedIndex = useHotbarStore((s) => s.selectedIndex);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const { handleSlotClick, handleArmorClick, handleOffhandClick } =
    useSlotInteractions();

  // Autofocus the search box when the UI opens
  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      // ESC clears the search and returns key focus to the game; stop it
      // from bubbling into window-level game handlers.
      if (e.key === "Escape") {
        e.stopPropagation();
        setQuery("");
        e.currentTarget.blur();
      }
    },
    []
  );

  // Left-click a grid item: destroy the held item (creative trash), or
  // pick up a full stack. Shift-click sends a full stack straight into the
  // first free hotbar/inventory slot.
  const handleItemClick = useCallback(
    (e: React.MouseEvent, blockId: number) => {
      e.stopPropagation();
      const invStore = useInventoryStore.getState();
      const stack = fullStackOf(blockId);

      if (e.shiftKey) {
        const store = useHotbarStore.getState();
        // Guard against corrupted short arrays from old saves
        const padded =
          store.slots.length < TOTAL_SLOTS
            ? Array.from({ length: TOTAL_SLOTS }, (_, i) =>
                store.slots[i] ?? { blockId: BLOCK_ID.AIR, count: 0 }
              )
            : [...store.slots];
        const free = padded.findIndex((s) => s.count === 0);
        if (free !== -1) {
          padded[free] = stack;
          useHotbarStore.setState({ slots: padded });
        }
        return;
      }

      if (invStore.cursorItem.count > 0) {
        invStore.clearCursor();
        return;
      }
      invStore.setCursorItem(stack.blockId, stack.count, stack.durability);
    },
    []
  );

  // Right-click a grid item: add 1 to the cursor (or start a stack of 1).
  // Right-clicking a different item while holding one destroys the held item.
  const handleItemRightClick = useCallback(
    (e: React.MouseEvent, blockId: number) => {
      e.preventDefault();
      e.stopPropagation();
      const invStore = useInventoryStore.getState();
      const cursor = invStore.cursorItem;
      const single = fullStackOf(blockId);

      if (cursor.count === 0) {
        invStore.setCursorItem(blockId, 1, single.durability);
      } else if (cursor.blockId === blockId) {
        // Tools/armor don't stack — leave the single item on the cursor
        if (!getToolDef(blockId) && !getArmorDef(blockId)) {
          invStore.setCursorItem(blockId, Math.min(cursor.count + 1, MAX_STACK));
        }
      } else {
        invStore.clearCursor();
      }
    },
    []
  );

  // Clicking empty grid space while holding an item destroys it (creative trash)
  const handleGridBackgroundClick = useCallback((e: React.MouseEvent) => {
    if (e.type === "contextmenu") e.preventDefault();
    const invStore = useInventoryStore.getState();
    if (invStore.cursorItem.count > 0) invStore.clearCursor();
  }, []);

  // Cursor mechanics on the hotbar, plus keep click-to-select working
  const handleHotbarClick = useCallback(
    (index: number) => {
      handleSlotClick(index);
      useHotbarStore.getState().select(index);
    },
    [handleSlotClick]
  );

  const hotbarSlots = slots.slice(0, HOTBAR_SLOTS);
  const mainSlots = slots.slice(HOTBAR_SLOTS, TOTAL_SLOTS);
  const S = 44;
  const q = query.trim().toLowerCase();
  const visibleItems = q
    ? CREATIVE_ITEMS.filter((b) => b.name.toLowerCase().includes(q))
    : CREATIVE_ITEMS;
  // ~6 rows of slots visible before scrolling
  const gridMaxHeight = 6 * (S + 4);

  return (
    <div className="absolute inset-0 flex items-center justify-center z-30 bg-black/60">
      <div
        className="flex flex-col gap-3 p-6 rounded max-h-[92vh] overflow-y-auto"
        style={{
          background: "#c6c6c6",
          border: "4px solid #555",
          boxShadow:
            "inset 2px 2px 0 #fafafa, inset -2px -2px 0 #8a8a8a, 0 8px 24px rgba(0,0,0,0.5)",
        }}
      >
        {/* Title + search */}
        <div className="flex items-center justify-between gap-4">
          <p className="text-[13px] font-mono text-[#404040] font-bold">
            Creative Inventory
          </p>
          <input
            ref={searchRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder="Search items..."
            className="px-2 py-1 text-[12px] font-mono text-white placeholder-[#c0c0c0] outline-none w-48"
            style={{
              background: "#8b8b8b",
              border: "2px solid #373737",
              boxShadow: "inset 2px 2px 0 #585858, inset -2px -2px 0 #ababab",
              textShadow: "1px 1px 0 #000",
            }}
          />
        </div>

        {/* Item grid (scrollable) */}
        <div
          className="overflow-y-auto pr-1 shrink-0"
          style={{ maxHeight: gridMaxHeight }}
          onClick={handleGridBackgroundClick}
          onContextMenu={handleGridBackgroundClick}
        >
          <div className="grid grid-cols-9 gap-1">
            {visibleItems.map((block) => (
              <div
                key={block.id}
                onClick={(e) => handleItemClick(e, block.id)}
                onContextMenu={(e) => handleItemRightClick(e, block.id)}
                className="relative flex items-center justify-center cursor-pointer select-none hover:brightness-110"
                style={{
                  width: S,
                  height: S,
                  background: "#8b8b8b",
                  border: "2px solid #373737",
                  boxShadow:
                    "inset 2px 2px 0 #ababab, inset -2px -2px 0 #585858",
                }}
                title={block.name}
              >
                <ItemIcon blockId={block.id} size={S} />
                <span
                  className="absolute bottom-0 right-0.5 text-[10px] font-mono font-bold text-white"
                  style={{ textShadow: "1px 1px 0 #000" }}
                >
                  ∞
                </span>
              </div>
            ))}
          </div>
          {visibleItems.length === 0 && (
            <p className="text-[11px] font-mono text-[#606060] py-4 text-center">
              No items match &quot;{query}&quot;
            </p>
          )}
        </div>

        {/* Separator */}
        <div className="w-full h-px bg-[#999]" />

        {/* Storage: armor + offhand | main inventory + hotbar */}
        <div className="flex gap-4">
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
            <div className="mt-1">
              <p className="text-[11px] font-mono text-[#606060] mb-0.5">Offhand</p>
              <InventorySlot
                item={offhand}
                onClick={handleOffhandClick}
                size={S}
                label="Off"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
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

            {/* Hotbar: click also selects the slot */}
            <div className="grid grid-cols-9 gap-1">
              {hotbarSlots.map((slot, i) => (
                <InventorySlot
                  key={`hot-${i}`}
                  item={slot}
                  onClick={() => handleHotbarClick(i)}
                  size={S}
                  highlight={i === selectedIndex}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <p className="text-[11px] font-mono text-[#909090]">
            Press E to close
          </p>
        </div>
      </div>

      {/* Floating cursor item following mouse */}
      <CursorItemOverlay item={cursorItem} />
    </div>
  );
}
