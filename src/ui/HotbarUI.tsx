"use client";

import { useHotbarStore } from "@store/useHotbarStore";
import { BLOCK_ID } from "@data/blocks";

/** Block top face color (lighter) and side face color (darker) for 3D look. */
const BLOCK_VISUALS: Record<
  number,
  { top: string; side: string; name: string } | null
> = {
  [BLOCK_ID.GRASS]: { top: "#5cb85c", side: "#8D6E63", name: "Grass" },
  [BLOCK_ID.DIRT]: { top: "#9b7653", side: "#7a5c3a", name: "Dirt" },
  [BLOCK_ID.STONE]: { top: "#aaaaaa", side: "#888888", name: "Stone" },
  [BLOCK_ID.SAND]: { top: "#ffe082", side: "#d4a832", name: "Sand" },
  [BLOCK_ID.LOG]: { top: "#D7CCC8", side: "#5D4037", name: "Log" },
  [BLOCK_ID.LEAVES]: { top: "#43a047", side: "#2E7D32", name: "Leaves" },
  [BLOCK_ID.CRYSTAL]: { top: "#4dd0e1", side: "#0097a7", name: "Crystal" },
  [BLOCK_ID.AIR]: null,
};

/** Renders a tiny isometric block icon. */
function BlockIcon({ blockId }: { blockId: number }) {
  const v = BLOCK_VISUALS[blockId];
  if (!v) return null;

  // Simple isometric block using 3 parallelogram faces via SVG
  return (
    <svg width="36" height="36" viewBox="0 0 32 32" style={{ imageRendering: "pixelated" }}>
      {/* Top face */}
      <polygon points="16,4 28,10 16,16 4,10" fill={v.top} />
      {/* Left face */}
      <polygon points="4,10 16,16 16,28 4,22" fill={v.side} />
      {/* Right face (slightly lighter than left) */}
      <polygon
        points="16,16 28,10 28,22 16,28"
        fill={v.side}
        style={{ opacity: 0.7 }}
      />
    </svg>
  );
}

/**
 * Minecraft-style hotbar: dark outer frame with 9-patch look, lighter inner slots.
 */
export function HotbarUI() {
  const selectedIndex = useHotbarStore((s) => s.selectedIndex);
  const slots = useHotbarStore((s) => s.slots);

  return (
    <div className="absolute bottom-1 left-1/2 -translate-x-1/2 pointer-events-none z-10">
      {/* Block name tooltip above selected slot */}
      {BLOCK_VISUALS[slots[selectedIndex]] && (
        <div className="text-center mb-1">
          <span
            className="text-white font-mono text-xs px-2 py-0.5 bg-black/60 rounded-sm"
            style={{ textShadow: "1px 1px 0 #000" }}
          >
            {BLOCK_VISUALS[slots[selectedIndex]]?.name}
          </span>
        </div>
      )}

      {/* Hotbar frame */}
      <div
        className="flex"
        style={{
          background: "#1a1a1a",
          border: "2px solid #0f0f0f",
          boxShadow:
            "inset 1px 1px 0 #3a3a3a, inset -1px -1px 0 #0a0a0a, 0 2px 8px rgba(0,0,0,0.6)",
          padding: "1px",
          imageRendering: "pixelated",
        }}
      >
        {slots.map((blockId, i) => {
          const isSelected = i === selectedIndex;
          return (
            <div
              key={i}
              className="relative flex items-center justify-center"
              style={{
                width: 52,
                height: 52,
                margin: "1px",
                background: isSelected
                  ? "#c6c6c6"
                  : "#8b8b8b",
                border: isSelected
                  ? "1px solid #ffffff"
                  : "1px solid #373737",
                boxShadow: isSelected
                  ? "inset 1px 1px 0 #fafafa, inset -1px -1px 0 #aaa"
                  : "inset 1px 1px 0 #ababab, inset -1px -1px 0 #585858",
              }}
            >
              <BlockIcon blockId={blockId} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
