"use client";

import { BLOCK_ID } from "@data/blocks";
import { ITEM_COLORS, ITEM_NAMES, isToolItem, getToolDef, type ToolType } from "@data/items";

const FOOD_IDS: Set<number> = new Set([BLOCK_ID.RAW_PORK, BLOCK_ID.RAW_BEEF, BLOCK_ID.RAW_MUTTON]);

function ToolSVG({ toolType, color, size }: { toolType: ToolType; color: string; size: number }) {
  const s = size * 0.7;
  const dark = "#3a3a3a";
  const handle = "#8B6914";

  if (toolType === "pickaxe") {
    return (
      <svg width={s} height={s} viewBox="0 0 16 16">
        <rect x="7" y="6" width="2" height="9" fill={handle} rx="0.5" />
        <rect x="2" y="1" width="12" height="3" fill={color} rx="0.5" />
        <rect x="3" y="2" width="10" height="1" fill="rgba(255,255,255,0.2)" />
        <rect x="2" y="4" width="2" height="2" fill={dark} />
        <rect x="12" y="4" width="2" height="2" fill={dark} />
      </svg>
    );
  }
  if (toolType === "axe") {
    return (
      <svg width={s} height={s} viewBox="0 0 16 16">
        <rect x="7" y="6" width="2" height="9" fill={handle} rx="0.5" />
        <rect x="3" y="1" width="7" height="3" fill={color} rx="0.5" />
        <rect x="4" y="2" width="5" height="1" fill="rgba(255,255,255,0.2)" />
        <rect x="3" y="4" width="3" height="3" fill={color} />
        <rect x="3" y="4" width="2" height="1" fill="rgba(255,255,255,0.15)" />
      </svg>
    );
  }
  if (toolType === "shovel") {
    return (
      <svg width={s} height={s} viewBox="0 0 16 16">
        <rect x="7" y="6" width="2" height="9" fill={handle} rx="0.5" />
        <rect x="5" y="1" width="6" height="4" rx="1" fill={color} />
        <rect x="6" y="2" width="4" height="1" fill="rgba(255,255,255,0.2)" />
        <rect x="6" y="5" width="4" height="2" fill={dark} rx="0.5" />
      </svg>
    );
  }
  // sword
  return (
    <svg width={s} height={s} viewBox="0 0 16 16">
      <rect x="7" y="10" width="2" height="5" fill={handle} rx="0.5" />
      <rect x="4" y="9" width="8" height="2" fill={dark} rx="0.5" />
      <rect x="6" y="1" width="4" height="9" rx="0.5" fill={color} />
      <rect x="7" y="2" width="2" height="6" fill="rgba(255,255,255,0.2)" />
      <rect x="6" y="1" width="4" height="1" fill="rgba(255,255,255,0.3)" />
    </svg>
  );
}

function StickSVG({ size }: { size: number }) {
  const s = size * 0.6;
  return (
    <svg width={s} height={s} viewBox="0 0 16 16">
      <rect x="6" y="1" width="3" height="14" rx="1" fill="#b8945a" />
      <rect x="7" y="2" width="1" height="11" fill="rgba(255,255,255,0.15)" />
    </svg>
  );
}

function FoodSVG({ blockId, size }: { blockId: number; size: number }) {
  const s = size * 0.65;
  const colors: Record<number, { main: string; dark: string; highlight: string }> = {
    [BLOCK_ID.RAW_PORK]: { main: "#f0a0a0", dark: "#c47070", highlight: "#ffc0c0" },
    [BLOCK_ID.RAW_BEEF]: { main: "#c45050", dark: "#8a2020", highlight: "#e07070" },
    [BLOCK_ID.RAW_MUTTON]: { main: "#d4836a", dark: "#a05838", highlight: "#eaaa90" },
  };
  const c = colors[blockId] ?? colors[BLOCK_ID.RAW_PORK];

  return (
    <svg width={s} height={s} viewBox="0 0 16 16">
      <ellipse cx="8" cy="7" rx="6" ry="4.5" fill={c.main} />
      <ellipse cx="8" cy="6.5" rx="4.5" ry="3" fill={c.highlight} opacity="0.4" />
      <ellipse cx="8" cy="8" rx="5" ry="3.5" fill={c.dark} opacity="0.3" />
      <ellipse cx="6" cy="6" rx="1.5" ry="1" fill={c.highlight} opacity="0.5" />
      {blockId === BLOCK_ID.RAW_BEEF && (
        <>
          <path d="M4 10 Q3 12 5 13" stroke={c.dark} strokeWidth="1.5" fill="none" strokeLinecap="round" />
          <ellipse cx="8" cy="7" rx="2" ry="1.5" fill="#fff" opacity="0.15" />
        </>
      )}
      {blockId === BLOCK_ID.RAW_PORK && (
        <>
          <rect x="3" y="10" width="3" height="3" rx="1" fill={c.dark} opacity="0.5" />
          <rect x="10" y="10" width="3" height="3" rx="1" fill={c.dark} opacity="0.5" />
        </>
      )}
      {blockId === BLOCK_ID.RAW_MUTTON && (
        <path d="M5 10 Q4 13 6 13 L10 13 Q12 13 11 10" fill={c.dark} opacity="0.4" />
      )}
    </svg>
  );
}

export function ItemIcon({ blockId, size }: { blockId: number; size: number }) {
  if (blockId === BLOCK_ID.STICK) {
    return <StickSVG size={size} />;
  }

  if (FOOD_IDS.has(blockId)) {
    return <FoodSVG blockId={blockId} size={size} />;
  }

  const toolDef = getToolDef(blockId);
  if (toolDef) {
    const color = ITEM_COLORS[blockId] ?? "#888";
    return <ToolSVG toolType={toolDef.toolType} color={color} size={size} />;
  }

  // Default: colored block square
  return (
    <div
      style={{
        width: size * 0.55,
        height: size * 0.55,
        backgroundColor: ITEM_COLORS[blockId] ?? "#888",
        boxShadow:
          "inset -2px -2px 0 rgba(0,0,0,0.3), inset 2px 2px 0 rgba(255,255,255,0.15)",
      }}
    />
  );
}

export function DurabilityBar({ durability, maxDurability, width }: { durability: number; maxDurability: number; width: number }) {
  const pct = durability / maxDurability;
  if (pct >= 1) return null;
  const barColor = pct > 0.5 ? "#4caf50" : pct > 0.25 ? "#ffeb3b" : "#f44336";
  return (
    <div
      className="absolute bottom-1 left-1/2 -translate-x-1/2"
      style={{ width: width * 0.7, height: 2, backgroundColor: "#0005" }}
    >
      <div style={{ width: `${pct * 100}%`, height: "100%", backgroundColor: barColor }} />
    </div>
  );
}

export { ITEM_COLORS, ITEM_NAMES, FOOD_IDS };
