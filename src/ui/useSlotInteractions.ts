"use client";

import { useCallback } from "react";
import { useInventoryStore } from "@store/useInventoryStore";
import { useHotbarStore, MAX_STACK } from "@store/useHotbarStore";
import { BLOCK_ID } from "@data/blocks";
import { getToolDef, getArmorDef, getArmorSlotIndex } from "@data/items";
import { quickMoveAt } from "@systems/inventory/craft";
import { splitStack } from "@systems/inventory/split";
import {
  inventoryScreen,
  tableScreen,
  furnaceScreen,
  creativeScreen,
  type ScreenDescriptor,
} from "@systems/inventory/screens";

export const ARMOR_LABELS = ["Helmet", "Chest", "Legs", "Boots"];

/**
 * What a slot was asked to do, independent of how it was asked.
 *
 * The handlers below used to read `e.shiftKey` directly, which made them
 * mouse-only by construction. Naming the action instead lets a finger and a
 * cursor drive identical store mutations — the same separation the engine's
 * intent layer makes for gameplay input.
 */
export type SlotAction =
  /** Pick up, place, merge or swap — a plain click or a tap. */
  | "primary"
  /** Send the stack to its paired container — shift-click or double-tap. */
  | "quickMove"
  /** Halve the stack onto the cursor — right-click or long-press. */
  | "split";

/** Which screen is open right now, if any — read fresh at action time. */
function currentScreen(): ScreenDescriptor | null {
  const inv = useInventoryStore.getState();
  if (inv.isOpen) return inventoryScreen();
  if (inv.tableOpen) return tableScreen();
  if (inv.furnaceOpen) return furnaceScreen();
  if (inv.creativeOpen) return creativeScreen();
  return null;
}

/**
 * Shared cursor-item slot mechanics for the hotbar+inventory slots, armor slots
 * and offhand slot. Used by every screen that renders those slots.
 *
 * Every path that writes the cursor passes the slot's `durability` through.
 * Omitting it silently resets a tool to full — `docs/solutions/runtime-errors/
 * inventory-tool-system-crash-and-data-loss-2026-04-08.md` records that
 * happening from a single call site that enumerated only id and count.
 */
