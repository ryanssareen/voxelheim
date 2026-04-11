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
  { name: "grass_top", color: "#4CAF50" },
  { name: "grass_side", color: "", split: { topColor: "#4CAF50", bottomColor: "#8D6E63" } },
  { name: "dirt", color: "#8D6E63" },
  { name: "stone", color: "#9E9E9E" },
  { name: "sand", color: "#FDD835" },
  { name: "log_side", color: "#5D4037" },
  { name: "log_top", color: "#D7CCC8" },
  { name: "leaves", color: "#2E7D32" },
  { name: "crystal_shard", color: "#00E5FF" },
  { name: "planks", color: "#C8A55A" },
  { name: "crafting_table_top", color: "", custom: craftingTableTop },
  { name: "crafting_table_side", color: "", custom: craftingTableSide },
  { name: "furnace_top", color: "", custom: furnaceTop },
  { name: "furnace_side", color: "", custom: furnaceSide },
];

function hexToRGB(hex: string): RGB {
  const n = parseInt(hex.replace("#", ""), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function setPixel(buf: Buffer, x: number, y: number, c: RGB): void {
  const i = (y * TILE + x) * 4;
  buf[i] = c.r; buf[i + 1] = c.g; buf[i + 2] = c.b; buf[i + 3] = 255;
}

function fillRect(buf: Buffer, x0: number, y0: number, w: number, h: number, c: RGB): void {
  for (let y = y0; y < y0 + h; y++)
    for (let x = x0; x < x0 + w; x++)
      setPixel(buf, x, y, c);
}

function craftingTableTop(buf: Buffer): void {
  const darkWood: RGB = { r: 139, g: 90, b: 43 };
  const medWood: RGB = { r: 180, g: 130, b: 70 };
  const lightWood: RGB = { r: 200, g: 155, b: 95 };
  const gridDark: RGB = { r: 140, g: 60, b: 40 };
  const gridLight: RGB = { r: 180, g: 80, b: 50 };
  const border: RGB = { r: 100, g: 65, b: 30 };

  // Fill with medium wood
  fillRect(buf, 0, 0, 16, 16, medWood);

  // Dark border (1px all around)
  for (let i = 0; i < 16; i++) {
    setPixel(buf, i, 0, border);
    setPixel(buf, i, 15, border);
    setPixel(buf, 0, i, border);
    setPixel(buf, 15, i, border);
  }

  // Light wood inner border
  for (let i = 1; i < 15; i++) {
    setPixel(buf, i, 1, lightWood);
    setPixel(buf, i, 14, lightWood);
    setPixel(buf, 1, i, lightWood);
    setPixel(buf, 14, i, lightWood);
  }

  // Dark wood corners
  fillRect(buf, 1, 1, 2, 2, darkWood);
  fillRect(buf, 13, 1, 2, 2, darkWood);
  fillRect(buf, 1, 13, 2, 2, darkWood);
  fillRect(buf, 13, 13, 2, 2, darkWood);

  // 3x3 crafting grid in center (cells at 4,5,6,7 / 8,9,10,11 pattern)
  const gridStart = 3;
  const cellSize = 3;
  const gap = 1;
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const cx = gridStart + col * (cellSize + gap);
      const cy = gridStart + row * (cellSize + gap);
      fillRect(buf, cx, cy, cellSize, cellSize, gridDark);
      // Lighter inner pixel
      setPixel(buf, cx + 1, cy + 1, gridLight);
    }
  }
}

