import { describe, it, expect } from "vitest";
import {
  BREAK_STAGE_COUNT,
  breakStageForProgress,
  buildCrackStages,
  BlockBreakOverlay,
} from "@engine/renderer/BlockBreakOverlay";

const SIZE = 16;

/** Texels visible at or before `stage`. */
function coverage(grid: Int8Array, stage: number): number {
  let n = 0;
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] !== -1 && grid[i] <= stage) n++;
  }
  return n;
}

describe("breakStageForProgress", () => {
  it("draws nothing at or below zero progress", () => {
    expect(breakStageForProgress(0)).toBe(-1);
    expect(breakStageForProgress(-0.2)).toBe(-1);
    expect(breakStageForProgress(Number.NaN)).toBe(-1);
  });

  it("spreads progress across every stage", () => {
    const seen = new Set<number>();
    for (let p = 0.001; p < 1; p += 0.001) seen.add(breakStageForProgress(p));
    expect(seen.size).toBe(BREAK_STAGE_COUNT);
    expect(Math.min(...seen)).toBe(0);
    expect(Math.max(...seen)).toBe(BREAK_STAGE_COUNT - 1);
  });

  it("only reaches the final stage as progress approaches one", () => {
    expect(breakStageForProgress(0.05)).toBe(0);
    expect(breakStageForProgress(0.5)).toBe(5);
    expect(breakStageForProgress(0.95)).toBe(BREAK_STAGE_COUNT - 1);
    expect(breakStageForProgress(1)).toBe(BREAK_STAGE_COUNT - 1);
    expect(breakStageForProgress(4)).toBe(BREAK_STAGE_COUNT - 1);
  });

  it("never decreases as progress rises", () => {
    let prev = -1;
    for (let p = 0; p <= 1.0001; p += 0.01) {
      const stage = breakStageForProgress(p);
      expect(stage).toBeGreaterThanOrEqual(prev);
      prev = stage;
    }
  });
});

describe("buildCrackStages", () => {
  it("is deterministic across calls", () => {
    expect(Array.from(buildCrackStages())).toEqual(Array.from(buildCrackStages()));
  });

  it("keeps every birth stage inside the stage range", () => {
    const grid = buildCrackStages();
    expect(grid.length).toBe(SIZE * SIZE);
    for (const v of grid) {
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(BREAK_STAGE_COUNT - 1);
    }
  });

  it("accumulates damage — coverage never shrinks and strictly grows", () => {
    const grid = buildCrackStages();
    let prev = 0;
    let growthSteps = 0;
    for (let s = 0; s < BREAK_STAGE_COUNT; s++) {
      const c = coverage(grid, s);
      expect(c).toBeGreaterThanOrEqual(prev);
      if (c > prev) growthSteps++;
      prev = c;
    }
    // Every stage should add something, otherwise stages look identical.
    expect(growthSteps).toBe(BREAK_STAGE_COUNT);
  });

  it("shows a small crack at the first stage and a large one at the last", () => {
    const grid = buildCrackStages();
    const first = coverage(grid, 0);
    const last = coverage(grid, BREAK_STAGE_COUNT - 1);
    expect(first).toBeGreaterThan(0);
    // Cracks, not a solid overlay: the block texture must still show through.
    expect(first).toBeLessThan(last * 0.35);
    expect(last).toBeLessThan(grid.length * 0.6);
  });

  it("varies with the seed", () => {
    const a = Array.from(buildCrackStages(SIZE, BREAK_STAGE_COUNT, 1));
    const b = Array.from(buildCrackStages(SIZE, BREAK_STAGE_COUNT, 2));
    expect(a).not.toEqual(b);
  });
});

describe("BlockBreakOverlay", () => {
  it("stays hidden without a target or with no progress", () => {
    const overlay = new BlockBreakOverlay();
    overlay.update(null, 0.5);
    expect(overlay.getMesh().visible).toBe(false);
    overlay.update({ x: 1, y: 2, z: 3 }, 0);
    expect(overlay.getMesh().visible).toBe(false);
    overlay.dispose();
  });

  it("degrades safely with no canvas available (headless / SSR)", () => {
    // vitest runs in the node environment, so `document` is undefined here and
    // no crack textures can be built. The overlay must not throw or show a
    // black box.
    expect(typeof document).toBe("undefined");
    const overlay = new BlockBreakOverlay();
    overlay.update({ x: 0, y: 0, z: 0 }, 0.9);
    expect(overlay.getMesh().visible).toBe(false);
    expect(() => overlay.dispose()).not.toThrow();
  });

  it("disposes without throwing when called twice", () => {
    const overlay = new BlockBreakOverlay();
    overlay.dispose();
    expect(() => overlay.dispose()).not.toThrow();
  });
});
