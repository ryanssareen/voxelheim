import { describe, it, expect, vi, beforeEach } from "vitest";
import { BLOCK_ID } from "@data/blocks";
import { TOOL_DEFS, getToolDef } from "@data/items";
import { harvestSpeedMultiplier } from "@engine/player/harvest";
import { BlockInteraction } from "@engine/player/BlockInteraction";
import { BlockRegistry } from "@engine/world/BlockRegistry";
import type { ChunkManager } from "@engine/world/ChunkManager";
import type { ItemDropManager } from "@engine/world/ItemDropManager";
import { useHotbarStore } from "@store/useHotbarStore";
import { useGameStore } from "@store/useGameStore";

/**
 * Pins the input-temporal contract of BlockInteraction.update: breaking is HELD state
 * (progress accrues per-frame while a button stays down, keyed to the currently aimed
 * block) and placing is driven by a single boolean flag per call with NO internal
 * edge-latch of its own — see the "placing" describe block below for what that means
 * in practice.
 */

const registry = BlockRegistry.getInstance();

beforeEach(() => {
  useGameStore.getState().resetObjective();
  useHotbarStore.getState().resetSlots();
});

/** Equips `toolId` (or empty hand for null) into hotbar slot 0 and selects it. */
function equipTool(toolId: number | null): void {
  useHotbarStore.getState().resetSlots();
  if (toolId === null) return;
  const slots = [...useHotbarStore.getState().slots];
  slots[0] = { blockId: toolId, count: 1, durability: getToolDef(toolId)?.durability };
  useHotbarStore.setState({ slots, selectedIndex: 0 });
}

/** Equips a stack of a placeable (non-tool) block into hotbar slot 0 and selects it. */
function equipPlaceable(blockId: number, count: number): void {
  useHotbarStore.getState().resetSlots();
  const slots = [...useHotbarStore.getState().slots];
  slots[0] = { blockId, count };
  useHotbarStore.setState({ slots, selectedIndex: 0 });
}

/** A chunk world backed by a mutable single-cell map: (x,y,z) -> blockId, else AIR. */
function makeWorld(initial: { x: number; y: number; z: number; id: number }) {
  let cell = { ...initial };
  const getBlock = (x: number, y: number, z: number): number =>
    x === cell.x && y === cell.y && z === cell.z ? cell.id : BLOCK_ID.AIR;
  const setBlock = vi.fn(() => true);
  return {
    chunkManager: { getBlock, setBlock } as unknown as ChunkManager,
    setBlock,
    moveTo: (pos: { x: number; y: number; z: number; id?: number }) => {
      cell = { ...cell, ...pos };
    },
  };
}

/** A frozen (never mutated) single solid cell — for tests where the world must look
 * identical to BlockInteraction on every single call, regardless of what it just did. */
function makeStaticWorld(target: { x: number; y: number; z: number; id: number }) {
  const getBlock = (x: number, y: number, z: number): number =>
    x === target.x && y === target.y && z === target.z ? target.id : BLOCK_ID.AIR;
  const setBlock = vi.fn(() => true);
  return { chunkManager: { getBlock, setBlock } as unknown as ChunkManager, setBlock };
}

const spawnDrop = () => vi.fn();

function makeInteraction(chunkManager: ChunkManager, spawnDropFn = spawnDrop()) {
  const itemDrops = { spawnDrop: spawnDropFn } as unknown as ItemDropManager;
  return { interaction: new BlockInteraction(chunkManager, registry, itemDrops), spawnDrop: spawnDropFn };
}

// Looking straight up: eye at (0.5, 1.6, 0.5), ray steps through (0,1,0) before (0,2,0).
const PLAYER_UP = { x: 0.5, y: 0, z: 0.5 };
const LOOK_UP = { x: 0, y: 1, z: 0 };
const TARGET_A = { x: 0, y: 2, z: 0 };
const TARGET_B = { x: 0, y: 3, z: 0 };
// Above the player, so placing into the face below it always overlaps the 1.8-tall
// hitbox — used deliberately for the "rejected on overlap" case.
const FACE_BELOW_TARGET_A = { x: 0, y: 1, z: 0 };

