"use client";

import { useHotbarStore, HOTBAR_SLOTS } from "@store/useHotbarStore";
import { BLOCK_ID } from "@data/blocks";
import { ITEM_NAMES, getToolDef } from "@data/items";
import { ItemIcon, DurabilityBar } from "@ui/ItemIcon";
import { useHudMetrics } from "@ui/useHudScale";

/**
 * Full-width Minecraft-style hotbar with item stack counts.
 *
 * Slot, icon and text sizes are real pixel sizes from hudMetrics rather than a
 * CSS transform, so the pixel-art stays crisp as the HUD scales. The hotbar
 * used to draw its own flat isometric block sprite from a small colour table,
 * which made a crafting table look identical to dirt; every slot now renders
 * through ItemIcon so hotbar and inventory show the same detailed icon.
 */
export function HotbarUI() {
  const selectedIndex = useHotbarStore((s) => s.selectedIndex);
  const slots = useHotbarStore((s) => s.slots);
  const offhand = useHotbarStore((s) => s.offhand);
  const m = useHudMetrics();

  const selectedSlot = slots[selectedIndex];
  const selectedName =
    selectedSlot.count > 0 ? (ITEM_NAMES[selectedSlot.blockId] ?? null) : null;

  const countStyle = {
    fontSize: m.countFont,
    textShadow: "1px 1px 0 #000, -1px 0 0 #000, 0 -1px 0 #000",
  };

  return (
    <div className="absolute bottom-0 left-0 right-0 pointer-events-none z-10">
      {/* Item name tooltip */}
      {selectedName && (
        <div className="text-center mb-1">
          <span
            className="text-white font-mono px-3 py-1 bg-black/60 rounded-sm"
            style={{ fontSize: m.itemNameFont, textShadow: "1px 1px 0 #000" }}
          >
            {selectedName}
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
            width: m.offhandSlot,
            height: m.offhandSlot,
            margin: 4,
            background: offhand.count > 0 ? "#7a7aaa" : "#6a6a6a",
            border: "2px solid #373737",
            boxShadow: "inset 2px 2px 0 #ababab, inset -2px -2px 0 #585858",
          }}
        >
          {offhand.count > 0 && offhand.blockId !== BLOCK_ID.AIR && (
            <ItemIcon blockId={offhand.blockId} size={m.offhandIcon} />
          )}
          {offhand.count > 1 && (
            <span
              className="absolute bottom-0.5 right-1 font-mono font-bold text-white"
              style={countStyle}
            >
              {offhand.count}
            </span>
          )}
          {offhand.count === 0 && (
            <span className="font-mono text-[#888]" style={{ fontSize: m.slotNumFont }}>
              Off
            </span>
          )}
        </div>
        {slots.slice(0, HOTBAR_SLOTS).map((slot, i) => {
          const isSelected = i === selectedIndex;
          return (
            <div
              key={i}
              className="relative flex items-center justify-center flex-1 min-w-0"
              style={{
                height: m.hotbarSlot,
                margin: 2,
                background: isSelected ? "#c6c6c6" : "#8b8b8b",
                border: isSelected ? "2px solid #ffffff" : "2px solid #373737",
                boxShadow: isSelected
                  ? "inset 2px 2px 0 #fafafa, inset -2px -2px 0 #aaa, 0 0 12px rgba(255,255,255,0.15)"
                  : "inset 2px 2px 0 #ababab, inset -2px -2px 0 #585858",
              }}
            >
              {slot.count > 0 && slot.blockId !== BLOCK_ID.AIR && (
                <ItemIcon blockId={slot.blockId} size={m.hotbarIcon} />
              )}

              {/* Durability bar for tools */}
              {slot.count > 0 && (() => {
                const td = getToolDef(slot.blockId);
                return td && slot.durability !== undefined && slot.durability < td.durability
                  ? (
                    <DurabilityBar
                      durability={slot.durability}
                      maxDurability={td.durability}
                      width={m.hotbarSlot}
                    />
                  )
                  : null;
              })()}

              {/* Item count */}
              {slot.count > 1 && (
                <span
                  className="absolute bottom-0.5 right-1 font-mono font-bold text-white"
                  style={countStyle}
                >
                  {slot.count}
                </span>
              )}

              {/* Slot number */}
              <span
                className="absolute top-0.5 left-1.5 font-mono font-bold"
                style={{
                  fontSize: m.slotNumFont,
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
