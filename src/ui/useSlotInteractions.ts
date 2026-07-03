"use client";

import { useCallback } from "react";
import { useInventoryStore } from "@store/useInventoryStore";
import { useHotbarStore, MAX_STACK } from "@store/useHotbarStore";
import { BLOCK_ID } from "@data/blocks";
import { getToolDef, getArmorDef, getArmorSlotIndex } from "@data/items";

export const ARMOR_LABELS = ["Helmet", "Chest", "Legs", "Boots"];

/**
 * Shared cursor-item slot mechanics (pick up / place / merge / swap) for the
 * hotbar+inventory slots, armor slots, and offhand slot. Used by both the
 * survival inventory screen and the creative inventory screen.
 */
export function useSlotInteractions() {
  // Click any inventory/hotbar slot
  const handleSlotClick = useCallback((index: number) => {
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
  }, []);

  const handleArmorClick = useCallback((index: number) => {
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
  }, []);

  const handleOffhandClick = useCallback(() => {
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
  }, []);

  return { handleSlotClick, handleArmorClick, handleOffhandClick };
}
