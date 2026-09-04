"use client";

/**
 * Deliberately keeps the existing vector look — rounded rects, paths, smooth
 * shapes — and only adds detail:
 *
 *  - tools gain a binding band where the head meets the handle, a darker
 *    bottom edge, and wood grain on the shaft
 *  - armour keeps its silhouettes but gains pauldrons, a belt, knee detail and
 *    soles so chest/legs/boots differ at 44px
 *  - blocks are isometric cubes with per-face structure rather than one tinted
 *    square, so a crafting table no longer reads as dirt; ingots and gems are
 *    drawn as items, not cubes
 *  - food is redrawn as a faceted raw cut with a bone (the old smooth blob with
 *    a rim highlight read as candy)
 *  - slots gain a hover state and a name/stat tooltip
 *
 * The worn helmet is not rendered on the player model (the head stays bare, so
 * the face reads at every camera distance), but helmets are still craftable and
 * still grant damage reduction — so they keep an inventory icon here.
 */

import { useEffect, useState, type ReactNode } from "react";
import { BLOCK_ID } from "@data/blocks";
import {
  ITEM_COLORS,
  ITEM_NAMES,
  getToolDef,
  getArmorDef,
  type ToolType,
  type ArmorSlot,
} from "@data/items";

const RAW_FOOD_IDS: number[] = [BLOCK_ID.RAW_PORK, BLOCK_ID.RAW_BEEF, BLOCK_ID.RAW_MUTTON];
const COOKED_FOOD_IDS: number[] = [
  BLOCK_ID.COOKED_PORK,
  BLOCK_ID.COOKED_BEEF,
  BLOCK_ID.COOKED_MUTTON,
];
const FOOD_IDS: Set<number> = new Set([...RAW_FOOD_IDS, ...COOKED_FOOD_IDS]);

// ────────────── colour helpers ──────────────

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)];
}

function mix(hex: string, toward: string, t: number): string {
  const a = hexToRgb(hex);
  const b = hexToRgb(toward);
  const c = (i: number) =>
    Math.max(0, Math.min(255, Math.round(a[i] + (b[i] - a[i]) * t)))
      .toString(16)
      .padStart(2, "0");
  return `#${c(0)}${c(1)}${c(2)}`;
}

const lighten = (hex: string, t = 0.3) => mix(hex, "#ffffff", t);
const darken = (hex: string, t = 0.3) => mix(hex, "#000000", t);

// ────────────── tools ──────────────

