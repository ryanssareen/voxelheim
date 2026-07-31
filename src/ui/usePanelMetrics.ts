"use client";

import { useEffect, useState } from "react";

/**
 * Sizing for the full-screen panels (inventory, crafting table). Their binding
 * constraint is the 9-column slot grid: at a fixed 48px slot it needs ~520px,
 * so on a phone the panel was simply clipped by the viewport with no way to
 * reach the hidden slots.
 *
 * Kept pure, like `hudMetrics`, so the "must fit the viewport" invariant is
 * testable without a DOM.
 */

const DESIGN_W = 1280;
const DESIGN_H = 820;

/** The inventory and hotbar rows are always 9 wide. */
const GRID_COLS = 9;
/** Tailwind `gap-1`. */
const GRID_GAP = 4;
/** 4px panel border on each side. */
const BORDER = 8;
/** Fraction of the viewport the panel may occupy. */
const WIDTH_BUDGET = 0.98;

export interface PanelMetrics {
  scale: number;
  /** Slot edge for the inventory / hotbar grids, px. */
  slot: number;
  /** Slightly larger slot for a craft result, px. */
  resultSlot: number;
  /** Panel padding, px. */
  pad: number;
  /** Gap between the panel's stacked sections, px. */
  sectionGap: number;
  /** Preferred recipe-book width, px. It flexes and may wrap to its own row. */
  recipeWidth: number;
  /** Max height for the recipe list before it scrolls, px. */
  recipeMaxHeight: number;
  /** Max height for the whole panel before it scrolls, px. */
  panelMaxHeight: number;
  /**
   * Whether the recipe book must drop to its own row.
   *
   * Wrapping unconditionally is wrong: the panel is only as wide as its widest
   * row, so on a desktop the top row would wrap against the 9-column grid's
   * width instead of letting the panel grow, turning a wide panel into a narrow
   * scrolling one.
   */
  wrapTopRow: boolean;
  labelFont: number;
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** Width the 9-column grid occupies at a given slot size, px. */
export function gridWidth(slot: number): number {
  return GRID_COLS * slot + (GRID_COLS - 1) * GRID_GAP;
}

/** Total panel width implied by these metrics, px. */
export function panelWidth(m: PanelMetrics): number {
  return gridWidth(m.slot) + 2 * m.pad + BORDER;
}

/**
 * Resolves panel sizes for a viewport.
 *
 * The slot size is solved backwards from the width the 9-column grid is allowed
 * to occupy, so the panel fits by construction rather than by hoping the design
 * size is small enough.
 */
export function panelMetrics(viewportW: number, viewportH: number): PanelMetrics {
  const vw = Math.max(1, viewportW);
  const vh = Math.max(1, viewportH);
  const scale = clamp(Math.min(vw / DESIGN_W, vh / DESIGN_H), 0.4, 1);

  const pad = Math.round(clamp(24 * scale, 8, 24));
  const available = vw * WIDTH_BUDGET - 2 * pad - BORDER - (GRID_COLS - 1) * GRID_GAP;
  // Floor of 20 keeps a slot tappable; below that the panel scrolls instead.
  const slot = Math.max(20, Math.floor(Math.min(48, available / GRID_COLS)));

  const resultSlot = Math.round(slot * 1.08);
  const recipeWidth = Math.round(clamp(260 * scale, 190, 260));

  // Armour column + crafting cluster (2 slots, arrow, result) + recipe book,
  // with the two gaps between them.
  const topRowNeeded =
    slot + 24 + (2 * slot + GRID_GAP + 30 + resultSlot) + 24 + recipeWidth;
  const contentBudget = vw * WIDTH_BUDGET - 2 * pad - BORDER;

  return {
    scale,
    slot,
    resultSlot,
    pad,
    sectionGap: Math.round(clamp(12 * scale, 6, 12)),
    recipeWidth,
    recipeMaxHeight: Math.round(clamp(vh * 0.3, 130, 240)),
    panelMaxHeight: Math.round(vh - 16),
    wrapTopRow: topRowNeeded > contentBudget,
    labelFont: Math.round(clamp(11 * scale, 9, 11)),
  };
}

/** Live panel metrics for the current viewport. */
export function usePanelMetrics(): PanelMetrics {
  const [metrics, setMetrics] = useState<PanelMetrics>(() =>
    panelMetrics(DESIGN_W, DESIGN_H)
  );

  useEffect(() => {
    const compute = () => setMetrics(panelMetrics(window.innerWidth, window.innerHeight));
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, []);

  return metrics;
}
