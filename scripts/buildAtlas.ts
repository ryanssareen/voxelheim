import sharp from "sharp";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

const TILE = 16;
const COLS = 4;

type RGB = { r: number; g: number; b: number };

interface TextureDef {
  name: string;
  color: string;
  split?: { topColor: string; bottomColor: string };
  custom?: (buf: Buffer) => void;
}

const TEXTURES: TextureDef[] = [
  { name: "grass_top", color: "", custom: grassTop },
  { name: "grass_side", color: "", custom: grassSide },
  { name: "dirt", color: "", custom: dirtTexture },
  { name: "stone", color: "", custom: stoneTexture },
  { name: "sand", color: "", custom: sandTexture },
  { name: "log_side", color: "", custom: logSide },
  { name: "log_top", color: "", custom: logTop },
  { name: "leaves", color: "", custom: leavesTexture },
  { name: "crystal_shard", color: "", custom: crystalShard },
  { name: "planks", color: "", custom: planksTexture },
  { name: "crafting_table_top", color: "", custom: craftingTableTop },
  { name: "crafting_table_side", color: "", custom: craftingTableSide },
  { name: "furnace_top", color: "", custom: furnaceTop },
  { name: "furnace_side", color: "", custom: furnaceSide },
  { name: "iron_ore", color: "", custom: ironOre },
  { name: "diamond_ore", color: "", custom: diamondOre },
  { name: "lava", color: "", custom: lavaTexture },
  { name: "water", color: "", custom: waterTexture },
  { name: "snow", color: "", custom: snowTexture },
  { name: "ice", color: "", custom: iceTexture },
];


// Refined Minecraft-style 16x16 block textures.
//
// What changed vs. the previous generators:
//   1. Quantized palettes (4-6 discrete shades) instead of continuous +/- grain.
//      Minecraft tiles are built from a handful of hard-edged tones, never a smooth ramp.
//   2. Clumped noise (2-3px cells + fine detail) instead of pure per-pixel white noise,
//      so the surface reads as material at distance rather than dissolving into flat colour.
//   3. Wider value range (roughly 3x the old contrast) so faces stay legible under the
//      top/side/side face shading of the renderer.
//   4. Hand-placed detail (cracks, knots, ore blobs with darker outlines, plank grain)
//      layered on top of the noise field.

