"use client";

import { useEffect, useState } from "react";
import { useGameStore } from "@store/useGameStore";

/**
 * The viewport facts every sizing decision depends on, in one place.
 *
 * Three of them cannot be read from `window.innerWidth/Height`, which is what
 * the metric modules used before:
 *
 *  - **The visual viewport.** A soft keyboard, and browser chrome collapsing
 *    under a scroll, shrink `visualViewport` while `window.innerHeight` stays
 *    put. Sizing chat against the window puts it under the keyboard.
 *  - **Safe-area insets.** `env(safe-area-inset-*)` exists only in CSS, so it is
 *    read back off a probe element. It resolves to 0 without `viewport-fit=cover`
 *    in the viewport meta, which the app sets.
 *  - **Whether a finger is driving.** A touch target has a minimum size a mouse
 *    target does not.
 */

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export const NO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

export interface ViewportEnv {
  width: number;
  height: number;
  insets: Insets;
  /** A finger is driving, so targets have a floor a mouse does not impose. */
  touch: boolean;
  portrait: boolean;
}

/**
 * Smallest comfortable touch target, px. iOS Human Interface Guidelines say 44
 * and Android Material says 48dp; 44 is the lower of the two and the one a
 * 9-column grid can actually satisfy on a phone in landscape.
 */
export const TOUCH_MIN_TARGET = 44;

/** Space a viewport has left for content once its insets are removed. */
export function usableWidth(env: ViewportEnv): number {
  return Math.max(1, env.width - env.insets.left - env.insets.right);
}

export function usableHeight(env: ViewportEnv): number {
  return Math.max(1, env.height - env.insets.top - env.insets.bottom);
}

/** Builds an env from raw numbers. Pure, so metric tests need no DOM. */
export function makeViewportEnv(
  width: number,
  height: number,
  opts: { insets?: Insets; touch?: boolean } = {}
): ViewportEnv {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  return {
    width: w,
    height: h,
    insets: opts.insets ?? NO_INSETS,
    touch: opts.touch ?? false,
    portrait: h > w,
  };
}

const PROBE_ID = "__safe-area-probe";

/**
 * Reads the resolved safe-area insets by letting CSS compute them onto a probe
 * and reading the result back. There is no JS API for `env()`.
 */
function readInsets(): Insets {
  if (typeof document === "undefined") return NO_INSETS;

  let probe = document.getElementById(PROBE_ID);
  if (!probe) {
    probe = document.createElement("div");
    probe.id = PROBE_ID;
    probe.style.cssText =
      "position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;pointer-events:none;" +
      "padding-top:env(safe-area-inset-top);padding-right:env(safe-area-inset-right);" +
      "padding-bottom:env(safe-area-inset-bottom);padding-left:env(safe-area-inset-left)";
    document.body.appendChild(probe);
  }

  const cs = getComputedStyle(probe);
  const px = (v: string) => {
    const n = Number.parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  };
  return {
    top: px(cs.paddingTop),
    right: px(cs.paddingRight),
    bottom: px(cs.paddingBottom),
    left: px(cs.paddingLeft),
  };
}

/** Live viewport env. */
export function useViewportEnv(): ViewportEnv {
  const touch = useGameStore((s) => s.inputSource === "touch");
  const [box, setBox] = useState<{ width: number; height: number; insets: Insets }>(() => ({
    width: 1280,
    height: 820,
    insets: NO_INSETS,
  }));

  useEffect(() => {
    const compute = () => {
      const vv = window.visualViewport;
      setBox({
        // The visual viewport is the box actually visible to the player. It is
        // the window minus the soft keyboard and any browser chrome currently
        // overlapping, which is exactly what content must fit inside.
        width: Math.round(vv?.width ?? window.innerWidth),
        height: Math.round(vv?.height ?? window.innerHeight),
        insets: readInsets(),
      });
    };
    compute();

    window.addEventListener("resize", compute);
    window.addEventListener("orientationchange", compute);
    window.visualViewport?.addEventListener("resize", compute);
    window.visualViewport?.addEventListener("scroll", compute);
    return () => {
      window.removeEventListener("resize", compute);
      window.removeEventListener("orientationchange", compute);
      window.visualViewport?.removeEventListener("resize", compute);
      window.visualViewport?.removeEventListener("scroll", compute);
    };
  }, []);

  return makeViewportEnv(box.width, box.height, { insets: box.insets, touch });
}
