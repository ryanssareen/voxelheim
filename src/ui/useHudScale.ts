"use client";

import { useEffect, useState } from "react";

/**
 * The HUD is drawn, not CSS-scaled: every SVG and slot gets a real pixel size
 * so the pixel-art stays crisp instead of turning into a stretched bitmap.
 * `hudMetrics` is the single place those sizes are decided, kept pure so the
 * "must fit the viewport" invariants are testable without a DOM.
 */

/** Viewport the base sizes are authored against. */
const DESIGN_W = 1280;
const DESIGN_H = 820;

export interface HudMetrics {
  /** Raw scale factor derived from the viewport. */
  scale: number;
  /** Health / hunger icon edge, px. */
  stat: number;
  /** Gap between individual health / hunger icons, px. */
  statGap: number;
  /** Gap between the health group and the hunger group, px. */
  barGap: number;
  /** Distance from the viewport bottom to the health / hunger row, px. */
  statBottom: number;
  crosshair: number;
  /** Hotbar slot height, px. Slots flex horizontally. */
  hotbarSlot: number;
  hotbarIcon: number;
  offhandSlot: number;
  offhandIcon: number;
  /** Total hotbar height including margins and top border, px. */
  hotbarHeight: number;
  countFont: number;
  slotNumFont: number;
  itemNameFont: number;
  panelFont: number;
  panelLabelFont: number;
  sunW: number;
  sunH: number;
  shardFont: number;
  /**
   * Displayed edge of the minimap, px. The canvas keeps its own fixed render
   * resolution; this only scales how large it is drawn, so a fixed 176px map
   * stops eating well over half a phone's width and colliding with the
   * shard counter.
   */
  minimapSize: number;
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** Total number of health + hunger icons laid out side by side. */
const STAT_ICON_COUNT = 20;

/** Hotbar cells: 9 numbered slots plus the offhand. */
const HOTBAR_CELLS = 10;

/** Authored minimap edge, px. Also the canvas's fixed render resolution. */
const MINIMAP_BASE = 176;

/**
 * Resolves every HUD pixel size for a viewport.
 *
 * Two independent caps apply: an overall scale from the viewport's smaller
 * dimension, and per-widget width budgets so the stat row and the hotbar can
 * never overflow or overlap on a narrow screen.
 */
export function hudMetrics(viewportW: number, viewportH: number): HudMetrics {
  const vw = Math.max(1, viewportW);
  const vh = Math.max(1, viewportH);
  // The floor can sit fairly high because the per-widget width budgets below
  // are what actually protect small screens; the floor only stops a mid-size
  // tablet from inheriting phone-sized chrome.
  const scale = clamp(Math.min(vw / DESIGN_W, vh / DESIGN_H), 0.75, 1.2);

  const statGap = scale >= 0.85 ? 3 : 2;
  const barGap = Math.round(clamp(28 * scale, 12, 40));
  // 20 icons plus their gaps plus the centre gap must sit inside the viewport.
  const statBudget = (vw * 0.96 - barGap) / STAT_ICON_COUNT - statGap;
  const stat = Math.max(10, Math.floor(Math.min(28 * scale, statBudget)));

  // Slots flex to fill the width, so cap the height by the cell width too —
  // otherwise slots turn into tall letterboxes on a phone.
  const cellWidth = vw / HOTBAR_CELLS - 4;
  const hotbarSlot = Math.round(
    clamp(Math.min(84 * scale, cellWidth * 1.15, vh * 0.16), 34, 96)
  );
  const hotbarIcon = Math.round(hotbarSlot * 0.84);
  const offhandSlot = Math.round(hotbarSlot * 0.88);
  const offhandIcon = Math.round(offhandSlot * 0.82);
  // slot height + 2px margin top/bottom + 3px top border
  const hotbarHeight = hotbarSlot + 7;

  const itemNameFont = Math.round(clamp(20 * scale, 12, 24));
  // Clear the hotbar and the item-name caption above it.
  const statBottom = hotbarHeight + itemNameFont + Math.round(14 * scale);

  return {
    scale,
    stat,
    statGap,
    barGap,
    statBottom,
    crosshair: Math.round(clamp(30 * scale, 18, 38)),
    hotbarSlot,
    hotbarIcon,
    offhandSlot,
    offhandIcon,
    hotbarHeight,
    countFont: Math.round(clamp(16 * scale, 10, 19)),
    slotNumFont: Math.round(clamp(14 * scale, 9, 17)),
    itemNameFont,
    panelFont: Math.round(clamp(15 * scale, 11, 18)),
    panelLabelFont: Math.round(clamp(12 * scale, 9, 14)),
    sunW: Math.round(clamp(52 * scale, 34, 62)),
    sunH: Math.round(clamp(29 * scale, 19, 34)),
    shardFont: Math.round(clamp(21 * scale, 13, 25)),
    // Never larger than authored, so desktop is untouched; on a narrow screen
    // the width budget is what shrinks it.
    minimapSize: Math.round(clamp(Math.min(MINIMAP_BASE, vw * 0.38), 88, MINIMAP_BASE)),
  };
}

/** Total width the health + hunger row occupies at these metrics, px. */
export function statRowWidth(m: HudMetrics): number {
  return STAT_ICON_COUNT * (m.stat + m.statGap) + m.barGap;
}

/** Live HUD metrics for the current viewport. */
export function useHudMetrics(): HudMetrics {
  const [metrics, setMetrics] = useState<HudMetrics>(() => hudMetrics(DESIGN_W, DESIGN_H));

  useEffect(() => {
    const compute = () => setMetrics(hudMetrics(window.innerWidth, window.innerHeight));
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, []);

  return metrics;
}