function hexToRGB(hex: string): RGB {
  const n = parseInt(hex.replace("#", ""), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function clampByte(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

function setPixel(buf: Buffer, x: number, y: number, c: RGB, a?: number): void {
  const i = (y * TILE + x) * 4;
  buf[i] = c.r; buf[i + 1] = c.g; buf[i + 2] = c.b; buf[i + 3] = a === undefined ? 255 : a;
}

function setHex(buf: Buffer, x: number, y: number, hex: string, a?: number): void {
  setPixel(buf, x, y, hexToRGB(hex), a);
}

function setAlpha(buf: Buffer, a: number): void {
  for (let i = 3; i < TILE * TILE * 4; i += 4) buf[i] = a;
}

/**
 * Non-directional per-pixel hash in [0,1). Linear `(x*a + y*b) % c` patterns
 * are constant along diagonals, so they read as diagonal stripes / moire when
 * a 16px tile repeats across a wall of blocks. A hash avoids that.
 */
function hash2(x: number, y: number, seed: number): number {
  let h = Math.imul(x + 1, 374761393) ^ Math.imul(y + 1, 668265263) ^ Math.imul(seed + 1, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

/** Blocky noise: a coarse cell value dominates, fine per-pixel detail breaks it up. */
function clump(x: number, y: number, seed: number, size: number): number {
  const cx = Math.floor(x / size);
  const cy = Math.floor(y / size);
  return hash2(cx, cy, seed) * 0.62 + hash2(x, y, seed + 911) * 0.38;
}

/** Pick a palette entry by noise value. Repeat entries in the array to weight them. */
function ramp<T>(pal: T[], t: number): T {
  return pal[Math.min(pal.length - 1, Math.floor(t * pal.length))];
}

/** Fill the tile from a weighted hex palette using clumped noise. */
function speckle(buf: Buffer, palHex: string[], seed: number, size: number): void {
  const pal = palHex.map(hexToRGB);
  for (let y = 0; y < TILE; y++)
    for (let x = 0; x < TILE; x++)
      setPixel(buf, x, y, ramp(pal, clump(x, y, seed, size)));
}

/** Scatter n pixels of `hex` where the noise threshold passes. */
function scatter(buf: Buffer, hex: string, seed: number, threshold: number): void {
  const c = hexToRGB(hex);
  for (let y = 0; y < TILE; y++)
    for (let x = 0; x < TILE; x++)
      if (hash2(x, y, seed) > threshold) setPixel(buf, x, y, c);
}

/** Draw a blob of ore: body colour, highlight pixel, darker rim on the lower-right. */
function blob(buf: Buffer, cells: number[][], bodyHex: string, hiHex: string, rimHex: string): void {
  const body = hexToRGB(bodyHex);
  const hi = hexToRGB(hiHex);
  const rim = hexToRGB(rimHex);
  for (const [x, y] of cells) {
    if (x < 0 || y < 0 || x > 15 || y > 15) continue;
    setPixel(buf, x, y, body);
  }
  for (const [x, y] of cells) {
    const rx = x + 1, ry = y + 1;
    const inside = cells.some(([a, b]) => a === rx && b === ry);
    if (!inside && rx < 16 && ry < 16) setPixel(buf, rx, ry, rim);
  }
  const [hx, hy] = cells[0];
  setPixel(buf, hx, hy, hi);
}

function shift(hex: string, d: number): string {
  const c = hexToRGB(hex);
  const r = clampByte(c.r + d), g = clampByte(c.g + d * 0.9), b = clampByte(c.b + d * 0.7);
  return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
}

// ---------------------------------------------------------------- terrain

const DIRT_PAL = ["#8b6a45", "#8b6a45", "#7c5c3b", "#96764e", "#6d5033", "#a3855c"];
const STONE_PAL = ["#7f7f7f", "#7f7f7f", "#888888", "#747474", "#909090", "#696969"];

function grassTop(buf: Buffer): void {
  speckle(buf, ["#5d9e4a", "#5d9e4a", "#6cae57", "#508c3e", "#79bb62", "#427a33"], 1, 2);
  scatter(buf, "#8ac96f", 7, 0.94);
  scatter(buf, "#3a6d2c", 9, 0.95);
}

function grassSide(buf: Buffer): void {
  speckle(buf, DIRT_PAL, 2, 2);
  // grass overhang: irregular 3-5px band with a hard dark bottom edge
  for (let x = 0; x < 16; x++) {
    const depth = 3 + (hash2(x, 0, 3) > 0.55 ? 1 : 0) + (hash2(x, 0, 13) > 0.85 ? 1 : 0);
    for (let y = 0; y < depth; y++) {
      const t = clump(x, y, 4, 2);
      setHex(buf, x, y, y === depth - 1 ? (t > 0.5 ? "#3f7530" : "#4a8639")
        : ramp(["#5d9e4a", "#5d9e4a", "#6cae57", "#508c3e", "#79bb62"], t));
    }
    if (hash2(x, 0, 5) > 0.62) setHex(buf, x, depth, "#4a8639");
  }
}

function dirtTexture(buf: Buffer): void {
  speckle(buf, DIRT_PAL, 6, 2);
  scatter(buf, "#5f4429", 14, 0.93);
  scatter(buf, "#ad8f65", 15, 0.94);
}

function stoneTexture(buf: Buffer): void {
  speckle(buf, STONE_PAL, 3, 2);
  // short hard cracks, the way Minecraft stone has a couple of dark runs
  const cracks = [[3, 3], [4, 3], [4, 4], [5, 4], [10, 8], [10, 9], [11, 9], [2, 12], [3, 12], [13, 5], [13, 6]];
  for (const [x, y] of cracks) setHex(buf, x, y, "#5e5e5e");
  scatter(buf, "#9c9c9c", 11, 0.95);
}

function sandTexture(buf: Buffer): void {
  speckle(buf, ["#dbcf8e", "#dbcf8e", "#e7dba2", "#cec07b", "#f0e7b5", "#c3b46f"], 4, 2);
  scatter(buf, "#fdf6cf", 12, 0.95);
  scatter(buf, "#b3a35f", 16, 0.95);
}

function snowTexture(buf: Buffer): void {
  speckle(buf, ["#f4f6fc", "#f4f6fc", "#f4f6fc", "#eaeef8", "#fdfeff", "#e0e6f2"], 60, 2);
  scatter(buf, "#d4dbea", 61, 0.94);
}

function iceTexture(buf: Buffer): void {
  speckle(buf, ["#93c8ec", "#93c8ec", "#a4d6f6", "#84badf", "#b6e2fb", "#76a9d1"], 62, 3);
  const cracks = [[2, 4], [3, 4], [4, 5], [9, 2], [9, 3], [10, 3], [6, 11], [7, 11], [8, 12], [12, 8], [13, 9]];
  for (const [x, y] of cracks) setHex(buf, x, y, "#d8f1ff");
  setAlpha(buf, 190);
}

function waterTexture(buf: Buffer): void {
  speckle(buf, ["#2f5fd0", "#2f5fd0", "#3a70e0", "#2a54bd", "#4d86ec", "#234aa8"], 63, 3);
  const crests = [[2, 3], [3, 3], [8, 6], [9, 6], [5, 11], [6, 11], [12, 13], [13, 8]];
  for (const [x, y] of crests) setHex(buf, x, y, "#7aa9f7");
  setAlpha(buf, 168);
}

function lavaTexture(buf: Buffer): void {
  speckle(buf, ["#d6480f", "#d6480f", "#e8681a", "#bb3a08", "#f5851f", "#9d2c05"], 64, 3);
  const hot = [[4, 4], [11, 3], [7, 8], [2, 12], [13, 10], [8, 14]];
  for (const [hx, hy] of hot) {
    setHex(buf, hx, hy, "#ffd24a");
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = hx + dx, y = hy + dy;
      if (x >= 0 && y >= 0 && x < 16 && y < 16) setHex(buf, x, y, "#ff9a28");
    }
  }
}

// ---------------------------------------------------------------- wood

function logSide(buf: Buffer): void {
  // vertical bark: per-column tone, then fine vertical streaking
  const pal = ["#6b5335", "#6b5335", "#7a6039", "#5b452b", "#87703f", "#4d3a23"].map(hexToRGB);
  for (let x = 0; x < 16; x++) {
    const col = hash2(Math.floor(x / 2), 0, 20) * 0.7 + hash2(x, 0, 21) * 0.3;
    const base = pal[Math.min(pal.length - 1, Math.floor(col * pal.length))];
    for (let y = 0; y < 16; y++) {
      const d = (hash2(x, Math.floor(y / 3), 22) - 0.5) * 2 * 9;
      setPixel(buf, x, y, { r: clampByte(base.r + d), g: clampByte(base.g + d), b: clampByte(base.b + d) });
    }
  }
  for (const [x, y] of [[5, 6], [5, 7], [10, 11], [11, 11], [2, 2]]) setHex(buf, x, y, "#3f2f1c");
}

function logTop(buf: Buffer): void {
  speckle(buf, ["#b39058", "#b39058", "#bd9b63", "#a8854e", "#c6a56e"], 23, 2);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const dx = x - 7.5, dy = y - 7.5;
      const rd = Math.round(Math.sqrt(dx * dx + dy * dy));
      if (rd === 3 || rd === 6) setHex(buf, x, y, hash2(x, y, 24) > 0.35 ? "#8e6f40" : "#9c7d4c");
    }
  }
  for (const [x, y] of [[7, 7], [8, 7], [7, 8], [8, 8]]) setHex(buf, x, y, "#7d6035");
}

function planksTexture(buf: Buffer): void {
  const bases = ["#b58c4f", "#a97f45", "#bf975a", "#b08a4a"];
  for (let y = 0; y < 16; y++) {
    const band = Math.floor(y / 4);
    const pal = [bases[band], bases[band], bases[band],
      shift(bases[band], 14), shift(bases[band], -16)];
    for (let x = 0; x < 16; x++) setHex(buf, x, y, ramp(pal, clump(x, y, 50 + band, 2)));
  }
  // grain streaks inside each plank
  for (let band = 0; band < 4; band++) {
    const y = band * 4 + (hash2(band, 0, 55) > 0.5 ? 1 : 2);
    for (let x = 0; x < 16; x++) if (hash2(x, band, 56) > 0.45) setHex(buf, x, y, shift(bases[band], -26));
  }
  for (let x = 0; x < 16; x++) {
    for (const y of [3, 7, 11, 15]) setHex(buf, x, y, "#71512a");
  }
  for (let y = 0; y < 3; y++) setHex(buf, 8, y, "#71512a");
  for (let y = 4; y < 7; y++) setHex(buf, 3, y, "#71512a");
  for (let y = 8; y < 11; y++) setHex(buf, 12, y, "#71512a");
  for (let y = 12; y < 15; y++) setHex(buf, 6, y, "#71512a");
}

function leavesTexture(buf: Buffer): void {
  speckle(buf, ["#4a8a34", "#4a8a34", "#3d7529", "#579b3f", "#2f5f20", "#63aa49"], 30, 2);
  scatter(buf, "#25491a", 31, 0.90);
  scatter(buf, "#79bd5b", 32, 0.93);
}

// ---------------------------------------------------------------- crafted

function craftingTableTop(buf: Buffer): void {
  speckle(buf, ["#b58c4f", "#b58c4f", "#a97f45", "#bf975a"], 70, 2);
  for (let i = 0; i < 16; i++) {
    setHex(buf, i, 0, "#71512a"); setHex(buf, i, 15, "#5e4322");
    setHex(buf, 0, i, "#71512a"); setHex(buf, 15, i, "#5e4322");
  }
  for (let i = 1; i < 15; i++) {
    setHex(buf, i, 1, "#c9a166");
    setHex(buf, 1, i, "#c9a166");
  }
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const cx = 3 + col * 4, cy = 3 + row * 4;
      for (let y = cy; y < cy + 3; y++)
        for (let x = cx; x < cx + 3; x++)
          setHex(buf, x, y, hash2(x, y, 71) > 0.55 ? "#8a4a2c" : "#7c4126");
      setHex(buf, cx, cy, "#a35c37");
      setHex(buf, cx + 2, cy + 2, "#6a3520");
    }
  }
}

