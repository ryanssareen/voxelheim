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
 * Minecraft-style hotbar at the bottom of the screen.
 */
export function HotbarUI() {
  const selectedIndex = useHotbarStore((s) => s.selectedIndex);
  const slots = useHotbarStore((s) => s.slots);

  return (
    <div className="absolute bottom-2 left-1/2 -translate-x-1/2 pointer-events-none z-10">
      {/* Selected block name above hotbar */}
      <div className="text-center mb-1">
        <span
          className="text-white font-mono text-xs"
          style={{ textShadow: "1px 1px 0 #000" }}
        >
          {BLOCK_NAMES[slots[selectedIndex]] ?? ""}
        </span>
      </div>

      {/* Hotbar container — dark background with Minecraft-style border */}
      <div
        className="flex p-0.5 gap-0"
        style={{
          background: "#1a1a1a",
          border: "2px solid #1a1a1a",
          boxShadow:
            "inset 0 0 0 1px #555, 0 0 0 1px #0a0a0a, 0 4px 12px rgba(0,0,0,0.5)",
          imageRendering: "pixelated",
        }}
      >
        {slots.map((blockId, i) => {
          const isSelected = i === selectedIndex;
          return (
            <div
              key={i}
              className="relative"
              style={{
                width: 44,
                height: 44,
                margin: 1,
                border: isSelected
                  ? "2px solid #eee"
                  : "1px solid #333",
                background: isSelected
                  ? "rgba(255,255,255,0.08)"
                  : "#2a2a2a",
                boxShadow: isSelected
                  ? "inset 0 0 0 1px #888, 0 0 8px rgba(255,255,255,0.1)"
                  : "inset 0 -2px 0 #1a1a1a, inset 0 2px 0 #3a3a3a",
              }}
            >
              {/* Block color swatch — looks like a block item */}
              {blockId !== BLOCK_ID.AIR && (
                <div
                  className="absolute"
                  style={{
                    top: 6,
                    left: 6,
                    width: isSelected ? 28 : 30,
                    height: isSelected ? 28 : 30,
                    backgroundColor: BLOCK_COLORS[blockId],
                    boxShadow: `inset -4px -4px 0 rgba(0,0,0,0.3), inset 4px 4px 0 rgba(255,255,255,0.15)`,
                    imageRendering: "pixelated",
                  }}
                />
              )}

              {/* Slot number */}
              <span
                className="absolute bottom-0.5 right-1 text-[9px] font-mono text-white/30"
                style={{ textShadow: "1px 1px 0 #000" }}
              >
                {i + 1}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
