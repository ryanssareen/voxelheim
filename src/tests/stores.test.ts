import { describe, it, expect, beforeEach } from "vitest";
import { useGameStore } from "@store/useGameStore";
import { useHotbarStore } from "@store/useHotbarStore";
import { BLOCK_ID } from "@data/blocks";

describe("useGameStore", () => {
  beforeEach(() => {
    useGameStore.getState().resetObjective();
    useGameStore.setState({ isPaused: false });
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
    useHotbarStore.getState().select(0);
  });

  it("starts with AIR selected (empty hotbar)", () => {
    expect(useHotbarStore.getState().getSelectedBlockId()).toBe(BLOCK_ID.AIR);
  });

  it("select(3) changes selectedIndex", () => {
    useHotbarStore.getState().select(3);
    expect(useHotbarStore.getState().selectedIndex).toBe(3);
    expect(useHotbarStore.getState().getSelectedBlockId()).toBe(BLOCK_ID.AIR);
  });

  it("scrollUp wraps from 0 to 7", () => {
    useHotbarStore.getState().select(0);
    useHotbarStore.getState().scrollUp();
    expect(useHotbarStore.getState().selectedIndex).toBe(7);
  });

  it("scrollDown wraps from 7 to 0", () => {
    useHotbarStore.getState().select(7);
    useHotbarStore.getState().scrollDown();
    expect(useHotbarStore.getState().selectedIndex).toBe(0);
  });
});