function ToolSVG({ toolType, color, size }: { toolType: ToolType; color: string; size: number }) {
  const s = size * 0.72;
  const edge = lighten(color, 0.4);
  const shade = darken(color, 0.32);
  const handle = "#8B6914";
  const handleLight = "#a9852a";
  const handleDark = "#5e470d";
  const band = "#4a4a4a";

  // Shared shaft: grain highlight + darker right edge + a binding band.
  const shaft = (x: number, y: number, h: number, bandY: number) => (
    <>
      <rect x={x} y={y} width="2" height={h} fill={handle} rx="0.5" />
      <rect x={x} y={y} width="0.7" height={h} fill={handleLight} rx="0.3" />
      <rect x={x + 1.4} y={y} width="0.6" height={h} fill={handleDark} rx="0.3" />
      <rect x={x - 0.4} y={bandY} width="2.8" height="1.2" fill={band} rx="0.4" />
    </>
  );

  if (toolType === "pickaxe") {
    return (
      <svg width={s} height={s} viewBox="0 0 16 16">
        {shaft(7, 5, 10, 6.2)}
        <rect x="2" y="1" width="12" height="3" fill={color} rx="0.6" />
        <rect x="3" y="1.6" width="10" height="1" fill={edge} rx="0.4" />
        <rect x="2.4" y="3.2" width="11.2" height="0.9" fill={shade} rx="0.4" />
        <path d="M2 4 L4 4 L3.6 6.4 L2.2 6.2 Z" fill="#3a3a3a" />
        <path d="M14 4 L12 4 L12.4 6.4 L13.8 6.2 Z" fill="#3a3a3a" />
      </svg>
    );
  }
  if (toolType === "axe") {
    return (
      <svg width={s} height={s} viewBox="0 0 16 16">
        {shaft(8, 2, 13, 6.6)}
        <path
          d="M8 1.8 L8 8.6 L4.6 8.6 C3 7.8 2.4 6.2 2.4 4.6 C2.4 3.2 3.2 2.2 4.4 1.8 Z"
          fill={color}
        />
        <path d="M4.6 2.6 L7.8 2.6" stroke={edge} strokeWidth="1.1" strokeLinecap="round" />
        <path
          d="M3.3 4.5 C3.3 5.9 3.8 7 4.9 7.8"
          stroke={edge}
          strokeWidth="1"
          fill="none"
          strokeLinecap="round"
        />
        <path d="M4.9 7.9 L7.8 7.9" stroke={shade} strokeWidth="1" strokeLinecap="round" />
      </svg>
    );
  }
  if (toolType === "shovel") {
    return (
      <svg width={s} height={s} viewBox="0 0 16 16">
        {shaft(7, 5, 10, 6.2)}
        <path
          d="M5 2 C5 1.2 5.6 1 8 1 C10.4 1 11 1.2 11 2 L11 4.2 C11 5.4 9.8 6.2 8 6.2 C6.2 6.2 5 5.4 5 4.2 Z"
          fill={color}
        />
        <path
          d="M6 1.9 C6 1.5 6.8 1.4 8 1.4 C9.2 1.4 10 1.5 10 1.9 L10 3.4"
          stroke={edge}
          strokeWidth="1"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d="M5.4 4.6 C6 5.6 7 6 8 6 C9 6 10 5.6 10.6 4.6"
          stroke={shade}
          strokeWidth="1.1"
          fill="none"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  // sword
  return (
    <svg width={s} height={s} viewBox="0 0 16 16">
      <rect x="7" y="10.6" width="2" height="4.2" fill={handle} rx="0.5" />
      <rect x="7" y="10.6" width="0.7" height="4.2" fill={handleLight} rx="0.3" />
      <rect x="6.2" y="14.2" width="3.6" height="1.3" fill={band} rx="0.5" />
      <rect x="4" y="9" width="8" height="2" fill={band} rx="0.6" />
      <rect x="4.4" y="9.3" width="7.2" height="0.7" fill="#6a6a6a" rx="0.3" />
      <path d="M6 9.4 L6 2.4 L8 0.8 L10 2.4 L10 9.4 Z" fill={color} />
      <path d="M7.6 8.8 L7.6 2.8 L8 2.3 L8.4 2.8 L8.4 8.8 Z" fill={edge} />
      <path d="M10 9.4 L10 2.4 L8.9 1.5 L9.3 2.9 L9.3 9.4 Z" fill={shade} />
    </svg>
  );
}

function StickSVG({ size }: { size: number }) {
  const s = size * 0.62;
  return (
    <svg width={s} height={s} viewBox="0 0 16 16">
      <rect x="6" y="1" width="3" height="14" rx="1.2" fill="#b8945a" />
      <rect x="6.6" y="2" width="0.9" height="11.5" fill="#d3b47c" rx="0.4" />
      <rect x="8.1" y="2" width="0.7" height="11.5" fill="#8f6f39" rx="0.3" />
      <rect x="6.4" y="5.4" width="2.2" height="0.7" fill="#8f6f39" rx="0.3" />
      <rect x="6.4" y="9.8" width="2.2" height="0.7" fill="#8f6f39" rx="0.3" />
    </svg>
  );
}

// ────────────── food ──────────────

/**
 * A raw cut: faceted asymmetric outline with a bone wedge. Deliberately no
 * glossy rim arc and no radial symmetry — those are what made it read as a
 * boiled sweet. Cooked loses the bone and gains char.
 */
function FoodSVG({ blockId, size }: { blockId: number; size: number }) {
  const s = size * 0.72;
  const cooked = COOKED_FOOD_IDS.includes(blockId);
  const base = ITEM_COLORS[blockId] ?? "#c45050";
  const facet = lighten(base, cooked ? 0.16 : 0.2);
  const grain = darken(base, cooked ? 0.42 : 0.34);
  const rim = darken(base, 0.5);
  const bone = "#efe6d2";

  return (
    <svg width={s} height={s} viewBox="0 0 16 16">
      <path
        d="M4.6 5.4 L7.2 3.3 L10.8 3.7 L12.6 6.5 L12 9.7 L9.5 11.9 L6.3 11.4 L4.1 8.9 Z"
        fill={base}
      />
      {/* flat top facet, not a highlight sweep */}
      <path d="M7.4 4.5 L10.4 4.8 L11.5 6.5 L8 5.9 L6.3 5.6 Z" fill={facet} />
      <path d="M6.1 8.1 L9.6 7.5" stroke={grain} strokeWidth="0.9" strokeLinecap="square" />
      <path d="M6.7 9.9 L10.3 9.1" stroke={grain} strokeWidth="0.9" strokeLinecap="square" />
      {/* bottom-right shadow facet */}
      <path d="M12 9.7 L9.5 11.9 L6.3 11.4 L11.4 10.6 Z" fill={rim} />
      {cooked ? (
        <>
          <rect x="5.6" y="5.2" width="1.2" height="1.2" fill={grain} />
          <rect x="9.8" y="7.9" width="1.1" height="1.1" fill={grain} />
          <rect x="7.9" y="10.2" width="1" height="1" fill={grain} />
        </>
      ) : (
        <>
          <path d="M4.1 8.9 L6.3 11.4 L5.1 12.6 L3 10.1 Z" fill={bone} />
          <path d="M3 10.1 L5.1 12.6 L4.4 12.9 L2.6 10.6 Z" fill="#cfc4ac" />
        </>
      )}
    </svg>
  );
}

// ────────────── armour ──────────────

// Original tier colours pushed bluer and kept light, matching the F5 plates.
const ARMOR_ICON_COLORS: Record<number, string> = {
  [BLOCK_ID.IRON_HELMET]: "#ccd2dc",
  [BLOCK_ID.IRON_CHESTPLATE]: "#ccd2dc",
  [BLOCK_ID.IRON_LEGGINGS]: "#ccd2dc",
  [BLOCK_ID.IRON_BOOTS]: "#ccd2dc",
  [BLOCK_ID.DIAMOND_HELMET]: "#66d2f2",
  [BLOCK_ID.DIAMOND_CHESTPLATE]: "#66d2f2",
  [BLOCK_ID.DIAMOND_LEGGINGS]: "#66d2f2",
  [BLOCK_ID.DIAMOND_BOOTS]: "#66d2f2",
};

function ArmorSVG({ slot, color, size }: { slot: ArmorSlot; color: string; size: number }) {
  const s = size * 0.76;
  const edge = lighten(color, 0.42);
  const mid = color;
  const shade = darken(color, 0.3);
  const deep = darken(color, 0.55);

  if (slot === "helmet") {
    // Not worn on the model, but craftable and armour-bearing, so it needs an
    // icon. Same one-direction light as the plates: highlight left, shade right.
    return (
      <svg width={s} height={s} viewBox="0 0 16 16">
        <path d="M3 9 C3 5 5.2 2.6 8 2.6 C10.8 2.6 13 5 13 9 L13 10.6 L3 10.6 Z" fill={mid} />
        <path
          d="M4.5 9 C4.5 6 5.9 4.2 7.3 3.8"
          fill="none"
          stroke={edge}
          strokeWidth="1.1"
          strokeLinecap="round"
        />
        <path d="M11.6 9 L11.6 10.2" stroke={shade} strokeWidth="1.2" strokeLinecap="round" />
        {/* crest ridge */}
        <rect x="7.5" y="2.8" width="1" height="4.6" rx="0.3" fill={edge} />
        {/* visor slit */}
        <rect x="3.8" y="7.9" width="8.4" height="1.5" rx="0.3" fill={deep} />
        <rect x="3.8" y="8.1" width="8.4" height="0.5" rx="0.2" fill={shade} />
        {/* neck guard */}
        <rect x="2.8" y="10.2" width="10.4" height="1.7" rx="0.3" fill={deep} />
        <rect x="3" y="10.4" width="10" height="0.5" rx="0.2" fill={shade} />
      </svg>
    );
  }

  if (slot === "chestplate") {
    return (
      <svg width={s} height={s} viewBox="0 0 16 16">
        {/* pauldrons */}
        <rect x="1" y="3.4" width="3.6" height="3" rx="1.2" fill={shade} />
        <rect x="11.4" y="3.4" width="3.6" height="3" rx="1.2" fill={shade} />
        <rect x="1.4" y="3.8" width="2.6" height="0.9" rx="0.4" fill={edge} />
        {/* torso */}
        <path d="M4 3.4 L6.2 3.4 L8 5.4 L9.8 3.4 L12 3.4 L12 12.6 L4 12.6 Z" fill={mid} />
        <path d="M4.4 4 L4.4 11.8" stroke={edge} strokeWidth="1.2" strokeLinecap="round" />
        <path d="M11.6 4 L11.6 11.8" stroke={shade} strokeWidth="1.2" strokeLinecap="round" />
        {/* collar + centre seam + belt */}
        <path
          d="M6.2 3.6 L8 5.6 L9.8 3.6"
          fill="none"
          stroke={edge}
          strokeWidth="1"
          strokeLinejoin="round"
        />
        <rect x="7.5" y="5.8" width="1" height="5.2" fill={shade} rx="0.3" />
        <rect x="4" y="11" width="8" height="1.6" fill={deep} rx="0.3" />
        <rect x="4" y="11.2" width="8" height="0.5" fill={shade} rx="0.2" />
      </svg>
    );
  }
  if (slot === "leggings") {
    return (
      <svg width={s} height={s} viewBox="0 0 16 16">
        {/* waistband */}
        <rect x="3.2" y="2" width="9.6" height="2.6" rx="0.5" fill={mid} />
        <rect x="3.2" y="2" width="9.6" height="0.9" rx="0.4" fill={edge} />
        <rect x="3.2" y="4" width="9.6" height="0.7" rx="0.3" fill={deep} />
        {/* legs */}
        <rect x="3.4" y="4.6" width="3.6" height="9.4" rx="0.5" fill={mid} />
        <rect x="9" y="4.6" width="3.6" height="9.4" rx="0.5" fill={mid} />
        <rect x="3.7" y="5" width="0.9" height="8.6" rx="0.3" fill={edge} />
        <rect x="11.7" y="5" width="0.7" height="8.6" rx="0.3" fill={shade} />
      </svg>
    );
  }
  // boots
  return (
    <svg width={s} height={s} viewBox="0 0 16 16">
      {/* cuffs */}
      <rect x="2.6" y="4" width="4.2" height="1.8" rx="0.5" fill={deep} />
      <rect x="9.2" y="4" width="4.2" height="1.8" rx="0.5" fill={deep} />
      {/* shafts */}
      <rect x="3" y="5.4" width="3.4" height="4.8" rx="0.4" fill={mid} />
      <rect x="9.6" y="5.4" width="3.4" height="4.8" rx="0.4" fill={mid} />
      <rect x="3.3" y="5.8" width="0.9" height="4.1" rx="0.3" fill={edge} />
      <rect x="9.9" y="5.8" width="0.9" height="4.1" rx="0.3" fill={edge} />
      {/* feet */}
      <path d="M2.2 10.2 L6.4 10.2 L6.4 12.6 L2.2 12.6 Z" fill={mid} />
      <path d="M9.6 10.2 L13.8 10.2 L13.8 12.6 L9.6 12.6 Z" fill={mid} />
      {/* soles */}
      <rect x="2" y="12.4" width="4.6" height="1.3" rx="0.4" fill={deep} />
      <rect x="9.4" y="12.4" width="4.6" height="1.3" rx="0.4" fill={deep} />
    </svg>
  );
}

// ────────────── ingots & gems ──────────────

/** Smelted bar — an item, not a cube, so it must not read as a block. */
function IngotSVG({ color, size }: { color: string; size: number }) {
  const s = size * 0.72;
  const top = lighten(color, 0.25);
  const face = darken(color, 0.22);
  const shade = darken(color, 0.45);
  const rim = darken(color, 0.66);
  return (
    <svg width={s} height={s} viewBox="0 0 16 16">
      <path d="M4.6 5 L11.4 5 L13.2 7.6 L2.8 7.6 Z" fill={top} />
      <path d="M2.8 7.6 L13.2 7.6 L13.7 11.6 L2.3 11.6 Z" fill={face} />
      <path d="M2.3 11.6 L13.7 11.6 L13.7 12.3 L2.3 12.3 Z" fill={rim} />
      <path d="M5.4 5.6 L10.4 5.6 L11.2 7 L4.4 7 Z" fill={lighten(color, 0.55)} opacity="0.7" />
      <path d="M10.6 7.6 L13.2 7.6 L13.7 11.6 L11 11.6 Z" fill={shade} />
      <rect x="4" y="9" width="4.4" height="0.7" rx="0.3" fill={shade} opacity="0.7" />
    </svg>
  );
}

/** Cut gem — octagonal brilliant with a table facet. */
function GemSVG({ color, size }: { color: string; size: number }) {
  const s = size * 0.72;
  const table = lighten(color, 0.55);
  const crown = lighten(color, 0.2);
  const pav = darken(color, 0.28);
  const deep = darken(color, 0.5);
  return (
    <svg width={s} height={s} viewBox="0 0 16 16">
      <path d="M5.2 2.6 L10.8 2.6 L14 6.4 L8 14 L2 6.4 Z" fill={color} />
      <path d="M5.2 2.6 L10.8 2.6 L12.2 4.6 L3.8 4.6 Z" fill={table} />
      <path d="M3.8 4.6 L12.2 4.6 L14 6.4 L2 6.4 Z" fill={crown} />
      <path d="M2 6.4 L8 14 L5 6.4 Z" fill={pav} />
      <path d="M14 6.4 L8 14 L11 6.4 Z" fill={deep} />
      <rect x="5.9" y="3.1" width="2.6" height="0.8" rx="0.4" fill="#ffffff" opacity="0.85" />
      <rect x="9.4" y="7.4" width="0.8" height="0.8" rx="0.4" fill="#ffffff" opacity="0.6" />
    </svg>
  );
}

// ────────────── blocks ──────────────

/**
 * Every block used to be the same bevelled square tinted by ITEM_COLORS, so a
 * crafting table was indistinguishable from dirt. Blocks are now drawn as
 * isometric cubes with real per-face structure: a grid top and tool markings
 * for the workbench, an arched opening for the furnace, board seams for planks,
 * bark and end-grain for logs, mineral blobs on a stone base for ores, and so
 * on. Structurally flat blocks fall back to a tinted, gritted cube.
 *
 * Faces are painted in a plain 16x16 space and projected onto the cube by a
 * fixed matrix, so a painter never has to think in isometric coordinates. A
 * single shading pass per face supplies the light direction, which keeps the
 * painters to pure local detail.
 */
const FACE_TOP = "matrix(0.8125,-0.46875,0.8125,0.46875,3,10.5)";
const FACE_LEFT = "matrix(0.8125,0.46875,0,0.75,3,10.5)";
const FACE_RIGHT = "matrix(0.8125,-0.46875,0,0.75,16,18)";

/** Deterministic PRNG so a block's grain is stable across renders. */
function rand(seed: number): () => number {
  let h = ((seed + 1) * 2654435761) >>> 0;
  return () => {
    h = (h ^ (h << 13)) >>> 0;
    h = (h ^ (h >>> 17)) >>> 0;
    h = (h ^ (h << 5)) >>> 0;
    return h / 4294967296;
  };
}

/** Deterministic specks so dirt, stone and sand differ by more than hue. */
function grit(
  seed: number,
  color: string,
  count: number,
  min: number,
  max: number,
  opacity = 0.55
): ReactNode[] {
  const r = rand(seed);
  const dark = darken(color, 0.26);
  const light = lighten(color, 0.26);
  const out: ReactNode[] = [];
  for (let i = 0; i < count; i++) {
    const x = r() * (16 - max);
    const y = r() * (16 - max);
    const w = min + r() * (max - min);
    const h = min + r() * (max - min);
    out.push(
      <rect
        key={i}
        x={x.toFixed(2)}
        y={y.toFixed(2)}
        width={w.toFixed(2)}
        height={h.toFixed(2)}
        rx="0.25"
        fill={i % 2 === 0 ? dark : light}
        opacity={opacity}
      />
    );
  }
  return out;
}

const flat = (color: string) => <rect x="0" y="0" width="16" height="16" fill={color} />;

/** Horizontal boards with seams, staggered butt joints and grain ticks. */
function planksFace(base: string): ReactNode {
  const seam = darken(base, 0.5);
  const grain = darken(base, 0.22);
  const hi = lighten(base, 0.2);
  const butt = [6.5, 11, 4, 9.5];
  return (
    <>
      {flat(base)}
      {[0, 4, 8, 12].map((y, i) => (
        <g key={y}>
          <rect x="0" y={y} width="16" height="3.6" fill={i % 2 === 1 ? darken(base, 0.08) : base} />
          <rect x="0" y={y + 0.4} width="16" height="0.6" fill={hi} opacity="0.55" />
          <rect x={butt[i]} y={y} width="0.7" height="3.6" fill={seam} />
          <rect x="1.4" y={y + 2.2} width="4.6" height="0.45" fill={grain} opacity="0.6" />
          <rect x="8.8" y={y + 1.5} width="4.2" height="0.45" fill={grain} opacity="0.5" />
          <rect x="0" y={y + 3.6} width="16" height="0.55" fill={seam} />
        </g>
      ))}
    </>
  );
}

/** Irregular cobbles separated by dark mortar. */
function stoneFace(base: string): ReactNode {
  const mortar = darken(base, 0.42);
  const cobbles: Array<[number, number, number, number, string]> = [
    [0.5, 0.6, 6.6, 4.8, lighten(base, 0.14)],
    [8, 0.5, 7.2, 4.3, darken(base, 0.1)],
    [0.7, 6.2, 4.8, 4.4, darken(base, 0.16)],
    [6.4, 5.8, 8.8, 5, lighten(base, 0.07)],
    [0.9, 11.5, 7, 3.9, lighten(base, 0.18)],
    [8.8, 11.7, 6.4, 3.7, darken(base, 0.13)],
  ];
  return (
    <>
      {flat(mortar)}
      {cobbles.map(([x, y, w, h, c], i) => (
        <rect key={i} x={x} y={y} width={w} height={h} rx="1.3" fill={c} />
      ))}
      {grit(3, base, 7, 0.7, 1.6, 0.4)}
    </>
  );
}

/** Stone with mineral inclusions — the shared shape of every ore block. */
function oreFace(mineral: string, seed: number): ReactNode {
  const hi = lighten(mineral, 0.45);
  const r = rand(seed);
  const blobs: ReactNode[] = [];
  for (let i = 0; i < 5; i++) {
    const cx = 2.6 + r() * 10.8;
    const cy = 2.6 + r() * 10.8;
    const rad = 1.5 + r() * 0.9;
    blobs.push(
      <g key={i}>
        <circle cx={cx.toFixed(2)} cy={cy.toFixed(2)} r={(rad + 0.35).toFixed(2)} fill={darken(mineral, 0.6)} />
        <circle cx={cx.toFixed(2)} cy={cy.toFixed(2)} r={rad.toFixed(2)} fill={mineral} />
        <circle cx={(cx - rad * 0.32).toFixed(2)} cy={(cy - rad * 0.32).toFixed(2)} r={(rad * 0.4).toFixed(2)} fill={hi} />
      </g>
    );
  }
  return (
    <>
      {stoneFace("#9c9c9c")}
      {blobs}
    </>
  );
}

const CRAFT_WOOD = "#a9793f";

function craftingTopFace(): ReactNode {
  const cell = darken(CRAFT_WOOD, 0.46);
  const cells: ReactNode[] = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const x = 2.9 + c * 3.5;
      const y = 2.9 + r * 3.5;
      cells.push(
        <g key={`${r}-${c}`}>
          <rect x={x} y={y} width="2.9" height="2.9" fill={cell} />
          <rect x={x} y={y} width="2.9" height="0.6" fill="#000000" opacity="0.35" />
          <rect x={x + 0.5} y={y + 1} width="1.9" height="1.5" fill={lighten(CRAFT_WOOD, 0.1)} opacity="0.5" />
        </g>
      );
    }
  }
  return (
    <>
      {planksFace(CRAFT_WOOD)}
      <rect x="1.6" y="1.6" width="12.8" height="12.8" fill="#39281a" />
      <rect x="2.3" y="2.3" width="11.4" height="11.4" fill={darken(CRAFT_WOOD, 0.18)} />
      {cells}
    </>
  );
}