function craftingTableSide(buf: Buffer): void {
  const plankLight: RGB = { r: 200, g: 155, b: 95 };
  const plankMed: RGB = { r: 180, g: 130, b: 70 };
  const plankDark: RGB = { r: 139, g: 90, b: 43 };
  const border: RGB = { r: 100, g: 65, b: 30 };
  const toolDark: RGB = { r: 80, g: 80, b: 80 };
  const toolLight: RGB = { r: 160, g: 160, b: 160 };
  const handleColor: RGB = { r: 120, g: 80, b: 40 };

  // Fill with plank pattern (horizontal bands)
  for (let y = 0; y < 16; y++) {
    const band = y % 4;
    const c = band === 0 ? plankDark : band === 3 ? plankLight : plankMed;
    for (let x = 0; x < 16; x++) setPixel(buf, x, y, c);
  }

  // Dark border top and bottom
  for (let x = 0; x < 16; x++) {
    setPixel(buf, x, 0, border);
    setPixel(buf, x, 15, border);
  }

  // Saw tool on left side
  // Handle (vertical stick)
  for (let y = 4; y < 13; y++) setPixel(buf, 3, y, handleColor);
  // Blade
  for (let y = 3; y < 12; y++) setPixel(buf, 4, y, toolLight);
  for (let y = 4; y < 11; y++) setPixel(buf, 5, y, toolDark);
  // Teeth
  setPixel(buf, 5, 3, toolLight);
  setPixel(buf, 5, 5, toolLight);
  setPixel(buf, 5, 7, toolLight);
  setPixel(buf, 5, 9, toolLight);

  // Hammer on right side
  // Handle
  for (let y = 6; y < 14; y++) setPixel(buf, 11, y, handleColor);
  // Head
  fillRect(buf, 9, 3, 5, 3, toolDark);
  fillRect(buf, 10, 4, 3, 1, toolLight);
}

function furnaceTop(buf: Buffer): void {
  const stoneLight: RGB = { r: 170, g: 170, b: 170 };
  const stoneMed: RGB = { r: 145, g: 145, b: 145 };
  const stoneDark: RGB = { r: 120, g: 120, b: 120 };
  const border: RGB = { r: 90, g: 90, b: 90 };

  // Fill with medium stone
  fillRect(buf, 0, 0, 16, 16, stoneMed);

  // Dark border
  for (let i = 0; i < 16; i++) {
    setPixel(buf, i, 0, border);
    setPixel(buf, i, 15, border);
    setPixel(buf, 0, i, border);
    setPixel(buf, 15, i, border);
  }

  // Inner grate pattern (dark cross)
  for (let i = 2; i < 14; i++) {
    setPixel(buf, i, 7, stoneDark);
    setPixel(buf, i, 8, stoneDark);
    setPixel(buf, 7, i, stoneDark);
    setPixel(buf, 8, i, stoneDark);
  }

  // Light highlights on corners
  fillRect(buf, 2, 2, 4, 4, stoneLight);
  fillRect(buf, 10, 2, 4, 4, stoneLight);
  fillRect(buf, 2, 10, 4, 4, stoneLight);
  fillRect(buf, 10, 10, 4, 4, stoneLight);
}

function furnaceSide(buf: Buffer): void {
  const stoneLight: RGB = { r: 170, g: 170, b: 170 };
  const stoneMed: RGB = { r: 145, g: 145, b: 145 };
  const stoneDark: RGB = { r: 120, g: 120, b: 120 };
  const border: RGB = { r: 90, g: 90, b: 90 };
  const fireDark: RGB = { r: 180, g: 80, b: 20 };
  const fireLight: RGB = { r: 255, g: 160, b: 40 };

  // Fill with medium stone
  fillRect(buf, 0, 0, 16, 16, stoneMed);

  // Dark border top and bottom
  for (let i = 0; i < 16; i++) {
    setPixel(buf, i, 0, border);
    setPixel(buf, i, 15, border);
  }

  // Stone brick pattern (horizontal lines)
  for (let x = 0; x < 16; x++) {
    setPixel(buf, x, 4, stoneDark);
    setPixel(buf, x, 8, stoneDark);
    setPixel(buf, x, 12, stoneDark);
  }
  // Vertical mortar lines (offset per row)
  for (let y = 0; y < 4; y++) setPixel(buf, 7, y + 1, stoneDark);
  for (let y = 4; y < 8; y++) setPixel(buf, 3, y + 1, stoneDark);
  for (let y = 4; y < 8; y++) setPixel(buf, 11, y + 1, stoneDark);

  // Light accents
  setPixel(buf, 1, 1, stoneLight);
  setPixel(buf, 9, 1, stoneLight);
  setPixel(buf, 5, 5, stoneLight);
  setPixel(buf, 13, 5, stoneLight);

  // Furnace opening (fire glow) in lower center
  fillRect(buf, 5, 9, 6, 5, stoneDark);
  fillRect(buf, 6, 10, 4, 4, fireDark);
  fillRect(buf, 7, 11, 2, 2, fireLight);
  setPixel(buf, 7, 13, fireDark);
  setPixel(buf, 8, 12, fireLight);
}

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
