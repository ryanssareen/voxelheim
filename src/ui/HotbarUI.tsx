"use client";

import { useHotbarStore } from "@store/useHotbarStore";
import { BLOCK_ID } from "@data/blocks";

const BLOCK_COLORS: Record<number, string> = {
  [BLOCK_ID.GRASS]: "#4CAF50",
  [BLOCK_ID.DIRT]: "#8D6E63",
  [BLOCK_ID.STONE]: "#9E9E9E",
  [BLOCK_ID.SAND]: "#FDD835",
  [BLOCK_ID.LOG]: "#5D4037",
  [BLOCK_ID.LEAVES]: "#2E7D32",
  [BLOCK_ID.CRYSTAL]: "#00E5FF",
  [BLOCK_ID.AIR]: "transparent",
};

const BLOCK_NAMES: Record<number, string> = {
  [BLOCK_ID.GRASS]: "Grass",
  [BLOCK_ID.DIRT]: "Dirt",
  [BLOCK_ID.STONE]: "Stone",
  [BLOCK_ID.SAND]: "Sand",
  [BLOCK_ID.LOG]: "Log",
  [BLOCK_ID.LEAVES]: "Leaves",
  [BLOCK_ID.CRYSTAL]: "Crystal",
  [BLOCK_ID.AIR]: "Air",
};

/**
 * 8-slot hotbar at the bottom of the screen.
 * Pointer-events: none so it doesn't intercept canvas input.
 */
export function HotbarUI() {
  const selectedIndex = useHotbarStore((s) => s.selectedIndex);
  const slots = useHotbarStore((s) => s.slots);

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 pointer-events-none z-10">
      {/* Block name above selected slot */}
      <span className="text-white/80 font-mono text-xs">
        {BLOCK_NAMES[slots[selectedIndex]] ?? ""}
      </span>

      <div className="flex gap-1">
        {slots.map((blockId, i) => (
          <div
            key={i}
            className="relative w-12 h-12 flex items-center justify-center"
            style={{
              backgroundColor: BLOCK_COLORS[blockId] ?? "transparent",
              border:
                i === selectedIndex
                  ? "2px solid white"
                  : "1px solid #666",
              borderRadius: "2px",
            }}
          >
            {/* Slot number */}
            <span className="absolute top-0.5 left-1 text-white/50 text-[10px] font-mono">
              {i + 1}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