function craftingSideFace(): ReactNode {
  return (
    <>
      {planksFace(CRAFT_WOOD)}
      {/* darker apron so the workbench reads as a table, not a plank cube */}
      <rect x="0" y="0" width="16" height="4.2" fill={darken(CRAFT_WOOD, 0.34)} />
      <rect x="0" y="4.2" width="16" height="0.6" fill="#2f2013" />
      {/* saw hung on the side */}
      <rect x="1.8" y="6.2" width="10.6" height="1.5" fill="#9aa0a8" />
      <rect x="1.8" y="6.2" width="10.6" height="0.5" fill="#c9ced5" />
      <path
        d="M1.8 7.7 L2.9 9 L4 7.7 L5.1 9 L6.2 7.7 L7.3 9 L8.4 7.7 L9.5 9 L10.6 7.7 L11.7 9 L12.4 7.7 Z"
        fill="#8b9198"
      />
      <rect x="12.2" y="5.7" width="2.4" height="2.6" rx="0.6" fill="#5b3d18" />
      {/* mallet */}
      <rect x="2.4" y="11.6" width="7.4" height="1.1" rx="0.4" fill="#5b3d18" />
      <rect x="9.4" y="10.3" width="3" height="3.6" rx="0.5" fill="#9aa0a8" />
      <rect x="9.4" y="10.3" width="3" height="0.9" rx="0.4" fill="#c9ced5" />
    </>
  );
}

