"use client";

import {
  NO_INSETS,
  TOUCH_MIN_TARGET,
  makeViewportEnv,
  useViewportEnv,
  usableWidth,
  type Insets,
  type ViewportEnv,
} from "@ui/useViewportEnv";

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
/**
 * Floor for a mouse-driven slot. Below this the panel scrolls rather than
 * shrinking further — a cursor can hit a small target, so the only cost is
 * legibility.
 */
const MIN_SLOT_POINTER = 20;

export interface PanelMetrics {
  scale: number;
  /**
   * True when the grid could not reach the touch minimum and the panel scrolls
   * to compensate. Purely informational; the layout already handles it.
   */
  belowTouchMinimum: boolean;
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
export function panelMetrics(
  viewportW: number,
  viewportH: number,
  env?: ViewportEnv
): PanelMetrics {
  const e = env ?? makeViewportEnv(viewportW, viewportH);
  const insets: Insets = e.insets ?? NO_INSETS;
  const vw = Math.max(1, viewportW);
  const vh = Math.max(1, viewportH);
  const scale = clamp(Math.min(vw / DESIGN_W, vh / DESIGN_H), 0.4, 1);

  const pad = Math.round(clamp(24 * scale, 8, 24));
  // Insets are removed from the width budget rather than applied as padding on
  // the panel: the grid has to fit the space the notch leaves, not overflow it
  // and then get pushed.
  const widthBudget = usableWidth({ ...e, width: vw }) * WIDTH_BUDGET;
  const available = widthBudget - 2 * pad - BORDER - (GRID_COLS - 1) * GRID_GAP;

  // A finger needs a bigger target than a cursor. Raising the floor can push
  // the grid wider than the viewport, which is why the panel scrolls.
  const floor = e.touch ? TOUCH_MIN_TARGET : MIN_SLOT_POINTER;
  const fitted = Math.floor(Math.min(48, available / GRID_COLS));
  const slot = Math.max(floor, fitted);

  const resultSlot = Math.round(slot * 1.08);
  const recipeWidth = Math.round(clamp(260 * scale, 190, 260));

  // Armour column + crafting cluster (2 slots, arrow, result) + recipe book,
  // with the two gaps between them.
  const topRowNeeded =
    slot + 24 + (2 * slot + GRID_GAP + 30 + resultSlot) + 24 + recipeWidth;
  const contentBudget = widthBudget - 2 * pad - BORDER;

  return {
    scale,
    belowTouchMinimum: e.touch && fitted < TOUCH_MIN_TARGET,
    slot,
    resultSlot,
    pad,
    sectionGap: Math.round(clamp(12 * scale, 6, 12)),
    recipeWidth,
    recipeMaxHeight: Math.round(clamp(vh * 0.3, 130, 240)),
    panelMaxHeight: Math.round(vh - insets.top - insets.bottom - 16),
    wrapTopRow: topRowNeeded > contentBudget,
    labelFont: Math.round(clamp(11 * scale, 9, 11)),
  };
}

/** Live panel metrics for the current viewport. */
export function usePanelMetrics(): PanelMetrics {
  const env = useViewportEnv();
  return panelMetrics(env.width, env.height, env);
}
