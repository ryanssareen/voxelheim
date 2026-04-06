import { describe, it, expect, beforeEach } from "vitest";
import { useGameStore } from "@store/useGameStore";
import { useHotbarStore } from "@store/useHotbarStore";
import { BLOCK_ID } from "@data/blocks";

describe("useGameStore", () => {
  beforeEach(() => {
    useGameStore.getState().resetObjective();
    useGameStore.setState({ isPaused: false, isDead: false });
  });

  it("starts with 0 shards collected", () => {
    expect(useGameStore.getState().shardsCollected).toBe(0);
    expect(useGameStore.getState().isComplete).toBe(false);
  });

  it("collectShard increments count", () => {
    useGameStore.getState().collectShard();
    expect(useGameStore.getState().shardsCollected).toBe(1);
  });

  it("sets isComplete when shardsCollected reaches shardsTotal", () => {
    for (let i = 0; i < 5; i++) {
      useGameStore.getState().collectShard();
    }
    expect(useGameStore.getState().isComplete).toBe(true);
  });

  it("resetObjective resets to 0", () => {
    useGameStore.getState().collectShard();
    useGameStore.getState().collectShard();
    useGameStore.getState().resetObjective();
    expect(useGameStore.getState().shardsCollected).toBe(0);
    expect(useGameStore.getState().isComplete).toBe(false);
  });
});

describe("useHotbarStore", () => {
  beforeEach(() => {
    useHotbarStore.getState().resetSlots();
  });

  it("starts with all empty slots", () => {
    expect(useHotbarStore.getState().getSelectedBlockId()).toBe(BLOCK_ID.AIR);
    expect(useHotbarStore.getState().slots[0].count).toBe(0);
  });

  it("addItem places block in first empty slot", () => {
    useHotbarStore.getState().addItem(BLOCK_ID.DIRT);
    const slot = useHotbarStore.getState().slots[0];
    expect(slot.blockId).toBe(BLOCK_ID.DIRT);
    expect(slot.count).toBe(1);
  });

  it("addItem stacks same block type", () => {
    useHotbarStore.getState().addItem(BLOCK_ID.DIRT);
    useHotbarStore.getState().addItem(BLOCK_ID.DIRT);
    useHotbarStore.getState().addItem(BLOCK_ID.DIRT);
    expect(useHotbarStore.getState().slots[0].count).toBe(3);
  });

  it("addItem puts different blocks in different slots", () => {
    useHotbarStore.getState().addItem(BLOCK_ID.DIRT);
    useHotbarStore.getState().addItem(BLOCK_ID.STONE);
    expect(useHotbarStore.getState().slots[0].blockId).toBe(BLOCK_ID.DIRT);
    expect(useHotbarStore.getState().slots[1].blockId).toBe(BLOCK_ID.STONE);
  });

  it("removeSelectedItem decrements count", () => {
    useHotbarStore.getState().addItem(BLOCK_ID.DIRT);
    useHotbarStore.getState().addItem(BLOCK_ID.DIRT);
    useHotbarStore.getState().select(0);
    const removed = useHotbarStore.getState().removeSelectedItem();
    expect(removed).toBe(BLOCK_ID.DIRT);
    expect(useHotbarStore.getState().slots[0].count).toBe(1);
  });

  it("removeSelectedItem clears slot when count reaches 0", () => {
    useHotbarStore.getState().addItem(BLOCK_ID.DIRT);
    useHotbarStore.getState().select(0);
    useHotbarStore.getState().removeSelectedItem();
    expect(useHotbarStore.getState().slots[0].count).toBe(0);
    expect(useHotbarStore.getState().slots[0].blockId).toBe(BLOCK_ID.AIR);
  });

  it("scrollUp wraps from 0 to 8", () => {
    useHotbarStore.getState().select(0);
    useHotbarStore.getState().scrollUp();
    expect(useHotbarStore.getState().selectedIndex).toBe(8);
  });

  it("scrollDown wraps from 8 to 0", () => {
    useHotbarStore.getState().select(8);
    useHotbarStore.getState().scrollDown();
    expect(useHotbarStore.getState().selectedIndex).toBe(0);
  });

  it("has 36 total slots (9 hotbar + 27 inventory)", () => {
    expect(useHotbarStore.getState().slots.length).toBe(36);
  });

  it("has 4 armor slots", () => {
    expect(useHotbarStore.getState().armor.length).toBe(4);
  });
});
