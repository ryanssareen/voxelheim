"use client";

import { useEffect, useRef } from "react";
import type { Engine } from "@engine/Engine";
import { useChatStore } from "@store/useChatStore";
import { useGameStore } from "@store/useGameStore";
import { useInventoryStore } from "@store/useInventoryStore";
import { SEA_LEVEL } from "@engine/world/constants";
import { BLOCK_ID } from "@data/blocks";

const MAP_SIZE = 176; // canvas pixels
const SAMPLES = 96; // terrain grid resolution per axis
const STREAM_SPAN = 192; // blocks shown across the map on flat/infinite worlds
const POLL_MS = 150; // marker redraw interval
const TERRAIN_MAX_AGE_MS = 3000; // recache terrain at least this often
const TERRAIN_MOVE_BLOCKS = 8; // ...or after moving this far
const MAX_LEGEND_ROWS = 4;

const MOB_COLORS: Record<string, string> = {
  zombie: "#e53935",
  skeleton: "#cfd8dc",
  creeper: "#76ff03",
};

interface Category {
  name: string;
  color: string;
  rgb: [number, number, number];
}

function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

function makeCategory(name: string, color: string): Category {
  return { name, color, rgb: hexToRgb(color) };
}

const CAT_WATER = makeCategory("Water", "#3d6edd");
const CAT_ICE = makeCategory("Ice", "#b3e5fc");
const CAT_GRASS = makeCategory("Grass", "#6aab3f");
const CAT_STONE = makeCategory("Stone", "#8a8a8a");
const CAT_WOOD = makeCategory("Wood", "#8b6914");

// Biome colors for infinite worlds
const BIOME_CATEGORIES: Record<string, Category> = {
  plains: makeCategory("Plains", "#8bc34a"),
  forest: makeCategory("Forest", "#2e7d32"),
  desert: makeCategory("Desert", "#e6d29a"),
  mountains: makeCategory("Mountains", "#9e9e9e"),
  snowy: makeCategory("Snowy", "#eceff1"),
};

// Surface-block color buckets for island/flat worlds and loaded chunks
const BLOCK_CATEGORIES: Record<number, Category> = {
  [BLOCK_ID.GRASS]: CAT_GRASS,
  [BLOCK_ID.DIRT]: makeCategory("Dirt", "#9b7653"),
  [BLOCK_ID.SAND]: makeCategory("Sand", "#dccf9a"),
  [BLOCK_ID.STONE]: CAT_STONE,
  [BLOCK_ID.IRON_ORE]: CAT_STONE,
  [BLOCK_ID.DIAMOND_ORE]: CAT_STONE,
  [BLOCK_ID.FURNACE]: CAT_STONE,
  [BLOCK_ID.SNOW]: makeCategory("Snow", "#f4f8fa"),
  [BLOCK_ID.ICE]: CAT_ICE,
  [BLOCK_ID.WATER]: CAT_WATER,
  [BLOCK_ID.LOG]: CAT_WOOD,
  [BLOCK_ID.PLANKS]: CAT_WOOD,
  [BLOCK_ID.CRAFTING_TABLE]: CAT_WOOD,
  [BLOCK_ID.LEAVES]: makeCategory("Leaves", "#3f7d2c"),
};

// Blocks the generator itself places at the surface of infinite worlds —
// these keep the biome color; anything else is a player build and overrides it.
const NATURAL_INFINITE_SURFACE = new Set<number>([
  BLOCK_ID.GRASS,
  BLOCK_ID.DIRT,
  BLOCK_ID.SAND,
  BLOCK_ID.STONE,
  BLOCK_ID.SNOW,
  BLOCK_ID.ICE,
  BLOCK_ID.WATER,
]);

/** Pick the color category for one sampled terrain column. */
function categorize(
  info: { surfaceY: number; blockId: number; biome: string | null },
  isInfinite: boolean
): Category {
  // No land above sea level — the top-down view is water (ice when snowy)
  if (info.surfaceY <= SEA_LEVEL) {
    return isInfinite && info.biome === "snowy" ? CAT_ICE : CAT_WATER;
  }
  const blockCat = BLOCK_CATEGORIES[info.blockId];
  if (isInfinite) {
    if (blockCat && !NATURAL_INFINITE_SURFACE.has(info.blockId)) return blockCat;
    if (info.biome) return BIOME_CATEGORIES[info.biome] ?? CAT_GRASS;
    return CAT_GRASS;
  }
  // Island/flat: color straight from the surface block; air (dug-out or
  // out-of-range column above sea level) falls back to a height-derived guess
  return blockCat ?? CAT_GRASS;
}

