"use client";

import { useEffect, useRef } from "react";
import type { Engine } from "@engine/Engine";
import type { EdgeIntent } from "@engine/input/intents";
import { useHotbarStore, HOTBAR_SLOTS } from "@store/useHotbarStore";
import { useGameStore } from "@store/useGameStore";
import { BLOCK_ID } from "@data/blocks";
import { ITEM_NAMES, getToolDef } from "@data/items";
import { ItemIcon, DurabilityBar } from "@ui/ItemIcon";
import { useHudMetrics } from "@ui/useHudScale";

/**
 * The press a tap on hotbar slot `index` (0-based) produces.
 *
 * A tap becomes the same named edge `Digit1`-`Digit9` produce (R15) rather than
 * calling `useHotbarStore.select()` directly, so slot selection keeps running
 * through the frame loop: the engine is where a press is ignored while a panel
 * is open or the game is paused, and a control that wrote the store itself
 * would quietly be the one exception to that.
 */
export function hotbarIntentForIndex(index: number): EdgeIntent {
  const slot = Math.max(1, Math.min(HOTBAR_SLOTS, Math.round(index) + 1));
  return `hotbar${slot as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}`;
}

/**
 * What the control docked at the right end of the strip does (R14).
 *
 * The same edge `KeyE` produces, so it toggles whichever panel is up exactly as
 * the key does, including closing one.
 *
 * It is one control rather than two because the recipe book has no surface of
 * its own — `RecipeBook` renders *inside* `InventoryUI` — so a second dock
 * control would open the same screen under a different glyph. That answers the
 * plan's open question ("its own dock control, or a tab inside the inventory
 * screen") in favour of the tab; the left end of the strip, where the offhand
 * slot sits, is where a book control would go if the book is ever given its own
 * screen.
 */
export const HOTBAR_DOCK_INTENT: EdgeIntent = "openInventory";

/**
 * How long a finger must stay on a hotbar slot before it also drops the stack
 * in it, ms.
 *
 * Drop is `Q` on a keyboard and has no gesture and no room for an icon, so it
 * rides the control the player is already using to choose what to drop. The tap
 * half is unchanged and still fires immediately — the slot is selected on
 * press, and the drop is an *addition* after the threshold, so the gesture
 * reads as "pick this one… and get rid of it" rather than as two competing
 * meanings the player has to disambiguate before anything happens.
 *
 * Longer than the play surface's mine threshold (200 ms) and its eat threshold
 * (500 ms) because this one destroys something: the cost of being too slow is
 * a wait, and the cost of being too fast is a stack on the ground.
 */
export const HOTBAR_DROP_HOLD_MS = 600;

/**
 * Full-width Minecraft-style hotbar with item stack counts.
 *
 * Slot, icon and text sizes are real pixel sizes from hudMetrics rather than a
 * CSS transform, so the pixel-art stays crisp as the HUD scales. The hotbar
 * used to draw its own flat isometric block sprite from a small colour table,
 * which made a crafting table look identical to dirt; every slot now renders
 * through ItemIcon so hotbar and inventory show the same detailed icon.
 *
 * In touch mode the strip also becomes interactive: slots take taps (R15), a
 * slot held past {@link HOTBAR_DROP_HOLD_MS} drops its stack (R23's answer for
 * `Q`), and an inventory control docks at the right end (R14), where it costs
 * no play area. Both are inert on desktop — the strip keeps `pointer-events: none`
 * there, because a mouse click that landed on the hotbar instead of the canvas
 * would stop a mine rather than select a slot.
 */
export function HotbarUI({ engineRef }: { engineRef?: React.RefObject<Engine | null> }) {
  const selectedIndex = useHotbarStore((s) => s.selectedIndex);
  const slots = useHotbarStore((s) => s.slots);
  const offhand = useHotbarStore((s) => s.offhand);
  const touchMode = useGameStore((s) => s.inputSource) === "touch";
  const m = useHudMetrics();

  /**
   * Presses an on-screen control.
   *
   * `preventDefault` keeps the browser from synthesizing the compatibility
   * mouse burst that follows a touch — `InputManager` guards the canvas against
   * it, but these controls are their own elements and carry their own guard.
   */
  const press = (e: React.PointerEvent, intent: EdgeIntent) => {
    e.preventDefault();
    engineRef?.current?.touch.pressButton(intent);
  };

  /**
   * Select on press, drop if the finger stays.
   *
   * The timer is cleared on every way a contact can end, including the one that
   * is easy to forget: sliding off the slot. Without `onPointerLeave` a thumb
   * that started on a slot and moved away would still drop the stack, which is
   * the kind of thing a player would read as the game losing their items at
   * random.
   */
  const dropTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelDropTimer = () => {
    if (dropTimer.current === null) return;
    clearTimeout(dropTimer.current);
    dropTimer.current = null;
  };

  const pressSlot = (e: React.PointerEvent, index: number) => {
    press(e, hotbarIntentForIndex(index));
    cancelDropTimer();
    dropTimer.current = setTimeout(() => {
      dropTimer.current = null;
      engineRef?.current?.touch.pressButton("drop");
    }, HOTBAR_DROP_HOLD_MS);
  };

  useEffect(() => cancelDropTimer, []);

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
              onPointerDown={touchMode ? (e) => pressSlot(e, i) : undefined}
              onPointerUp={touchMode ? cancelDropTimer : undefined}
              onPointerCancel={touchMode ? cancelDropTimer : undefined}
              onPointerLeave={touchMode ? cancelDropTimer : undefined}
              style={{
                height: m.hotbarSlot,
                margin: 2,
                // Only in touch mode: see the component doc.
                pointerEvents: touchMode ? "auto" : "none",
                touchAction: "none",
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

        {/* Inventory control, docked at the right end of the strip (R14).
            Sized to match the offhand slot at the other end, so the strip stays
            symmetric; U10 owns raising the touch-target floor these inherit. */}
        {touchMode && (
          <button
            type="button"
            aria-label="Open inventory"
            onPointerDown={(e) => press(e, HOTBAR_DOCK_INTENT)}
            className="relative flex shrink-0 items-center justify-center"
            style={{
              width: m.offhandSlot,
              height: m.offhandSlot,
              margin: 4,
              background: "#6a6a6a",
              border: "2px solid #373737",
              boxShadow: "inset 2px 2px 0 #ababab, inset -2px -2px 0 #585858",
              pointerEvents: "auto",
              touchAction: "none",
            }}
          >
            <InventoryGlyph size={Math.round(m.offhandIcon * 0.8)} />
          </button>
        )}
      </div>
    </div>
  );
}

/** Four stacked cells — the inventory grid, at glyph size. */
function InventoryGlyph({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" className="block">
      {[
        [1, 1],
        [9, 1],
        [1, 9],
        [9, 9],
      ].map(([x, y]) => (
        <rect
          key={`${x}-${y}`}
          x={x}
          y={y}
          width="6"
          height="6"
          fill="#2a2a2a"
          stroke="#d8d8d8"
          strokeWidth="1"
        />
      ))}
    </svg>
  );
}
