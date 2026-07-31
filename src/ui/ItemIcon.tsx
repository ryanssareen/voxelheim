"use client";

/**
 * Deliberately keeps the existing vector look — rounded rects, paths, smooth
 * shapes — and only adds detail:
 *
 *  - tools gain a binding band where the head meets the handle, a darker
 *    bottom edge, and wood grain on the shaft
 *  - armour keeps its silhouettes but gains pauldrons, a belt, knee detail and
 *    soles so chest/legs/boots differ at 44px
 *  - blocks keep the flat bevelled square, now with a two-step bevel and a
 *    few deterministic specks so dirt and stone differ by more than hue
 *  - food is redrawn as a faceted raw cut with a bone (the old smooth blob with
 *    a rim highlight read as candy)
 *  - slots gain a hover state and a name/stat tooltip
 *
 * The worn helmet is not rendered on the player model (the head stays bare, so
 * the face reads at every camera distance), but helmets are still craftable and
 * still grant damage reduction — so they keep an inventory icon here.
 */

import { useEffect, useState } from "react";
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

// ────────────── blocks ──────────────

/** Deterministic specks so dirt, stone and sand differ by more than hue. */
function speckles(blockId: number, color: string) {
  const dark = darken(color, 0.28);
  const light = lighten(color, 0.28);
  const out = [];
  let h = (blockId * 2654435761) >>> 0;
  for (let i = 0; i < 5; i++) {
    h = (h ^ (h << 13)) >>> 0;
    h = (h ^ (h >>> 17)) >>> 0;
    const x = 4.2 + ((h >>> 3) % 14) / 2.4;
    const y = 4.2 + ((h >>> 11) % 14) / 2.4;
    const big = ((h >>> 19) & 1) === 1;
    out.push(
      <rect
        key={i}
        x={x}
        y={y}
        width={big ? 1.4 : 0.9}
        height={big ? 1.1 : 0.9}
        rx="0.2"
        fill={i % 2 === 0 ? dark : light}
        opacity={0.55}
      />
    );
  }
  return out;
}

function BlockSVG({ blockId, size }: { blockId: number; size: number }) {
  const s = size * 0.62;
  const color = ITEM_COLORS[blockId] ?? "#888888";
  return (
    <svg width={s} height={s} viewBox="0 0 16 16">
      <rect x="2.5" y="2.5" width="11" height="11" fill={color} />
      {speckles(blockId, color)}
      <rect x="2.5" y="2.5" width="11" height="1.6" fill="#ffffff" opacity="0.22" />
      <rect x="2.5" y="2.5" width="1.6" height="11" fill="#ffffff" opacity="0.14" />
      <rect x="2.5" y="11.9" width="11" height="1.6" fill="#000000" opacity="0.32" />
      <rect x="11.9" y="2.5" width="1.6" height="11" fill="#000000" opacity="0.22" />
      <rect
        x="2.5"
        y="2.5"
        width="11"
        height="11"
        fill="none"
        stroke="#000000"
        strokeOpacity="0.35"
        strokeWidth="0.6"
      />
    </svg>
  );
}

// ────────────── entry point ──────────────

export function ItemIcon({ blockId, size }: { blockId: number; size: number }) {
  if (blockId === BLOCK_ID.STICK) return <StickSVG size={size} />;
  if (FOOD_IDS.has(blockId)) return <FoodSVG blockId={blockId} size={size} />;

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
  onClick?: () => void;
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