const FURNACE_STONE = "#8d8d8d";

function furnaceBodyFace(): ReactNode {
  const mortar = darken(FURNACE_STONE, 0.4);
  return (
    <>
      {flat(FURNACE_STONE)}
      {grit(22, FURNACE_STONE, 9, 0.8, 2.2, 0.4)}
      {[4, 8, 12].map((y) => (
        <rect key={y} x="0" y={y} width="16" height="0.6" fill={mortar} opacity="0.75" />
      ))}
      <rect x="5.6" y="0" width="0.6" height="4" fill={mortar} opacity="0.6" />
      <rect x="10.6" y="4" width="0.6" height="4" fill={mortar} opacity="0.6" />
      <rect x="4" y="8" width="0.6" height="4" fill={mortar} opacity="0.6" />
      <rect x="9.8" y="12" width="0.6" height="4" fill={mortar} opacity="0.6" />
    </>
  );
}

function furnaceFrontFace(): ReactNode {
  return (
    <>
      {flat(FURNACE_STONE)}
      {grit(23, FURNACE_STONE, 8, 0.8, 2, 0.35)}
      <rect x="0" y="4.6" width="16" height="0.6" fill={darken(FURNACE_STONE, 0.4)} opacity="0.7" />
      {/* arched mouth */}
      <path
        d="M3.4 15 L3.4 10.2 C3.4 8 5.2 6.6 8 6.6 C10.8 6.6 12.6 8 12.6 10.2 L12.6 15 Z"
        fill="#3d3d3d"
      />
      <path
        d="M4.4 15 L4.4 10.4 C4.4 8.7 5.9 7.6 8 7.6 C10.1 7.6 11.6 8.7 11.6 10.4 L11.6 15 Z"
        fill="#101010"
      />
      {/* grate */}
      <rect x="5.1" y="10.6" width="0.9" height="4.4" fill="#4d4d4d" />
      <rect x="7.55" y="10.6" width="0.9" height="4.4" fill="#4d4d4d" />
      <rect x="10" y="10.6" width="0.9" height="4.4" fill="#4d4d4d" />
      <rect x="4.4" y="13.4" width="7.2" height="0.7" fill="#414141" />
    </>
  );
}

