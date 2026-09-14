import { beforeEach, describe, expect, it } from "vitest";
import { BLOCK_ID } from "@data/blocks";
import { MAX_STACK, useHotbarStore } from "@store/useHotbarStore";
import { useInventoryStore } from "@store/useInventoryStore";
import { DOUBLE_TAP_MS, LONG_PRESS_MS, MOVE_CANCEL_PX } from "@ui/useSlotGestures";
import { splitStack } from "@systems/inventory/split";
import { getArmorDef, getToolDef } from "@data/items";

/**
 * The gesture grammar, exercised at the level the store sees it.
 *
 * `useSlotGestures` classifies pointer events into actions and
 * `useSlotInteractions` applies them; both are React hooks, and this suite runs
 * in the node environment. So the classifier's *timings* are asserted as plain
 * arithmetic, and the mutations run the same `splitStack` the hook calls —
 * against the live stores, which is where a conservation bug shows up.
 */

const AIR = { blockId: BLOCK_ID.AIR, count: 0 };

function resetStores() {
  useHotbarStore.setState({
    slots: Array.from({ length: 36 }, () => ({ ...AIR })),
    armor: Array.from({ length: 4 }, () => ({ ...AIR })),
    offhand: { ...AIR },
    selectedIndex: 0,
  });
  useInventoryStore.getState().clearCursor();
}

/** Total items across every container and the cursor. */
function census(): Map<number, number> {
  const h = useHotbarStore.getState();
  const cursor = useInventoryStore.getState().cursorItem;
  const tally = new Map<number, number>();
  const add = (s: { blockId: number; count: number }) => {
    if (s.count <= 0 || s.blockId === BLOCK_ID.AIR) return;
    tally.set(s.blockId, (tally.get(s.blockId) ?? 0) + s.count);
  };
  h.slots.forEach(add);
  h.armor.forEach(add);
  add(h.offhand);
  add(cursor);
  return tally;
}

/** Drives the same pure split the hook runs, against the live stores. */
function splitAt(index: number) {
  const store = useHotbarStore.getState();
  const inv = useInventoryStore.getState();
  const cursor = inv.cursorItem;
  const stackable = !getToolDef(cursor.blockId) && !getArmorDef(cursor.blockId);

  const next = splitStack(store.slots[index], cursor, MAX_STACK, stackable);
  if (!next) return;

  const slots = [...store.slots];
  slots[index] = next.slot;
  useHotbarStore.setState({ slots });
  if (next.cursor.count === 0) inv.clearCursor();
  else inv.setCursorItem(next.cursor.blockId, next.cursor.count, next.cursor.durability);
}

beforeEach(resetStores);

describe("gesture thresholds", () => {
  it("separates a long-press from a tap by a usable margin", () => {
    // A long-press must not be reachable by an ordinary tap, and the tap must
    // resolve well before one.
    expect(LONG_PRESS_MS).toBeGreaterThan(DOUBLE_TAP_MS);
    expect(LONG_PRESS_MS - DOUBLE_TAP_MS).toBeGreaterThanOrEqual(100);
  });

  it("keeps the tap wait short enough not to read as lag", () => {
    expect(DOUBLE_TAP_MS).toBeLessThanOrEqual(300);
  });

  it("cancels on a movement smaller than a slot", () => {
    // The threshold has to be crossed by a scroll but not by the wobble of a
    // finger resting on a 44px target.
    expect(MOVE_CANCEL_PX).toBeGreaterThan(4);
    expect(MOVE_CANCEL_PX).toBeLessThan(44);
  });
});

describe("split conserves", () => {
  it("halves a stack onto the cursor, larger half taken", () => {
    const slots = [...useHotbarStore.getState().slots];
    slots[0] = { blockId: BLOCK_ID.STONE, count: 7 };
    useHotbarStore.setState({ slots });

    splitAt(0);

    expect(useInventoryStore.getState().cursorItem.count).toBe(4);
    expect(useHotbarStore.getState().slots[0].count).toBe(3);
    expect(census().get(BLOCK_ID.STONE)).toBe(7);
  });

  it("moves a single item whole, leaving the slot empty", () => {
    const slots = [...useHotbarStore.getState().slots];
    slots[0] = { blockId: BLOCK_ID.STONE, count: 1 };
    useHotbarStore.setState({ slots });

    splitAt(0);

    expect(useInventoryStore.getState().cursorItem.count).toBe(1);
    expect(useHotbarStore.getState().slots[0].count).toBe(0);
    expect(census().get(BLOCK_ID.STONE)).toBe(1);
  });

  it("places one item back when the cursor is holding", () => {
    useInventoryStore.getState().setCursorItem(BLOCK_ID.STONE, 5);

    splitAt(3);

    expect(useHotbarStore.getState().slots[3].count).toBe(1);
    expect(useInventoryStore.getState().cursorItem.count).toBe(4);
    expect(census().get(BLOCK_ID.STONE)).toBe(5);
  });

  it("refuses to drop onto an occupied slot of a different item", () => {
    const slots = [...useHotbarStore.getState().slots];
    slots[3] = { blockId: BLOCK_ID.DIRT, count: 2 };
    useHotbarStore.setState({ slots });
    useInventoryStore.getState().setCursorItem(BLOCK_ID.STONE, 5);

    splitAt(3);

    expect(useHotbarStore.getState().slots[3]).toEqual({ blockId: BLOCK_ID.DIRT, count: 2 });
    expect(useInventoryStore.getState().cursorItem.count).toBe(5);
  });

  it("conserves across a long alternating sequence", () => {
    const slots = [...useHotbarStore.getState().slots];
    slots[0] = { blockId: BLOCK_ID.STONE, count: 64 };
    useHotbarStore.setState({ slots });
    const before = census();

    for (let i = 0; i < 12; i++) splitAt(i % 5);

    expect(census()).toEqual(before);
  });
});

describe("durability survives a split", () => {
  it("carries the tool's remaining durability onto the cursor", () => {
    const slots = [...useHotbarStore.getState().slots];
    slots[0] = { blockId: BLOCK_ID.WOODEN_PICKAXE, count: 1, durability: 17 };
    useHotbarStore.setState({ slots });

    splitAt(0);

    // The bug this guards is a call site that enumerated id and count and let
    // durability default back to full.
    expect(useInventoryStore.getState().cursorItem.durability).toBe(17);
  });

  it("carries it back when the item is placed down", () => {
    useInventoryStore.getState().setCursorItem(BLOCK_ID.WOODEN_PICKAXE, 1, 17);

    splitAt(2);

    expect(useHotbarStore.getState().slots[2].durability).toBe(17);
  });
});

describe("an abandoned gesture leaves the cursor recoverable", () => {
  it("keeps the taken half on the cursor rather than dropping it", () => {
    const slots = [...useHotbarStore.getState().slots];
    slots[0] = { blockId: BLOCK_ID.STONE, count: 8 };
    useHotbarStore.setState({ slots });

    splitAt(0);
    // Player walks away mid-gesture: nothing else happens.

    const cursor = useInventoryStore.getState().cursorItem;
    expect(cursor.count).toBe(4);
    expect(census().get(BLOCK_ID.STONE)).toBe(8);
  });
});