/** Rebuild the legend rows imperatively — no React state per terrain pass. */
function renderLegend(
  el: HTMLDivElement | null,
  entries: Array<{ name: string; color: string; pct: number }>
): void {
  if (!el) return;
  el.style.display = entries.length > 0 ? "" : "none";
  const rows = entries.map((entry) => {
    const row = document.createElement("div");
    row.className = "flex items-center justify-between gap-2";
    const label = document.createElement("span");
    label.className = "flex items-center gap-1";
    const swatch = document.createElement("span");
    swatch.className = "inline-block w-[7px] h-[7px] rounded-[1px] border border-black/40";
    swatch.style.backgroundColor = entry.color;
    const name = document.createElement("span");
    name.textContent = entry.name;
    label.append(swatch, name);
    const pct = document.createElement("span");
    pct.className = "text-white/50";
    pct.textContent = `${entry.pct}%`;
    row.append(label, pct);
    return row;
  });
  el.replaceChildren(...rows);
}

/**
 * Minimap overlay — top-right, north-up (world -Z = screen up), player-centered.
 * Terrain is cached to an offscreen canvas and recomputed only when the player
 * moves >= 8 blocks or every 3s; markers are repainted on a 150ms interval.
 * The only React state is visibility (M key toggles).
 */
export function MinimapUI({
  engineRef,
}: {
  engineRef: React.RefObject<Engine | null>;
}) {
  const visible = useGameStore((s) => s.minimapVisible);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const legendRef = useRef<HTMLDivElement>(null);

  // M key toggles the map — listener stays mounted even while hidden
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.code !== "KeyM" || event.repeat) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (useChatStore.getState().composing) return;
      const inv = useInventoryStore.getState();
      if (inv.isOpen || inv.tableOpen || inv.furnaceOpen || inv.creativeOpen) return;
      useGameStore.getState().toggleMinimap();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  // Imperative draw loop — polls the engine, never touches React state
  useEffect(() => {
    if (!visible) return;

    const terrain = document.createElement("canvas");
    terrain.width = SAMPLES;
    terrain.height = SAMPLES;
    let terrainCache: { x: number; z: number; time: number; span: number } | null = null;

    const renderTerrain = (
      engine: Engine,
      player: { x: number; z: number },
      span: number,
      isInfinite: boolean
    ): void => {
      const tctx = terrain.getContext("2d");
      if (!tctx) return;
      const img = tctx.createImageData(SAMPLES, SAMPLES);
      const counts = new Map<string, { color: string; count: number }>();
      const step = span / SAMPLES;
      const startX = player.x - span / 2;
      const startZ = player.z - span / 2;

      for (let j = 0; j < SAMPLES; j++) {
        const wz = Math.floor(startZ + (j + 0.5) * step);
        for (let i = 0; i < SAMPLES; i++) {
          const wx = Math.floor(startX + (i + 0.5) * step);
          const info = engine.getTerrainInfo(wx, wz);
          const cat = categorize(info, isInfinite);
          // Slight height-based shading so the map reads as terrain relief
          const t = Math.max(0, Math.min(1, (info.surfaceY - (SEA_LEVEL - 8)) / 48));
          const shade = 0.85 + t * 0.25;
          const o = (j * SAMPLES + i) * 4;
          img.data[o] = Math.min(255, Math.round(cat.rgb[0] * shade));
          img.data[o + 1] = Math.min(255, Math.round(cat.rgb[1] * shade));
          img.data[o + 2] = Math.min(255, Math.round(cat.rgb[2] * shade));
          img.data[o + 3] = 255;
          const entry = counts.get(cat.name);
          if (entry) {
            entry.count++;
          } else {
            counts.set(cat.name, { color: cat.color, count: 1 });
          }
        }
      }
      tctx.putImageData(img, 0, 0);

      // Legend: biome/surface share of the sampled grid, top rows first
      const total = SAMPLES * SAMPLES;
      const entries = [...counts.entries()]
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, MAX_LEGEND_ROWS)
        .map(([name, { color, count }]) => ({
          name,
          color,
          pct: Math.round((count / total) * 100),
        }));
      renderLegend(legendRef.current, entries);
    };

    const tick = (): void => {
      const engine = engineRef.current;
      const canvas = canvasRef.current;
      if (!engine || !canvas) return;
      const data = engine.getMinimapData();
      if (!data) return;

      const span = data.worldType === "island" ? data.islandSize : STREAM_SPAN;
      const now = performance.now();
      const moved = terrainCache
        ? Math.hypot(data.player.x - terrainCache.x, data.player.z - terrainCache.z)
        : Infinity;
      if (
        !terrainCache ||
        terrainCache.span !== span ||
        moved >= TERRAIN_MOVE_BLOCKS ||
        now - terrainCache.time >= TERRAIN_MAX_AGE_MS
      ) {
        renderTerrain(engine, data.player, span, data.worldType === "infinite");
        terrainCache = { x: data.player.x, z: data.player.z, time: now, span };
      }

      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const scale = MAP_SIZE / span;
      const cx = MAP_SIZE / 2;

      ctx.fillStyle = "#101823";
      ctx.fillRect(0, 0, MAP_SIZE, MAP_SIZE);
      // Terrain layer is centered where it was cached — shift so the player
      // stays pinned to the exact center between recaches
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(
        terrain,
        (terrainCache.x - data.player.x) * scale,
        (terrainCache.z - data.player.z) * scale,
        MAP_SIZE,
        MAP_SIZE
      );

      // Death marker — red X, clamped to the edge at 50% opacity when out of range
      if (data.deathPos) {
        const margin = 6;
        const rawX = cx + (data.deathPos.x - data.player.x) * scale;
        const rawZ = cx + (data.deathPos.z - data.player.z) * scale;
        const dx = Math.max(margin, Math.min(MAP_SIZE - margin, rawX));
        const dz = Math.max(margin, Math.min(MAP_SIZE - margin, rawZ));
        const clamped = dx !== rawX || dz !== rawZ;
        ctx.save();
        ctx.globalAlpha = clamped ? 0.5 : 1;
        ctx.strokeStyle = "#e53935";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(dx - 3, dz - 3);
        ctx.lineTo(dx + 3, dz + 3);
        ctx.moveTo(dx + 3, dz - 3);
        ctx.lineTo(dx - 3, dz + 3);
        ctx.stroke();
        ctx.restore();
      }

      // Hostile mobs — colored dots
      for (const mob of data.hostiles) {
        const mx = cx + (mob.x - data.player.x) * scale;
        const mz = cx + (mob.z - data.player.z) * scale;
        if (mx < 2 || mx > MAP_SIZE - 2 || mz < 2 || mz > MAP_SIZE - 2) continue;
        ctx.fillStyle = MOB_COLORS[mob.type] ?? "#ffffff";
        ctx.strokeStyle = "rgba(0,0,0,0.6)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(mx, mz, 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      // Player arrow at center — rotate by -yaw (camera forward on XZ is
      // (-sin yaw, -cos yaw), so angle-from-up = atan2(-sin yaw, cos yaw) = -yaw)
      ctx.save();
      ctx.translate(cx, cx);
      ctx.rotate(-data.player.yaw);
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "rgba(0,0,0,0.7)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, -5);
      ctx.lineTo(4, 4);
      ctx.lineTo(0, 2);
      ctx.lineTo(-4, 4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    };

    tick();
    const intervalId = setInterval(tick, POLL_MS);
    return () => clearInterval(intervalId);
  }, [visible, engineRef]);

  if (!visible) return null;

  return (
    <div className="absolute top-3 right-3 z-10 pointer-events-none flex flex-col items-end gap-1">
      <div className="p-1 bg-black/50 border border-white/10 rounded">
        <canvas
          ref={canvasRef}
          width={MAP_SIZE}
          height={MAP_SIZE}
          className="block rounded-sm"
        />
      </div>
      <div
        ref={legendRef}
        className="w-[186px] px-2 py-1 bg-black/50 border border-white/10 rounded font-mono text-[9px] text-white/80 leading-[13px]"
        style={{ display: "none", textShadow: "1px 1px 0 #000" }}
      />
    </div>
  );
}