function furnaceTopFace(): ReactNode {
  return (
    <>
      {furnaceBodyFace()}
      <circle cx="8" cy="8" r="4.2" fill={darken(FURNACE_STONE, 0.3)} />
      <circle cx="8" cy="8" r="3.3" fill="#1b1b1b" />
      <circle cx="8" cy="8" r="3.3" fill="none" stroke={lighten(FURNACE_STONE, 0.3)} strokeWidth="0.5" />
    </>
  );
}

function barkFace(): ReactNode {
  const base = "#5D4037";
  const groove = darken(base, 0.42);
  const ridge = lighten(base, 0.2);
  return (
    <>
      {flat(base)}
      {[0.6, 3.6, 6.6, 9.8, 13].map((x) => (
        <rect key={x} x={x} y="0" width="1.1" height="16" fill={groove} />
      ))}
      {[2.2, 5.2, 8.3, 11.4, 14.6].map((x) => (
        <rect key={x} x={x} y="0" width="0.8" height="16" fill={ridge} opacity="0.55" />
      ))}
      {grit(5, base, 6, 0.6, 1.4, 0.4)}
    </>
  );
}

function endGrainFace(): ReactNode {
  const base = "#D7CCC8";
  const ring = darken(base, 0.34);
  return (
    <>
      {flat(base)}
      {[6.4, 4.7, 3.1, 1.7].map((r, i) => (
        <circle
          key={r}
          cx="8"
          cy="8"
          r={r}
          fill="none"
          stroke={ring}
          strokeWidth={i % 2 === 0 ? 0.7 : 0.5}
          opacity="0.8"
        />
      ))}
      <circle cx="8" cy="8" r="0.9" fill={darken(base, 0.5)} />
      {grit(6, base, 5, 0.5, 1.1, 0.35)}
    </>
  );
}