function craftingTableSide(buf: Buffer): void {
  const bases = ["#b58c4f", "#a97f45", "#bf975a", "#b08a4a"];
  for (let y = 0; y < 16; y++) {
    const band = Math.floor(y / 4);
    for (let x = 0; x < 16; x++)
      setHex(buf, x, y, ramp([bases[band], bases[band], shift(bases[band], 12), shift(bases[band], -14)], clump(x, y, 72 + band, 2)));
  }
  for (let x = 0; x < 16; x++) { setHex(buf, x, 0, "#71512a"); setHex(buf, x, 15, "#5e4322"); }
  for (const y of [4, 8, 12]) for (let x = 0; x < 16; x++) setHex(buf, x, y, "#8a6636");
  // saw
  for (let y = 4; y < 13; y++) setHex(buf, 3, y, "#7b5228");
  for (let y = 3; y < 12; y++) setHex(buf, 4, y, "#c9c9d2");
  for (let y = 4; y < 11; y++) setHex(buf, 5, y, "#8e8e98");
  for (const y of [3, 5, 7, 9]) setHex(buf, 5, y, "#e2e2ea");
  // hammer
  for (let y = 6; y < 14; y++) setHex(buf, 11, y, "#7b5228");
  for (let y = 3; y < 6; y++) for (let x = 9; x < 14; x++) setHex(buf, x, y, "#6f6f79");
  for (let x = 10; x < 13; x++) setHex(buf, x, 4, "#b6b6c0");
  setHex(buf, 13, 5, "#4e4e56");
}

