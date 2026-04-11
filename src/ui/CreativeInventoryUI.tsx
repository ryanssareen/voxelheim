"use client";

import { useCallback } from "react";
import { useInventoryStore } from "@store/useInventoryStore";
import { useHotbarStore } from "@store/useHotbarStore";
import { BLOCK_DEFINITIONS } from "@data/blocks";
import { ItemIcon, InventorySlot } from "@ui/ItemIcon";

const HOTBAR_SLOTS = 9;

/** All placeable (solid) blocks for the creative inventory grid. */
const CREATIVE_BLOCKS = BLOCK_DEFINITIONS.filter((b) => b.solid && b.id !== 0);

export function CreativeInventoryUI() {
  const creativeOpen = useInventoryStore((s) => s.creativeOpen);
  const slots = useHotbarStore((s) => s.slots);
  const selectedIndex = useHotbarStore((s) => s.selectedIndex);

  const handleBlockClick = useCallback((blockId: number) => {
    // Set the selected hotbar slot to this block (infinite stack)
    const hotbar = useHotbarStore.getState();
    const idx = hotbar.selectedIndex;
    const newSlots = [...hotbar.slots];
    newSlots[idx] = { blockId, count: 1 };
    useHotbarStore.setState({ slots: newSlots });
  }, []);

  const handleHotbarClick = useCallback((index: number) => {
    useHotbarStore.getState().select(index);
  }, []);

  if (!creativeOpen) return null;

  const hotbarSlots = slots.slice(0, HOTBAR_SLOTS);
  const S = 44;

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
        <p className="text-[13px] font-mono text-[#404040] font-bold">
          Creative Inventory
        </p>

        {/* Block grid */}
        <div className="grid grid-cols-9 gap-1">
          {CREATIVE_BLOCKS.map((block) => (
            <div
              key={block.id}
              onClick={() => handleBlockClick(block.id)}
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

        {/* Separator */}
        <div className="w-full h-px bg-[#999]" />

        {/* Hotbar */}
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

        <div className="flex justify-end">
          <p className="text-[11px] font-mono text-[#909090]">
            Press E to close
          </p>
        </div>
      </div>
    </div>
  );
}