function leavesFace(): ReactNode {
  const base = "#2E7D32";
  const r = rand(7);
  const clumps: ReactNode[] = [];
  const tones = [base, lighten(base, 0.24), darken(base, 0.16), lighten(base, 0.12)];
  for (let i = 0; i < 16; i++) {
    const cx = 1.2 + r() * 13.6;
    const cy = 1.2 + r() * 13.6;
    clumps.push(
      <circle
        key={i}
        cx={cx.toFixed(2)}
        cy={cy.toFixed(2)}
        r={(1.5 + r() * 1.3).toFixed(2)}
        fill={tones[i % tones.length]}
      />
    );
  }
  // Dark ground shows through the clumps as gaps, which is what makes leaves
  // read as foliage rather than a green cube.
  return (
    <>
      {flat(darken(base, 0.62))}
      {clumps}
    </>
  );
}

const GRASS_GREEN = "#5cb85c";
const DIRT_BROWN = "#9b7653";

function grassTopFace(): ReactNode {
  const r = rand(11);
  const blades: ReactNode[] = [];
  for (let i = 0; i < 9; i++) {
    blades.push(
      <rect
        key={i}
        x={(r() * 15).toFixed(2)}
        y={(r() * 14).toFixed(2)}
        width="0.8"
        height={(1.4 + r() * 1.4).toFixed(2)}
        rx="0.3"
        fill={i % 2 === 0 ? lighten(GRASS_GREEN, 0.3) : darken(GRASS_GREEN, 0.24)}
        opacity="0.75"
      />
    );
  }
  return (
    <>
      {flat(GRASS_GREEN)}
      {grit(10, GRASS_GREEN, 8, 1, 2.4, 0.35)}
      {blades}
    </>
  );
}

function grassSideFace(): ReactNode {
  const r = rand(12);
  const fringe: ReactNode[] = [];
  for (let x = 0; x < 16; x += 1.6) {
    fringe.push(
      <rect
        key={x}
        x={x}
        y="3.2"
        width="1.5"
        height={(0.6 + r() * 1.8).toFixed(2)}
        fill={GRASS_GREEN}
      />
    );
  }
  return (
    <>
      {flat(DIRT_BROWN)}
      {grit(13, DIRT_BROWN, 9, 1, 2.4, 0.5)}
      <rect x="0" y="0" width="16" height="3.4" fill={GRASS_GREEN} />
      <rect x="0" y="0" width="16" height="0.9" fill={lighten(GRASS_GREEN, 0.28)} opacity="0.8" />
      {fringe}
    </>
  );
}

function crystalFace(): ReactNode {
  const base = "#00e5ff";
  return (
    <>
      {flat(darken(base, 0.5))}
      <path d="M0 0 L16 0 L16 5.4 L0 11 Z" fill={base} />
      <path d="M0 0 L9 0 L0 6.4 Z" fill={lighten(base, 0.55)} />
      <path d="M16 5.4 L16 16 L4.6 16 Z" fill={darken(base, 0.25)} />
      <path d="M0 11 L16 5.4 L16 7.2 L0 12.8 Z" fill={lighten(base, 0.3)} opacity="0.8" />
      <rect x="2.2" y="1.6" width="2.8" height="0.9" rx="0.4" fill="#ffffff" opacity="0.9" />
      <rect x="10.4" y="10.6" width="1.6" height="1.6" rx="0.5" fill="#ffffff" opacity="0.55" />
    </>
  );
}

function iceFace(): ReactNode {
  const base = "#a0d0ff";
  return (
    <>
      {flat(lighten(base, 0.18))}
      <path d="M-2 8 L8 -2 L11 -2 L1 8 Z" fill="#ffffff" opacity="0.4" />
      <path d="M4 18 L18 4 L18 6.4 L6.4 18 Z" fill="#ffffff" opacity="0.28" />
      <path
        d="M2 3 L6.4 7.4 L5.4 11.4 L9.8 14.6"
        fill="none"
        stroke={darken(base, 0.3)}
        strokeWidth="0.6"
        opacity="0.7"
      />
      <path d="M0 0 L6.6 0 L0 6.6 Z" fill="#ffffff" opacity="0.55" />
    </>
  );
}

function waterFace(): ReactNode {
  const base = "#3366ff";
  return (
    <>
      {flat(base)}
      {[2.6, 6.4, 10.2, 14].map((y, i) => (
        <path
          key={y}
          d={`M0 ${y} q4 -1.6 8 0 t8 0`}
          fill="none"
          stroke={i % 2 === 0 ? lighten(base, 0.42) : darken(base, 0.24)}
          strokeWidth="0.9"
          opacity="0.75"
        />
      ))}
    </>
  );
}