function furnaceTop(buf: Buffer): void {
  speckle(buf, ["#8a8a8a", "#8a8a8a", "#7b7b7b", "#979797", "#6e6e6e", "#a1a1a1"], 80, 2);
  for (let i = 0; i < 16; i++) {
    setHex(buf, i, 0, "#606060"); setHex(buf, i, 15, "#5a5a5a");
    setHex(buf, 0, i, "#606060"); setHex(buf, 15, i, "#5a5a5a");
  }
  // recessed circular mouth
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const dx = x - 7.5, dy = y - 7.5;
      const r = Math.sqrt(dx * dx + dy * dy);
      if (r < 3.2) setHex(buf, x, y, hash2(x, y, 81) > 0.6 ? "#454545" : "#3b3b3b");
      else if (r < 4.4) setHex(buf, x, y, hash2(x, y, 82) > 0.5 ? "#666666" : "#5c5c5c");
    }
  }
  setHex(buf, 6, 6, "#585858");
}

function furnaceSide(buf: Buffer): void {
  speckle(buf, ["#8a8a8a", "#8a8a8a", "#7b7b7b", "#979797", "#6e6e6e"], 83, 2);
  for (let x = 0; x < 16; x++) { setHex(buf, x, 0, "#606060"); setHex(buf, x, 15, "#5a5a5a"); }
  for (const y of [4, 8, 12]) for (let x = 0; x < 16; x++) setHex(buf, x, y, "#666666");
  for (let y = 1; y < 4; y++) setHex(buf, 7, y, "#666666");
  for (let y = 5; y < 8; y++) { setHex(buf, 3, y, "#666666"); setHex(buf, 11, y, "#666666"); }
  // mouth with fire
  for (let y = 9; y < 15; y++) for (let x = 4; x < 12; x++) setHex(buf, x, y, "#3b3b3b");
  for (let y = 10; y < 14; y++) for (let x = 5; x < 11; x++)
    setHex(buf, x, y, hash2(x, y, 84) > 0.55 ? "#e0621a" : "#c14a10");
  for (const [x, y] of [[7, 12], [8, 11], [6, 13], [9, 13]]) setHex(buf, x, y, "#ffb03a");
  setHex(buf, 8, 12, "#ffd76a");
  for (let x = 4; x < 12; x++) setHex(buf, x, 9, "#2e2e2e");
}

