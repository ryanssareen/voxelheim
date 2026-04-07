"use client";

import { useHotbarStore, HOTBAR_SLOTS } from "@store/useHotbarStore";
import { BLOCK_ID } from "@data/blocks";

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
  [BLOCK_ID.RAW_PORK]: { top: "#f0a0a0", side: "#d08080", name: "Raw Pork" },
  [BLOCK_ID.RAW_BEEF]: { top: "#c45050", side: "#a03030", name: "Raw Beef" },
  [BLOCK_ID.RAW_MUTTON]: { top: "#d4836a", side: "#b0654a", name: "Raw Mutton" },
  [BLOCK_ID.AIR]: null,
};

function BlockIcon({ blockId }: { blockId: number }) {
  const v = BLOCK_VISUALS[blockId];
  if (!v) return null;

  return (
    <svg width="80%" height="80%" viewBox="0 0 32 32" style={{ imageRendering: "pixelated" }}>
      <polygon points="16,4 28,10 16,16 4,10" fill={v.top} />
      <polygon points="4,10 16,16 16,28 4,22" fill={v.side} />
      <polygon points="16,16 28,10 28,22 16,28" fill={v.side} style={{ opacity: 0.7 }} />
    </svg>
  );
}

/**
 * Full-width Minecraft-style hotbar with item stack counts.
 */
export function HotbarUI() {
  const selectedIndex = useHotbarStore((s) => s.selectedIndex);
  const slots = useHotbarStore((s) => s.slots);
  const offhand = useHotbarStore((s) => s.offhand);

  const selectedSlot = slots[selectedIndex];
  const selectedVisual =
    selectedSlot.count > 0 ? BLOCK_VISUALS[selectedSlot.blockId] : null;

  return (
    <div className="absolute bottom-0 left-0 right-0 pointer-events-none z-10">
      {/* Block name tooltip */}
      {selectedVisual && (
        <div className="text-center mb-1">
          <span
            className="text-white font-mono text-sm px-3 py-1 bg-black/60 rounded-sm"
            style={{ textShadow: "1px 1px 0 #000" }}
          >
            {selectedVisual.name}
          </span>
        </div>
      )}

      {/* Full-width hotbar with offhand */}
      <div
        className="flex w-full items-end"
        style={{
          background: "#1a1a1a",
          borderTop: "3px solid #0f0f0f",
          boxShadow: "inset 0 1px 0 #3a3a3a, 0 -4px 12px rgba(0,0,0,0.5)",
          imageRendering: "pixelated",
        }}
      >
        {/* Offhand slot — left side */}
        <div
          className="relative flex items-center justify-center shrink-0"
          style={{
            width: 56,
            height: 56,
            margin: "4px",
            background: offhand.count > 0 ? "#7a7aaa" : "#6a6a6a",
            border: "2px solid #373737",
            boxShadow: "inset 2px 2px 0 #ababab, inset -2px -2px 0 #585858",
          }}
        >
          {offhand.count > 0 && offhand.blockId !== BLOCK_ID.AIR && (
            <BlockIcon blockId={offhand.blockId} />
          )}
          {offhand.count > 1 && (
            <span
              className="absolute bottom-0.5 right-1 text-[12px] font-mono font-bold text-white"
              style={{ textShadow: "1px 1px 0 #000" }}
            >
              {offhand.count}
            </span>
          )}
          {offhand.count === 0 && (
            <span className="text-[9px] font-mono text-[#888]">Off</span>
          )}
        </div>
        {slots.slice(0, HOTBAR_SLOTS).map((slot, i) => {
          const isSelected = i === selectedIndex;
          return (
            <div
              key={i}
              className="relative flex items-center justify-center flex-1"
              style={{
                height: 64,
                margin: "2px",
                background: isSelected ? "#c6c6c6" : "#8b8b8b",
                border: isSelected ? "2px solid #ffffff" : "2px solid #373737",
                boxShadow: isSelected
                  ? "inset 2px 2px 0 #fafafa, inset -2px -2px 0 #aaa, 0 0 12px rgba(255,255,255,0.15)"
                  : "inset 2px 2px 0 #ababab, inset -2px -2px 0 #585858",
              }}
            >
              {slot.count > 0 && <BlockIcon blockId={slot.blockId} />}

              {/* Item count */}
              {slot.count > 1 && (
                <span
                  className="absolute bottom-0.5 right-1 text-[12px] font-mono font-bold text-white"
                  style={{ textShadow: "1px 1px 0 #000" }}
                >
                  {slot.count}
                </span>
              )}

              {/* Slot number */}
              <span
                className="absolute top-0.5 left-1.5 text-[11px] font-mono font-bold"
                style={{
                  color: isSelected ? "#333" : "rgba(255,255,255,0.35)",
                  textShadow: isSelected ? "none" : "1px 1px 0 #000",
                }}
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