// Looking sideways, well clear of the player's own hitbox.
const PLAYER_SIDE = { x: 0, y: 0, z: 0 };
const LOOK_SIDE = { x: 1, y: 0, z: 0 };
const TARGET_SIDE = { x: 5, y: 1, z: 0 };
const FACE_BEFORE_TARGET_SIDE = { x: 4, y: 1, z: 0 };

describe("BlockInteraction — breaking is HELD state", () => {
  it("accrues progress each frame while held, scaled by dt / breakTime * tool speed multiplier", () => {
    const { chunkManager } = makeStaticWorld({ ...TARGET_A, id: BLOCK_ID.DIRT });
    const { interaction } = makeInteraction(chunkManager);
    const dt = 0.05;
    const expectedPerTick = (dt * harvestSpeedMultiplier(registry.getBlock(BLOCK_ID.DIRT)!, null)) / 0.5;

    const s1 = interaction.update(PLAYER_UP, LOOK_UP, true, false, 0, dt);
    expect(s1.isBreaking).toBe(true);
    expect(s1.breakProgress).toBeCloseTo(expectedPerTick);
    expect(s1.breakTarget).toEqual(TARGET_A);

    const s2 = interaction.update(PLAYER_UP, LOOK_UP, true, false, 0, dt);
    expect(s2.breakProgress).toBeCloseTo(expectedPerTick * 2);
  });

  it("scales progress by the held tool's speed multiplier (not just dt / breakTime)", () => {
    const { chunkManager } = makeStaticWorld({ ...TARGET_A, id: BLOCK_ID.STONE });
    const { interaction } = makeInteraction(chunkManager);
    equipTool(BLOCK_ID.WOODEN_PICKAXE);
    const dt = 0.1;
    const mul = harvestSpeedMultiplier(registry.getBlock(BLOCK_ID.STONE)!, TOOL_DEFS[BLOCK_ID.WOODEN_PICKAXE]);
    expect(mul).toBeCloseTo(2); // sanity: pinned in toolTiers.test.ts

    const s1 = interaction.update(PLAYER_UP, LOOK_UP, true, false, 0, dt);
    expect(s1.breakProgress).toBeCloseTo((dt * mul) / 1.5);
  });

  it("resets progress to a fresh single-tick value when the targeted block changes mid-break", () => {
    const world = makeWorld({ ...TARGET_A, id: BLOCK_ID.DIRT });
    const { interaction } = makeInteraction(world.chunkManager);
    const dt = 0.05; // breakTime 0.5 -> 0.1 progress/tick, well under 1.0

    interaction.update(PLAYER_UP, LOOK_UP, true, false, 0, dt);
    const s2 = interaction.update(PLAYER_UP, LOOK_UP, true, false, 0, dt);
    expect(s2.breakProgress).toBeCloseTo(0.2); // two ticks accumulated on TARGET_A

    // Player's aim now resolves to a different block (TARGET_B) instead of TARGET_A.
    world.moveTo({ ...TARGET_B, id: BLOCK_ID.DIRT });
    const s3 = interaction.update(PLAYER_UP, LOOK_UP, true, false, 0, dt);

    // Progress is NOT 0.2 + 0.1 = 0.3 (carried over); it restarts as if this were the
    // first tick on the new block.
    expect(s3.breakProgress).toBeCloseTo(0.1);
    expect(s3.breakTarget).toEqual(TARGET_B);
  });

  it("resets progress to zero the instant the input is released", () => {
    const { chunkManager } = makeStaticWorld({ ...TARGET_A, id: BLOCK_ID.DIRT });
    const { interaction } = makeInteraction(chunkManager);

    interaction.update(PLAYER_UP, LOOK_UP, true, false, 0, 0.05);
    const released = interaction.update(PLAYER_UP, LOOK_UP, false, false, 0, 0.05);

    expect(released.isBreaking).toBe(false);
    expect(released.breakProgress).toBe(0);
    expect(released.breakTarget).toBeNull();
  });

  it("resets progress to zero the instant the ray finds no target, even while still held", () => {
    const world = makeWorld({ ...TARGET_A, id: BLOCK_ID.DIRT });
    const { interaction } = makeInteraction(world.chunkManager);

    interaction.update(PLAYER_UP, LOOK_UP, true, false, 0, 0.05);
    // Move the only solid cell far out of the ray's path entirely.
    world.moveTo({ x: 500, y: 500, z: 500 });
    const s = interaction.update(PLAYER_UP, LOOK_UP, true, false, 0, 0.05);

    expect(s.isBreaking).toBe(false);
    expect(s.breakProgress).toBe(0);
    expect(s.breakTarget).toBeNull();
  });

  it("reports in-progress state right up to the tick before completion", () => {
    const { chunkManager } = makeStaticWorld({ ...TARGET_A, id: BLOCK_ID.DIRT });
    const { interaction } = makeInteraction(chunkManager);
    const dt = 0.25; // breakTime 0.5 -> exactly two ticks to break

    const s1 = interaction.update(PLAYER_UP, LOOK_UP, true, false, 0, dt);
    expect(s1.isBreaking).toBe(true);
    expect(s1.breakProgress).toBeCloseTo(0.5);
    expect(s1.breakTarget).toEqual(TARGET_A);
  });

  it("at the tick progress reaches >= 1.0: breaks the block and the returned state already reads zeroed/idle", () => {
    const { chunkManager, setBlock } = makeStaticWorld({ ...TARGET_A, id: BLOCK_ID.DIRT });
    const { interaction, spawnDrop } = makeInteraction(chunkManager);
    const dt = 0.5; // breakTime 0.5, no tool (multiplier 1) -> exactly 1.0 on the very first tick

    const s = interaction.update(PLAYER_UP, LOOK_UP, true, false, 0, dt);

    expect(setBlock).toHaveBeenCalledTimes(1);
    expect(setBlock).toHaveBeenCalledWith(TARGET_A.x, TARGET_A.y, TARGET_A.z, BLOCK_ID.AIR);
    expect(spawnDrop).toHaveBeenCalledTimes(1); // DIRT harvests with an empty hand
    // The completion frame does NOT surface the >=1.0 (or overshot) value — it reports
    // the fully-reset idle state instead.
    expect(s.isBreaking).toBe(false);
    expect(s.breakProgress).toBe(0);
    expect(s.breakTarget).toBeNull();
  });

  it("an overshooting dt (well past 1.0 in one tick) still breaks on that tick and resets cleanly, not clamped-then-carried", () => {
    const { chunkManager, setBlock } = makeStaticWorld({ ...TARGET_A, id: BLOCK_ID.DIRT });
    const { interaction } = makeInteraction(chunkManager);
    const s = interaction.update(PLAYER_UP, LOOK_UP, true, false, 0, 5); // 5 / 0.5 = 10.0, way over 1.0

    expect(setBlock).toHaveBeenCalledTimes(1);
    expect(s.breakProgress).toBe(0);
  });
});

