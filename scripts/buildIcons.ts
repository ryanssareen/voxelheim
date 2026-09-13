/**
 * Generates the PWA / home-screen icon set into public/icons/.
 *
 * Run: npx tsx scripts/buildIcons.ts
 *
 * Add-to-Home-Screen is one of the three ways Voxelheim reaches fullscreen on
 * a phone (the others being the Fullscreen API and Safari's toolbar collapse),
 * and iOS falls back to a blurry page screenshot when no icon is declared.
 *
 * "maskable" gets the cube scaled into the inner 80% so Android's adaptive
 * shape mask cannot clip it; "any" is drawn full-bleed.
 */
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, "../public/icons");

const BG = "#14120F";
const GRASS = "#6BA644";
const GRASS_EDGE = "#5A8F37";
const DIRT_LIT = "#8A5F3B";
const DIRT_SHADE = "#6B4A2C";

/** An isometric grass block, centred in a 512 box, scaled about its centre. */
function cubeSvg(scale: number): string {
  const c = 256;
  const W = 150 * scale;
  const H = 150 * scale;
  const pt = (x: number, y: number) => `${c + x},${c + y}`;

  const top = [pt(0, -H), pt(W, -H / 2), pt(0, 0), pt(-W, -H / 2)].join(" ");
  const left = [pt(-W, -H / 2), pt(0, 0), pt(0, H), pt(-W, H / 2)].join(" ");
  const right = [pt(0, 0), pt(W, -H / 2), pt(W, H / 2), pt(0, H)].join(" ");
  const edgeL = [pt(-W, -H / 2), pt(0, 0), pt(0, H * 0.18), pt(-W, -H / 2 + H * 0.18)].join(" ");
  const edgeR = [pt(0, 0), pt(W, -H / 2), pt(W, -H / 2 + H * 0.18), pt(0, H * 0.18)].join(" ");

  return `
    <polygon points="${left}"  fill="${DIRT_SHADE}"/>
    <polygon points="${right}" fill="${DIRT_LIT}"/>
    <polygon points="${edgeL}" fill="${GRASS_EDGE}"/>
    <polygon points="${edgeR}" fill="${GRASS_EDGE}"/>
    <polygon points="${top}"   fill="${GRASS}"/>
  `;
}

function iconSvg(scale: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
    <rect width="512" height="512" fill="${BG}"/>
    ${cubeSvg(scale)}
  </svg>`;
}

async function write(name: string, size: number, scale: number) {
  await sharp(Buffer.from(iconSvg(scale)))
    .resize(size, size, { kernel: "nearest" })
    .png()
    .toFile(path.join(OUT_DIR, name));
  console.log(`public/icons/${name} (${size}x${size})`);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  await write("icon-192.png", 192, 1);
  await write("icon-512.png", 512, 1);
  await write("icon-maskable-512.png", 512, 0.72);
  await write("apple-touch-icon.png", 180, 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