// ---------------------------------------------------------------- ores

function ironOre(buf: Buffer): void {
  speckle(buf, STONE_PAL, 3, 2);
  blob(buf, [[3, 3], [4, 3], [3, 4], [4, 4], [5, 4]], "#c69b6d", "#e0bb90", "#8d6a45");
  blob(buf, [[10, 5], [11, 5], [11, 6], [12, 6]], "#c69b6d", "#e0bb90", "#8d6a45");
  blob(buf, [[6, 9], [7, 9], [7, 10], [6, 10]], "#c69b6d", "#e0bb90", "#8d6a45");
  blob(buf, [[2, 12], [3, 12], [2, 13]], "#c69b6d", "#e0bb90", "#8d6a45");
  blob(buf, [[12, 11], [13, 11], [13, 12]], "#c69b6d", "#e0bb90", "#8d6a45");
}

function diamondOre(buf: Buffer): void {
  speckle(buf, STONE_PAL, 3, 2);
  const gem = (cx: number, cy: number): void => {
    for (const [dx, dy] of [[0, -1], [-1, 0], [0, 0], [1, 0], [0, 1]]) {
      const x = cx + dx, y = cy + dy;
      if (x >= 0 && y >= 0 && x < 16 && y < 16) setHex(buf, x, y, "#3ecfe0");
    }
    setHex(buf, cx, cy, "#8df1fa");
    if (cy + 2 < 16) setHex(buf, cx, cy + 2, "#1f8fa3");
    if (cx + 1 < 16 && cy + 1 < 16) setHex(buf, cx + 1, cy + 1, "#1f8fa3");
  };
  gem(4, 4); gem(11, 7); gem(4, 11); gem(12, 13);
}

function crystalShard(buf: Buffer): void {
  speckle(buf, ["#2fb6cf", "#2fb6cf", "#48cbe0", "#1e93ab", "#6fdcee", "#16788c"], 40, 2);
  const facets = [[3, 4], [4, 4], [4, 5], [11, 6], [11, 7], [12, 7], [7, 11], [8, 11], [8, 12]];
  for (const [x, y] of facets) setHex(buf, x, y, "#b3f0fa");
  for (const [x, y] of [[5, 9], [13, 13], [2, 13], [14, 3]]) setHex(buf, x, y, "#eaffff");
  scatter(buf, "#0f6274", 42, 0.93);
}