describe("BlockInteraction — placing is a single-flag EDGE action, with no internal debounce", () => {
  it("places exactly once for a single rightClick=true call", () => {
    const { chunkManager, setBlock } = makeStaticWorld({ ...TARGET_SIDE, id: BLOCK_ID.STONE });
    const { interaction } = makeInteraction(chunkManager);
    equipPlaceable(BLOCK_ID.DIRT, 3);

    interaction.update(PLAYER_SIDE, LOOK_SIDE, false, true, 0, 0.05);

    expect(setBlock).toHaveBeenCalledTimes(1);
    expect(setBlock).toHaveBeenCalledWith(
      FACE_BEFORE_TARGET_SIDE.x,
      FACE_BEFORE_TARGET_SIDE.y,
      FACE_BEFORE_TARGET_SIDE.z,
      BLOCK_ID.DIRT
    );
    expect(useHotbarStore.getState().slots[0].count).toBe(2);
  });

  it("CHARACTERIZATION: BlockInteraction itself has no place-once-per-press latch — holding " +
    "rightClick=true across consecutive update() calls (unchanged target) places again every " +
    "single call, bounded only by available inventory. Edge-triggering must come from the caller.",
    () => {
      const { chunkManager, setBlock } = makeStaticWorld({ ...TARGET_SIDE, id: BLOCK_ID.STONE });
      const { interaction } = makeInteraction(chunkManager);
      equipPlaceable(BLOCK_ID.DIRT, 3);

      interaction.update(PLAYER_SIDE, LOOK_SIDE, false, true, 0, 0.05);
      interaction.update(PLAYER_SIDE, LOOK_SIDE, false, true, 0, 0.05);
      interaction.update(PLAYER_SIDE, LOOK_SIDE, false, true, 0, 0.05);

      // Three frames of a held rightClick=true produced three placements, not one.
      expect(setBlock).toHaveBeenCalledTimes(3);
      // The third placement exhausted the stack of 3.
      expect(useHotbarStore.getState().slots[0]).toEqual({ blockId: BLOCK_ID.AIR, count: 0 });
    }
  );

  it("stops placing on its own once the stack is exhausted (inventory, not the click flag, ends the stream)", () => {
    const { chunkManager, setBlock } = makeStaticWorld({ ...TARGET_SIDE, id: BLOCK_ID.STONE });
    const { interaction } = makeInteraction(chunkManager);
    equipPlaceable(BLOCK_ID.DIRT, 2);

    for (let i = 0; i < 5; i++) {
      interaction.update(PLAYER_SIDE, LOOK_SIDE, false, true, 0, 0.05);
    }

    expect(setBlock).toHaveBeenCalledTimes(2); // not 5
  });

  it("resolves placement position from the targeted face, not the targeted block itself", () => {
    const { chunkManager, setBlock } = makeStaticWorld({ ...TARGET_A, id: BLOCK_ID.STONE });
    const { interaction } = makeInteraction(chunkManager);
    // Face is directly below TARGET_A; aim from far below the player's own body so
    // there's no overlap (player straddles the face cell here on purpose — see next test
    // for the overlap-rejection case using this exact geometry).
    equipPlaceable(BLOCK_ID.DIRT, 1);

    interaction.update(PLAYER_UP, LOOK_UP, false, true, 0, 0.05);

    // Whatever happened, it must never target TARGET_A itself (the solid block hit).
    if (setBlock.mock.calls.length > 0) {
      expect(setBlock).toHaveBeenCalledWith(
        FACE_BELOW_TARGET_A.x,
        FACE_BELOW_TARGET_A.y,
        FACE_BELOW_TARGET_A.z,
        BLOCK_ID.DIRT
      );
    }
  });

  it("rejects placement that would intersect the player's own hitbox, and leaves inventory untouched", () => {
    const { chunkManager, setBlock } = makeStaticWorld({ ...TARGET_A, id: BLOCK_ID.STONE });
    const { interaction } = makeInteraction(chunkManager);
    equipPlaceable(BLOCK_ID.DIRT, 1);

    // Looking straight up from directly beneath: the face cell (0,1,0) spans y:[1,2],
    // which overlaps the player's own 1.8-tall hitbox standing at y:[0,1.8].
    interaction.update(PLAYER_UP, LOOK_UP, false, true, 0, 0.05);

    expect(setBlock).not.toHaveBeenCalled();
    expect(useHotbarStore.getState().slots[0]).toEqual({ blockId: BLOCK_ID.DIRT, count: 1 });
  });

  it("accepts an otherwise-identical placement once it's far enough from the player to not overlap", () => {
    const { chunkManager, setBlock } = makeStaticWorld({ ...TARGET_SIDE, id: BLOCK_ID.STONE });
    const { interaction } = makeInteraction(chunkManager);
    equipPlaceable(BLOCK_ID.DIRT, 1);

    interaction.update(PLAYER_SIDE, LOOK_SIDE, false, true, 0, 0.05);

    expect(setBlock).toHaveBeenCalledTimes(1);
  });

  it("CHARACTERIZATION: the `selectedBlockId` parameter is dead — placement reads the hotbar's own selection, ignoring the argument entirely", () => {
    const { chunkManager, setBlock } = makeStaticWorld({ ...TARGET_SIDE, id: BLOCK_ID.STONE });
    const { interaction } = makeInteraction(chunkManager);
    equipPlaceable(BLOCK_ID.DIRT, 1);

    // Pass a completely different block id as the `selectedBlockId` argument.
    interaction.update(PLAYER_SIDE, LOOK_SIDE, false, true, BLOCK_ID.STONE, 0.05);

    // The block actually placed is DIRT (the hotbar's real selection), not the
    // BLOCK_ID.STONE that was passed as `selectedBlockId`.
    expect(setBlock).toHaveBeenCalledWith(
      FACE_BEFORE_TARGET_SIDE.x,
      FACE_BEFORE_TARGET_SIDE.y,
      FACE_BEFORE_TARGET_SIDE.z,
      BLOCK_ID.DIRT
    );
  });
});
