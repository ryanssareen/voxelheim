import { describe, it, expect } from "vitest";
import { shouldApplyResize } from "@engine/renderer/Renderer";

/**
 * The canvas used to lock itself at 0x0: three.js wrote an inline size onto the
 * element, GameCanvas measured that same element on resize, so one zero
 * measurement fed itself back in forever and the game stayed black until a
 * reload. The measurement source moved to the container; this guard is the
 * second half of the fix, so a degenerate size can never be applied at all.
 */
describe("shouldApplyResize", () => {
  it("accepts a real viewport", () => {
    expect(shouldApplyResize(1280, 800)).toBe(true);
    expect(shouldApplyResize(1, 1)).toBe(true);
  });

  it("rejects a zero measurement from an unlaid-out container", () => {
    expect(shouldApplyResize(0, 0)).toBe(false);
    expect(shouldApplyResize(1280, 0)).toBe(false);
    expect(shouldApplyResize(0, 800)).toBe(false);
  });

  it("rejects negative sizes", () => {
    expect(shouldApplyResize(-1280, 800)).toBe(false);
    expect(shouldApplyResize(1280, -800)).toBe(false);
  });

  it("rejects non-finite sizes so the camera aspect never becomes NaN", () => {
    // 0 / 0 is NaN, and a NaN aspect corrupts the projection matrix for good.
    expect(shouldApplyResize(NaN, NaN)).toBe(false);
    expect(shouldApplyResize(Infinity, 800)).toBe(false);
    expect(shouldApplyResize(1280, Infinity)).toBe(false);
  });

  it("keeps every accepted pair safe to divide for an aspect ratio", () => {
    const pairs: Array<[number, number]> = [
      [1280, 800], [375, 812], [3840, 2160], [1, 10000], [10000, 1],
      [0, 0], [0, 600], [600, 0], [NaN, 1], [-5, -5],
    ];
    for (const [w, h] of pairs) {
      if (!shouldApplyResize(w, h)) continue;
      const aspect = w / h;
      expect(Number.isFinite(aspect), `aspect for ${w}x${h}`).toBe(true);
      expect(aspect).toBeGreaterThan(0);
    }
  });
});
