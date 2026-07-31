import { describe, it, expect } from "vitest";
import { hudMetrics, statRowWidth } from "@ui/useHudScale";

const VIEWPORTS: Array<[number, number, string]> = [
  [320, 568, "iPhone SE portrait"],
  [375, 667, "small phone"],
  [568, 320, "phone landscape"],
  [768, 1024, "tablet portrait"],
  [1024, 768, "tablet landscape"],
  [1280, 800, "laptop"],
  [1920, 1080, "desktop"],
  [3840, 2160, "4K"],
];

describe("hudMetrics", () => {
  it("scales the HUD up from the sizes it replaced", () => {
    const m = hudMetrics(1280, 800);
    // Previous hardcoded values: 18px stats, 24px crosshair, 64px slot,
    // 56px hotbar icon, 12px counts, 14px item name.
    expect(m.stat).toBeGreaterThan(18);
    expect(m.crosshair).toBeGreaterThan(24);
    expect(m.hotbarSlot).toBeGreaterThan(64);
    expect(m.hotbarIcon).toBeGreaterThan(56);
    expect(m.countFont).toBeGreaterThan(12);
    expect(m.itemNameFont).toBeGreaterThan(14);
  });

  it.each(VIEWPORTS)("keeps the stat row inside %ix%i (%s)", (vw, vh) => {
    const m = hudMetrics(vw, vh);
    expect(statRowWidth(m)).toBeLessThanOrEqual(vw);
  });

  it.each(VIEWPORTS)("keeps hotbar slots roughly square at %ix%i (%s)", (vw, vh) => {
    const m = hudMetrics(vw, vh);
    // 9 slots + offhand, each with a 2-4px margin.
    const cellWidth = (vw - m.offhandSlot - 8) / 9 - 4;
    expect(m.hotbarSlot).toBeLessThanOrEqual(cellWidth * 1.6);
    expect(m.hotbarIcon).toBeLessThan(m.hotbarSlot);
    expect(m.offhandIcon).toBeLessThan(m.offhandSlot);
  });

  it.each(VIEWPORTS)("leaves the stat row above the hotbar at %ix%i (%s)", (vw, vh) => {
    const m = hudMetrics(vw, vh);
    expect(m.statBottom).toBeGreaterThan(m.hotbarHeight);
    // ...and the whole stack must still fit vertically.
    expect(m.statBottom + m.stat).toBeLessThan(vh);
  });

  it.each(VIEWPORTS)("produces positive integral sizes at %ix%i (%s)", (vw, vh) => {
    const m = hudMetrics(vw, vh);
    for (const [key, value] of Object.entries(m)) {
      expect(Number.isFinite(value), key).toBe(true);
      expect(value, key).toBeGreaterThan(0);
      if (key !== "scale") expect(Number.isInteger(value), key).toBe(true);
    }
  });

  it("never shrinks a dimension as the viewport grows", () => {
    let prev = hudMetrics(320, 320);
    for (let w = 400; w <= 2400; w += 100) {
      const next = hudMetrics(w, w * 0.64);
      expect(next.stat).toBeGreaterThanOrEqual(prev.stat);
      expect(next.hotbarSlot).toBeGreaterThanOrEqual(prev.hotbarSlot);
      expect(next.crosshair).toBeGreaterThanOrEqual(prev.crosshair);
      prev = next;
    }
  });

  it("clamps at both extremes rather than running away", () => {
    const tiny = hudMetrics(1, 1);
    const huge = hudMetrics(10000, 10000);
    expect(tiny.scale).toBe(0.75);
    expect(huge.scale).toBe(1.2);
    expect(huge.hotbarSlot).toBeLessThanOrEqual(96);
    expect(tiny.stat).toBeGreaterThanOrEqual(10);
  });

  it("guards against zero or negative viewports", () => {
    expect(() => hudMetrics(0, 0)).not.toThrow();
    expect(hudMetrics(-100, -100).stat).toBeGreaterThan(0);
  });
});
