import { describe, expect, it } from "vitest";
import {
  NO_INSETS,
  TOUCH_MIN_TARGET,
  makeViewportEnv,
  usableHeight,
  usableWidth,
} from "@ui/useViewportEnv";
import { panelMetrics } from "@ui/usePanelMetrics";
import { hudMetrics } from "@ui/useHudScale";
import { touchControlLayout } from "@ui/TouchControls";

const NOTCH = { top: 44, right: 34, bottom: 34, left: 0 };
/** iPhone-class landscape, the orientation the game is authored for. */
const PHONE_L = { w: 844, h: 390 };
const LAPTOP = { w: 1280, h: 800 };

describe("makeViewportEnv", () => {
  it("reports portrait when height exceeds width", () => {
    expect(makeViewportEnv(390, 844).portrait).toBe(true);
    expect(makeViewportEnv(844, 390).portrait).toBe(false);
  });

  it("defaults to pointer input and no insets", () => {
    const env = makeViewportEnv(LAPTOP.w, LAPTOP.h);
    expect(env.touch).toBe(false);
    expect(env.insets).toEqual(NO_INSETS);
  });

  it("removes insets from the usable box", () => {
    const env = makeViewportEnv(844, 390, { insets: NOTCH });
    expect(usableWidth(env)).toBe(844 - 34 - 0);
    expect(usableHeight(env)).toBe(390 - 44 - 34);
  });

  it("never reports a non-positive usable box", () => {
    const env = makeViewportEnv(10, 10, { insets: { top: 99, right: 99, bottom: 99, left: 99 } });
    expect(usableWidth(env)).toBeGreaterThan(0);
    expect(usableHeight(env)).toBeGreaterThan(0);
  });
});

describe("panelMetrics under touch", () => {
  it("never resolves a slot below the touch minimum in touch mode", () => {
    for (const [w, h] of [[844, 390], [667, 375], [568, 320], [1024, 768]]) {
      const env = makeViewportEnv(w, h, { touch: true });
      expect(panelMetrics(w, h, env).slot, `${w}x${h}`).toBeGreaterThanOrEqual(TOUCH_MIN_TARGET);
    }
  });

  it("flags when the grid could not fit at the touch minimum", () => {
    // Nine 44px slots plus gaps need roughly 460px of width. Below that the
    // panel scrolls rather than shrinking the targets back under a thumb.
    const env = makeViewportEnv(320, 568, { touch: true });
    const m = panelMetrics(320, 568, env);
    expect(m.belowTouchMinimum).toBe(true);
    expect(m.slot).toBe(TOUCH_MIN_TARGET);
  });

  it("does not flag when the grid fits comfortably", () => {
    const env = makeViewportEnv(1024, 768, { touch: true });
    expect(panelMetrics(1024, 768, env).belowTouchMinimum).toBe(false);
  });

  it("keeps the smaller pointer floor when touch is not driving", () => {
    // Same viewport, no finger: the slot is allowed to shrink, because a cursor
    // can hit a target a thumb cannot.
    const env = makeViewportEnv(320, 568, { touch: false });
    const m = panelMetrics(320, 568, env);
    expect(m.slot).toBeLessThan(TOUCH_MIN_TARGET);
    expect(m.belowTouchMinimum).toBe(false);
  });

  it("shrinks the width budget when a notch eats into it", () => {
    const plain = panelMetrics(PHONE_L.w, PHONE_L.h, makeViewportEnv(PHONE_L.w, PHONE_L.h));
    const inset = panelMetrics(
      PHONE_L.w,
      PHONE_L.h,
      makeViewportEnv(PHONE_L.w, PHONE_L.h, { insets: NOTCH })
    );
    expect(inset.slot).toBeLessThanOrEqual(plain.slot);
  });

  it("reserves vertical insets out of the panel's height", () => {
    const plain = panelMetrics(PHONE_L.w, PHONE_L.h, makeViewportEnv(PHONE_L.w, PHONE_L.h));
    const inset = panelMetrics(
      PHONE_L.w,
      PHONE_L.h,
      makeViewportEnv(PHONE_L.w, PHONE_L.h, { insets: NOTCH })
    );
    expect(plain.panelMaxHeight - inset.panelMaxHeight).toBe(NOTCH.top + NOTCH.bottom);
  });
});

describe("desktop is unchanged", () => {
  // The whole point of threading an env through rather than restructuring: a
  // pointer-driven viewport with no insets must produce exactly what it did
  // before this existed.
  it("panelMetrics matches the no-env call at desktop sizes", () => {
    for (const [w, h] of [[1280, 800], [1920, 1080], [3840, 2160]]) {
      expect(panelMetrics(w, h, makeViewportEnv(w, h)), `${w}x${h}`).toEqual(
        panelMetrics(w, h)
      );
    }
  });

  it("hudMetrics matches the no-env call at desktop sizes", () => {
    for (const [w, h] of [[1280, 800], [1920, 1080]]) {
      expect(hudMetrics(w, h, makeViewportEnv(w, h)), `${w}x${h}`).toEqual(hudMetrics(w, h));
    }
  });
});

describe("hudMetrics under insets", () => {
  it("lifts the stat row clear of the home indicator", () => {
    const plain = hudMetrics(PHONE_L.w, PHONE_L.h);
    const inset = hudMetrics(
      PHONE_L.w,
      PHONE_L.h,
      makeViewportEnv(PHONE_L.w, PHONE_L.h, { insets: NOTCH })
    );
    expect(inset.statBottom - plain.statBottom).toBe(NOTCH.bottom);
  });

  it("keeps every metric a positive finite number with insets applied", () => {
    const m = hudMetrics(PHONE_L.w, PHONE_L.h, makeViewportEnv(PHONE_L.w, PHONE_L.h, { insets: NOTCH }));
    for (const [key, value] of Object.entries(m)) {
      expect(Number.isFinite(value), key).toBe(true);
      expect(value, key).toBeGreaterThan(0);
    }
  });
});

describe("touch controls clear the safe area", () => {
  const m = hudMetrics(PHONE_L.w, PHONE_L.h);

  it("stacks the reach gap on top of the occluded strip", () => {
    const plain = touchControlLayout(PHONE_L.w, PHONE_L.h, m);
    const inset = touchControlLayout(PHONE_L.w, PHONE_L.h, m, NOTCH);

    // A notch does not make a thumb reach further, so both apply.
    expect(inset.edgeRight).toBe(plain.inset + NOTCH.right);
    expect(inset.edgeLeft).toBe(plain.inset + NOTCH.left);
    expect(inset.edgeTop).toBe(plain.inset + NOTCH.top);
    expect(inset.actionBottom).toBe(plain.actionBottom + NOTCH.bottom);
    expect(inset.iconTop).toBe(plain.iconTop + NOTCH.top);
  });

  it("leaves edges equal to the reach gap when nothing is occluded", () => {
    const l = touchControlLayout(PHONE_L.w, PHONE_L.h, m, NO_INSETS);
    expect(l.edgeLeft).toBe(l.inset);
    expect(l.edgeRight).toBe(l.inset);
    expect(l.edgeTop).toBe(l.inset);
  });

  it("keeps the action stack on screen with insets applied", () => {
    const l = touchControlLayout(PHONE_L.w, PHONE_L.h, m, NOTCH);
    const stackHeight = 2 * l.actionButton + l.actionGap;
    expect(l.actionBottom + stackHeight).toBeLessThan(PHONE_L.h);
    expect(l.edgeRight + l.actionButton).toBeLessThan(PHONE_L.w);
  });
});