export function useSlotInteractions() {
  const applyQuickMove = useCallback((locateIndex: (screen: ScreenDescriptor) => number) => {
    const screen = currentScreen();
    if (!screen) return;
    const flatIndex = locateIndex(screen);
    const next = quickMoveAt(screen.layout, screen.regions, flatIndex, screen.find, MAX_STACK);
    if (next) screen.write(next);
  }, []);

  /**
   * Halve a stack onto the cursor, or drop one item from the cursor onto a
   * compatible slot. Both directions conserve: nothing is created or destroyed,
   * which `inventoryConservation.test.ts` enforces across every screen.
   */
  const applySplit = useCallback((index: number) => {
    const store = useHotbarStore.getState();
    const invStore = useInventoryStore.getState();
    const cursor = invStore.cursorItem;
    const stackable = !getToolDef(cursor.blockId) && !getArmorDef(cursor.blockId);

    const next = splitStack(store.slots[index], cursor, MAX_STACK, stackable);
    if (!next) return;

    const slots = [...store.slots];
    slots[index] = next.slot;
    useHotbarStore.setState({ slots });
    if (next.cursor.count === 0) invStore.clearCursor();
    else invStore.setCursorItem(next.cursor.blockId, next.cursor.count, next.cursor.durability);
  }, []);

  const handleSlotAction = useCallback(
    (action: SlotAction, index: number) => {
      if (action === "quickMove") {
        applyQuickMove(() => index);
        return;
      }
      if (action === "split") {
        applySplit(index);
        return;
      }

      const store = useHotbarStore.getState();
      const invStore = useInventoryStore.getState();
      const slot = store.slots[index];
      const cursor = invStore.cursorItem;

      if (cursor.count === 0 && slot.count > 0) {
        invStore.setCursorItem(slot.blockId, slot.count, slot.durability);
        const newSlots = [...store.slots];
        newSlots[index] = { blockId: BLOCK_ID.AIR, count: 0 };
        useHotbarStore.setState({ slots: newSlots });
      } else if (cursor.count > 0 && slot.count === 0) {
        const newSlots = [...store.slots];
        newSlots[index] = { blockId: cursor.blockId, count: cursor.count, durability: cursor.durability };
        useHotbarStore.setState({ slots: newSlots });
        invStore.clearCursor();
      } else if (cursor.count > 0 && slot.count > 0) {
        // Tools and armor never stack — merging would drop their durability
        if (cursor.blockId === slot.blockId && !getToolDef(cursor.blockId) && !getArmorDef(cursor.blockId)) {
          const total = slot.count + cursor.count;
          const fit = Math.min(total, MAX_STACK);
          const leftover = total - fit;
          const newSlots = [...store.slots];
          newSlots[index] = { blockId: slot.blockId, count: fit };
          useHotbarStore.setState({ slots: newSlots });
          if (leftover > 0) invStore.setCursorItem(cursor.blockId, leftover);
          else invStore.clearCursor();
        } else {
          const newSlots = [...store.slots];
          newSlots[index] = { blockId: cursor.blockId, count: cursor.count, durability: cursor.durability };
          useHotbarStore.setState({ slots: newSlots });
          invStore.setCursorItem(slot.blockId, slot.count, slot.durability);
        }
      }
    },
    [applyQuickMove, applySplit]
  );

  const handleArmorAction = useCallback(
    (action: SlotAction, index: number) => {
      if (action === "quickMove") {
        applyQuickMove((screen) => screen.layout.ranges.armor[0] + index);
        return;
      }
      // An armor slot holds exactly one item, so there is no half to take:
      // split falls through to the ordinary pick-up/swap.

      const store = useHotbarStore.getState();
      const invStore = useInventoryStore.getState();
      const slot = store.armor[index];
      const cursor = invStore.cursorItem;

      // Only accept armor items that match this slot type
      const cursorArmor = cursor.count > 0 ? getArmorDef(cursor.blockId) : null;
      const cursorFits = cursorArmor !== null && getArmorSlotIndex(cursorArmor.slot) === index;

      if (cursor.count === 0 && slot.count > 0) {
        invStore.setCursorItem(slot.blockId, slot.count, slot.durability);
        const newArmor = [...store.armor];
        newArmor[index] = { blockId: BLOCK_ID.AIR, count: 0 };
        useHotbarStore.setState({ armor: newArmor });
      } else if (cursor.count > 0 && slot.count === 0 && cursorFits) {
        const newArmor = [...store.armor];
        const def = getArmorDef(cursor.blockId);
        newArmor[index] = {
          blockId: cursor.blockId,
          count: 1,
          durability: cursor.durability ?? def?.durability,
        };
        if (cursor.count === 1) invStore.clearCursor();
        else invStore.setCursorItem(cursor.blockId, cursor.count - 1, cursor.durability);
        useHotbarStore.setState({ armor: newArmor });
      } else if (cursor.count > 0 && slot.count > 0 && cursorFits) {
        // Swap
        const newArmor = [...store.armor];
        const def = getArmorDef(cursor.blockId);
        newArmor[index] = {
          blockId: cursor.blockId,
          count: 1,
          durability: cursor.durability ?? def?.durability,
        };
        useHotbarStore.setState({ armor: newArmor });
        invStore.setCursorItem(slot.blockId, slot.count, slot.durability);
      }
    },
    [applyQuickMove]
  );

  const handleOffhandAction = useCallback(
    (action: SlotAction) => {
      if (action === "quickMove") {
        applyQuickMove((screen) => screen.layout.ranges.offhand);
        return;
      }

      const store = useHotbarStore.getState();
      const invStore = useInventoryStore.getState();
      const slot = store.offhand;
      const cursor = invStore.cursorItem;

      if (cursor.count === 0 && slot.count > 0) {
        invStore.setCursorItem(slot.blockId, slot.count, slot.durability);
        useHotbarStore.setState({ offhand: { blockId: BLOCK_ID.AIR, count: 0 } });
      } else if (cursor.count > 0 && slot.count === 0) {
        useHotbarStore.setState({ offhand: { blockId: cursor.blockId, count: cursor.count, durability: cursor.durability } });
        invStore.clearCursor();
      } else if (cursor.count > 0 && slot.count > 0) {
        useHotbarStore.setState({ offhand: { blockId: cursor.blockId, count: cursor.count, durability: cursor.durability } });
        invStore.setCursorItem(slot.blockId, slot.count, slot.durability);
      }
    },
    [applyQuickMove]
  );

  return { handleSlotAction, handleArmorAction, handleOffhandAction };
}