function lavaFace(): ReactNode {
  const base = "#ff6600";
  const r = rand(19);
  const molten: ReactNode[] = [];
  for (let i = 0; i < 7; i++) {
    molten.push(
      <rect
        key={i}
        x={(r() * 12.6).toFixed(2)}
        y={(r() * 12.6).toFixed(2)}
        width={(2 + r() * 2.6).toFixed(2)}
        height={(1.4 + r() * 1.8).toFixed(2)}
        rx="0.8"
        fill={i % 2 === 0 ? "#ffb300" : base}
      />
    );
  }
  return (
    <>
      {flat(darken(base, 0.55))}
      {molten}
      <rect x="4.4" y="6.8" width="3" height="1.4" rx="0.6" fill="#ffe082" />
    </>
  );
}

function snowFace(withCap: boolean): ReactNode {
  const base = "#f4f6ff";
  return (
    <>
      {flat(withCap ? "#dfe4f2" : base)}
      {withCap && <rect x="0" y="0" width="16" height="5.2" fill="#ffffff" />}
      {withCap && <rect x="0" y="5.2" width="16" height="0.7" fill="#c6cee0" />}
      {grit(20, base, 7, 1, 2.2, 0.3)}
      <rect x="2.4" y={withCap ? 9 : 4.6} width="4.4" height="0.7" rx="0.3" fill="#cdd5e6" opacity="0.8" />
      <rect x="8.6" y={withCap ? 12 : 10.4} width="4" height="0.7" rx="0.3" fill="#cdd5e6" opacity="0.7" />
    </>
  );
}

function sandFace(): ReactNode {
  const base = "#ffe082";
  return (
    <>
      {flat(base)}
      {grit(4, base, 22, 0.55, 1.1, 0.45)}
      <rect x="1.4" y="5.2" width="6" height="0.5" rx="0.2" fill={darken(base, 0.16)} opacity="0.5" />
      <rect x="7.6" y="11" width="6.4" height="0.5" rx="0.2" fill={darken(base, 0.16)} opacity="0.45" />
    </>
  );
}

interface CubeFaces {
  top: ReactNode;
  /** Left (front-facing) side. */
  side: ReactNode;
  /** Right side; falls back to `side`. */
  right?: ReactNode;
}

function cubeFaces(blockId: number): CubeFaces {
  switch (blockId) {
    case BLOCK_ID.GRASS:
      return { top: grassTopFace(), side: grassSideFace() };
    case BLOCK_ID.STONE:
      return { top: stoneFace("#a8a8a8"), side: stoneFace("#a8a8a8") };
    case BLOCK_ID.SAND:
      return { top: sandFace(), side: sandFace() };
    case BLOCK_ID.LOG:
      return { top: endGrainFace(), side: barkFace() };
    case BLOCK_ID.LEAVES:
      return { top: leavesFace(), side: leavesFace() };
    case BLOCK_ID.CRYSTAL:
      return { top: crystalFace(), side: crystalFace() };
    case BLOCK_ID.PLANKS:
      return { top: planksFace("#c8a55a"), side: planksFace("#c8a55a") };
    case BLOCK_ID.CRAFTING_TABLE:
      return { top: craftingTopFace(), side: craftingSideFace() };
    case BLOCK_ID.FURNACE:
      return { top: furnaceTopFace(), side: furnaceFrontFace(), right: furnaceBodyFace() };
    case BLOCK_ID.IRON_ORE:
      return { top: oreFace("#c9a077", 26), side: oreFace("#c9a077", 26) };
    case BLOCK_ID.DIAMOND_ORE:
      return { top: oreFace("#4dd0e1", 28), side: oreFace("#4dd0e1", 28) };
    case BLOCK_ID.SNOW:
      return { top: snowFace(false), side: snowFace(true) };
    case BLOCK_ID.ICE:
      return { top: iceFace(), side: iceFace() };
    case BLOCK_ID.WATER:
      return { top: waterFace(), side: waterFace() };
    case BLOCK_ID.LAVA:
      return { top: lavaFace(), side: lavaFace() };
    default: {
      // Structurally flat blocks (dirt and anything new) keep the tinted
      // treatment, now on a cube so they still read as placeable.
      const color = ITEM_COLORS[blockId] ?? "#888888";
      const face = (
        <>
          {flat(color)}
          {grit(blockId, color, 10, 0.9, 2.4)}
        </>
      );
      return { top: face, side: face };
    }
  }
}

function BlockSVG({ blockId, size }: { blockId: number; size: number }) {
  const s = size * 0.82;
  const faces = cubeFaces(blockId);
  const clip = `vhcf${blockId}`;
  const clipUrl = `url(#${clip})`;

  return (
    <svg width={s} height={s} viewBox="0 0 32 32">
      <defs>
        <clipPath id={clip}>
          <rect x="0" y="0" width="16" height="16" />
        </clipPath>
      </defs>
      <g transform={FACE_TOP}>
        <g clipPath={clipUrl}>
          {faces.top}
          <rect x="0" y="0" width="16" height="16" fill="#ffffff" opacity="0.1" />
        </g>
      </g>
      <g transform={FACE_LEFT}>
        <g clipPath={clipUrl}>
          {faces.side}
          <rect x="0" y="0" width="16" height="16" fill="#000000" opacity="0.14" />
        </g>
      </g>
      <g transform={FACE_RIGHT}>
        <g clipPath={clipUrl}>
          {faces.right ?? faces.side}
          <rect x="0" y="0" width="16" height="16" fill="#000000" opacity="0.34" />
        </g>
      </g>
      <path
        d="M16 3 L29 10.5 L29 22.5 L16 30 L3 22.5 L3 10.5 Z"
        fill="none"
        stroke="#000000"
        strokeOpacity="0.5"
        strokeWidth="0.8"
        strokeLinejoin="round"
      />
      <path
        d="M3 10.5 L16 18 L29 10.5 M16 18 L16 30"
        fill="none"
        stroke="#000000"
        strokeOpacity="0.28"
        strokeWidth="0.6"
      />
    </svg>
  );
}

