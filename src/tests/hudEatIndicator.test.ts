import { describe, it, expect, afterEach } from "vitest";
import { crosshairBarMetrics, progressPercent } from "@ui/HUD";
import { hudMetrics } from "@ui/useHudScale";
import { useGameStore } from "@store/useGameStore";

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

describe("crosshairBarMetrics", () => {
  it.each(VIEWPORTS)("fits inside and reads clearly at %ix%i (%s)", (vw, vh) => {
    const m = hudMetrics(vw, vh);
    const bar = crosshairBarMetrics(m);

    expect(bar.width).toBeLessThan(vw);
    expect(bar.width).toBeGreaterThan(m.crosshair);
    expect(bar.height).toBeGreaterThanOrEqual(3);
    // Sits below the crosshair glyph rather than on top of it.
    expect(bar.marginTop).toBeGreaterThanOrEqual(m.crosshair / 2);

    for (const [key, value] of Object.entries(bar)) {
      expect(Number.isInteger(value), key).toBe(true);
    }
  });
});

describe("progressPercent", () => {
  it("clamps and rounds to an integer percent", () => {
    expect(progressPercent(-1)).toBe(0);
    expect(progressPercent(0)).toBe(0);
    expect(progressPercent(0.5)).toBe(50);
    expect(progressPercent(1)).toBe(100);
    expect(progressPercent(1.7)).toBe(100);
  });

  it("is monotonic over [0, 1]", () => {
    let prev = progressPercent(0);
    for (let p = 0.05; p <= 1; p += 0.05) {
      const next = progressPercent(p);
      expect(next).toBeGreaterThanOrEqual(prev);
      prev = next;
    }
  });
});

describe("useGameStore eatProgress", () => {
  afterEach(() => {
    useGameStore.getState().setEatProgress(0);
  });

  it("round-trips through setEatProgress", () => {
    useGameStore.getState().setEatProgress(0.4);
    expect(useGameStore.getState().eatProgress).toBe(0.4);

    useGameStore.getState().setEatProgress(0);
    expect(useGameStore.getState().eatProgress).toBe(0);
  });
});
