import { describe, it, expect } from "vitest";
import { panelMetrics, panelWidth, gridWidth } from "@ui/usePanelMetrics";

/**
 * The inventory panel used a hardcoded 48px slot, so its 9-column grid needed
 * ~520px and a phone viewport simply clipped it — the right-hand slots and the
 * recipe book were unreachable. Slot size is now solved backwards from the
 * width budget, so these tests pin the invariant that made it break.
 */

/** Phones, tablets, laptops, and a deliberately absurd sliver. */
const VIEWPORTS: Array<[number, number]> = [
  [320, 568],
  [375, 812],
  [390, 844],
  [414, 896],
  [768, 1024],
  [1024, 768],
  [1280, 800],
  [1920, 1080],
  [240, 400],
];

describe("panelMetrics", () => {
  it("keeps the panel inside every viewport it is given", () => {
    for (const [vw, vh] of VIEWPORTS) {
      const m = panelMetrics(vw, vh);
      expect(panelWidth(m), `panel at ${vw}x${vh}`).toBeLessThanOrEqual(vw);
    }
  });

  it("keeps the panel inside the viewport height", () => {
    for (const [vw, vh] of VIEWPORTS) {
      const m = panelMetrics(vw, vh);
      expect(m.panelMaxHeight, `height at ${vw}x${vh}`).toBeLessThanOrEqual(vh);
      expect(m.panelMaxHeight).toBeGreaterThan(0);
    }
  });

  it("never shrinks a slot below a tappable floor", () => {
    for (const [vw, vh] of VIEWPORTS) {
      expect(panelMetrics(vw, vh).slot, `slot at ${vw}x${vh}`).toBeGreaterThanOrEqual(20);
    }
  });

  it("does not grow slots past the authored size on a big screen", () => {
    expect(panelMetrics(1920, 1080).slot).toBe(48);
    expect(panelMetrics(3840, 2160).slot).toBe(48);
  });

  it("shrinks the slot on a phone rather than overflowing", () => {
    const phone = panelMetrics(375, 812);
    const desktop = panelMetrics(1280, 800);
    expect(phone.slot).toBeLessThan(desktop.slot);
    expect(gridWidth(phone.slot)).toBeLessThan(375);
  });

  it("produces integral, positive sizes", () => {
    for (const [vw, vh] of VIEWPORTS) {
      const m = panelMetrics(vw, vh);
      for (const [key, value] of Object.entries(m)) {
        // scale is fractional by design; wrapTopRow is a layout decision.
        if (key === "scale" || typeof value !== "number") continue;
        expect(Number.isInteger(value), `${key} at ${vw}x${vh} = ${value}`).toBe(true);
        expect(value, `${key} at ${vw}x${vh}`).toBeGreaterThan(0);
      }
    }
  });

  it("grows monotonically with viewport width", () => {
    const widths = [320, 375, 414, 768, 1024, 1280];
    const slots = widths.map((w) => panelMetrics(w, 900).slot);
    for (let i = 1; i < slots.length; i++) {
      expect(slots[i], `slot at ${widths[i]}`).toBeGreaterThanOrEqual(slots[i - 1]);
    }
  });

  it("survives degenerate viewports without producing NaN", () => {
    for (const [vw, vh] of [[0, 0], [-100, -100], [1, 1]] as Array<[number, number]>) {
      const m = panelMetrics(vw, vh);
      expect(Number.isFinite(m.slot)).toBe(true);
      expect(m.slot).toBeGreaterThanOrEqual(20);
    }
  });

  it("only wraps the top row when it genuinely does not fit", () => {
    // Wrapping unconditionally made the desktop panel narrow and scrolling,
    // because the panel is only as wide as its widest row.
    expect(panelMetrics(1280, 800).wrapTopRow).toBe(false);
    expect(panelMetrics(1920, 1080).wrapTopRow).toBe(false);
    expect(panelMetrics(375, 812).wrapTopRow).toBe(true);
    expect(panelMetrics(320, 568).wrapTopRow).toBe(true);
  });

  it("keeps the recipe book narrow enough to sit on its own row on a phone", () => {
    const m = panelMetrics(375, 812);
    expect(m.recipeWidth).toBeLessThanOrEqual(gridWidth(m.slot));
  });
});