// ────────────── entry point ──────────────

export function ItemIcon({ blockId, size }: { blockId: number; size: number }) {
  if (blockId === BLOCK_ID.STICK) return <StickSVG size={size} />;
  if (FOOD_IDS.has(blockId)) return <FoodSVG blockId={blockId} size={size} />;
  if (blockId === BLOCK_ID.IRON_INGOT) {
    return <IngotSVG color={ITEM_COLORS[blockId] ?? "#d4d4d4"} size={size} />;
  }
  if (blockId === BLOCK_ID.DIAMOND) {
    return <GemSVG color={ITEM_COLORS[blockId] ?? "#00d4ff"} size={size} />;
  }

  const toolDef = getToolDef(blockId);
  if (toolDef) {
    return <ToolSVG toolType={toolDef.toolType} color={ITEM_COLORS[blockId] ?? "#888"} size={size} />;
  }

  const armorDef = getArmorDef(blockId);
  if (armorDef) {
    const color = ARMOR_ICON_COLORS[blockId] ?? ITEM_COLORS[blockId] ?? "#888";
    return <ArmorSVG slot={armorDef.slot} color={color} size={size} />;
  }

  return <BlockSVG blockId={blockId} size={size} />;
}

export function DurabilityBar({
  durability,
  maxDurability,
  width,
}: {
  durability: number;
  maxDurability: number;
  width: number;
}) {
  const pct = Math.max(0, Math.min(1, durability / maxDurability));
  if (pct >= 1) return null;
  const barColor = pct > 0.5 ? "#4caf50" : pct > 0.25 ? "#ffeb3b" : "#f44336";
  return (
    <div
      className="absolute left-1/2 -translate-x-1/2"
      style={{ bottom: 3, width: width * 0.68, height: 3, background: "#000" }}
    >
      <div style={{ width: `${pct * 100}%`, height: 2, background: barColor }} />
    </div>
  );
}

export function InventorySlot({
  item,
  onClick,
  size = 44,
  highlight = false,
  label,
  tooltip = true,
}: {
  item: { blockId: number; count: number; durability?: number };
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
  size?: number;
  highlight?: boolean;
  label?: string;
  tooltip?: boolean;
}) {
  const [hover, setHover] = useState(false);
  const hasItem = item.count > 0 && item.blockId !== BLOCK_ID.AIR;
  const toolDef = hasItem ? getToolDef(item.blockId) : null;
  const armorDef = hasItem ? getArmorDef(item.blockId) : null;

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="relative flex items-center justify-center cursor-pointer select-none"
      style={{
        width: size,
        height: size,
        background: highlight ? "#c6c6c6" : hover ? "#9c9c9c" : "#8b8b8b",
        border: highlight ? "2px solid #fff" : "2px solid #373737",
        boxShadow: highlight
          ? "inset 2px 2px 0 #fafafa, inset -2px -2px 0 #aaa"
          : "inset 2px 2px 0 #ababab, inset -2px -2px 0 #585858",
      }}
    >
      {hasItem && <ItemIcon blockId={item.blockId} size={size} />}
      {hasItem && item.count > 1 && (
        <span
          className="absolute bottom-0 right-0.5 text-[12px] font-mono font-bold text-white"
          style={{ textShadow: "1px 1px 0 #000, -1px 0 0 #000, 0 -1px 0 #000" }}
        >
          {item.count}
        </span>
      )}
      {hasItem && toolDef && item.durability !== undefined && (
        <DurabilityBar durability={item.durability} maxDurability={toolDef.durability} width={size} />
      )}
      {label && !hasItem && <span className="text-[10px] text-[#666] font-mono">{label}</span>}
      {tooltip && hover && hasItem && (
        <div
          className="absolute z-50 pointer-events-none font-mono whitespace-nowrap"
          style={{
            left: "50%",
            bottom: size + 6,
            transform: "translateX(-50%)",
            background: "rgba(16,0,16,0.94)",
            border: "2px solid #2d0a63",
            padding: "3px 6px",
            fontSize: 11,
            color: "#fff",
            textShadow: "1px 1px 0 #000",
          }}
        >
          {ITEM_NAMES[item.blockId] ?? `#${item.blockId}`}
          {armorDef && (
            <span style={{ color: "#8fd8ff" }}>
              {" "}
              · +{Math.round(armorDef.damageReduction * 100)}% armour
            </span>
          )}
          {toolDef && <span style={{ color: "#8fd8ff" }}> · {toolDef.attackDamage} dmg</span>}
        </div>
      )}
    </div>
  );
}

/**
 * Floating item stack that follows the mouse while an inventory screen is
 * open. Mount only while the screen is open; renders nothing when the
 * cursor is empty.
 */
export function CursorItemOverlay({
  item,
}: {
  item: { blockId: number; count: number; durability?: number };
}) {
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handler = (e: MouseEvent) => setMousePos({ x: e.clientX, y: e.clientY });
    window.addEventListener("mousemove", handler);
    return () => window.removeEventListener("mousemove", handler);
  }, []);

  if (item.count === 0) return null;

  return (
    <div
      className="fixed pointer-events-none z-50 flex items-center justify-center"
      style={{ left: mousePos.x + 8, top: mousePos.y + 8, width: 40, height: 40 }}
    >
      <ItemIcon blockId={item.blockId} size={40} />
      {item.count > 1 && (
        <span
          className="absolute bottom-0 right-0 text-[11px] font-mono font-bold text-white"
          style={{ textShadow: "1px 1px 0 #000, -1px 0 0 #000, 0 -1px 0 #000" }}
        >
          {item.count}
        </span>
      )}
    </div>
  );
}

export { ITEM_COLORS, FOOD_IDS };