// ---------------------------------------------------------------- assembly

function solidTile(hex: string): Buffer {
  const { r, g, b } = hexToRGB(hex);
  const buf = Buffer.alloc(TILE * TILE * 4);
  for (let i = 0; i < TILE * TILE; i++) {
    buf[i * 4] = r;
    buf[i * 4 + 1] = g;
    buf[i * 4 + 2] = b;
    buf[i * 4 + 3] = 255;
  }
  return buf;
}

function splitTile(topHex: string, bottomHex: string): Buffer {
  const top = hexToRGB(topHex);
  const bot = hexToRGB(bottomHex);
  const buf = Buffer.alloc(TILE * TILE * 4);
  const half = TILE / 2;
  for (let y = 0; y < TILE; y++) {
    const c = y < half ? top : bot;
    for (let x = 0; x < TILE; x++) {
      const i = (y * TILE + x) * 4;
      buf[i] = c.r;
      buf[i + 1] = c.g;
      buf[i + 2] = c.b;
      buf[i + 3] = 255;
    }
  }
  return buf;
}

async function main() {
  const rows = Math.ceil(TEXTURES.length / COLS);
  const atlasW = COLS * TILE;
  const atlasH = rows * TILE;

  // Build atlas pixel buffer
  const atlasBuf = Buffer.alloc(atlasW * atlasH * 4);

  const uvs: Record<string, { u0: number; v0: number; u1: number; v1: number }> = {};

  for (let i = 0; i < TEXTURES.length; i++) {
    const tex = TEXTURES[i];
    const col = i % COLS;
    const row = Math.floor(i / COLS);

    let tile: Buffer;
    if (tex.custom) {
      tile = Buffer.alloc(TILE * TILE * 4);
      tex.custom(tile);
    } else if (tex.split) {
      tile = splitTile(tex.split.topColor, tex.split.bottomColor);
    } else {
      tile = solidTile(tex.color);
    }

    // Copy tile into atlas buffer
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        const srcIdx = (y * TILE + x) * 4;
        const dstIdx = ((row * TILE + y) * atlasW + (col * TILE + x)) * 4;
        atlasBuf[dstIdx] = tile[srcIdx];
        atlasBuf[dstIdx + 1] = tile[srcIdx + 1];
        atlasBuf[dstIdx + 2] = tile[srcIdx + 2];
        atlasBuf[dstIdx + 3] = tile[srcIdx + 3];
      }
    }

    uvs[tex.name] = {
      u0: (col * TILE) / atlasW,
      v0: (row * TILE) / atlasH,
      u1: ((col + 1) * TILE) / atlasW,
      v1: ((row + 1) * TILE) / atlasH,
    };
  }

  // Write atlas PNG
  const outDir = path.resolve(__dirname, "../public/textures");
  fs.mkdirSync(outDir, { recursive: true });
  await sharp(atlasBuf, { raw: { width: atlasW, height: atlasH, channels: 4 } })
    .png()
    .toFile(path.join(outDir, "atlas.png"));
  console.log(`Atlas written to public/textures/atlas.png (${atlasW}x${atlasH})`);

  // Compute content hash for cache busting
  const pngData = fs.readFileSync(path.join(outDir, "atlas.png"));
  const atlasHash = crypto.createHash("md5").update(pngData).digest("hex").slice(0, 8);

  // Write UV TypeScript file
  const uvFile = path.resolve(__dirname, "../src/data/atlasUVs.ts");
  const lines = [
    "/** Auto-generated by scripts/buildAtlas.ts. Do not edit manually. */",
    `export const ATLAS_HASH = "${atlasHash}";`,
    "export const ATLAS_UVS: Record<string, { u0: number; v0: number; u1: number; v1: number }> = {",
  ];
  for (const [name, rect] of Object.entries(uvs)) {
    lines.push(`  ${name}: { u0: ${rect.u0}, v0: ${rect.v0}, u1: ${rect.u1}, v1: ${rect.v1} },`);
  }
  lines.push("};");
  lines.push("");
  fs.writeFileSync(uvFile, lines.join("\n"));
  console.log(`UV data written to src/data/atlasUVs.ts (${Object.keys(uvs).length} entries)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
