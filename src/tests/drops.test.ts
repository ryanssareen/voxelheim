import { describe, it, expect, vi, beforeEach } from "vitest";
import * as THREE from "three";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import sharp from "sharp";
import { ItemDropManager } from "@engine/world/ItemDropManager";
import { TextureAtlas } from "@engine/renderer/TextureAtlas";
import { BLOCK_ID, BLOCK_DEFINITIONS, woodBlockIds } from "@data/blocks";
import { BLOCK_HEX_COLORS } from "@data/items";
import { ATLAS_UVS, ATLAS_HASH, ITEM_ATLAS_UVS, ITEM_ATLAS_HASH } from "@data/atlasUVs";
import { useHotbarStore } from "@store/useHotbarStore";
import { ChunkMeshBuilder } from "@engine/renderer/ChunkMeshBuilder";
import { Chunk } from "@engine/world/Chunk";
import { BlockRegistry } from "@engine/world/BlockRegistry";

const TEXTURES_DIR = path.resolve(__dirname, "../../public/textures");
const EPS = 1e-6;

function makeAtlas(): TextureAtlas {
  const atlas = new TextureAtlas();
  const block = new THREE.DataTexture(new Uint8Array(4), 1, 1);
  const items = new THREE.DataTexture(new Uint8Array(4), 1, 1);
  atlas.useTextures(block, items);
  return atlas;
}

function within(v: number, lo: number, hi: number): boolean {
  return v >= lo - EPS && v <= hi + EPS;
}

function uvWithin(u: number, v: number, rect: { u0: number; v0: number; u1: number; v1: number }): boolean {
  return within(u, rect.u0, rect.u1) && within(v, rect.v0, rect.v1);
}

/** Reads a PNG into a raw RGBA buffer plus its dimensions. */
async function readPng(file: string): Promise<{ data: Buffer; width: number; height: number }> {
  const { data, info } = await sharp(path.join(TEXTURES_DIR, file)).raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

function md5Of(file: string): string {
  const buf = fs.readFileSync(path.join(TEXTURES_DIR, file));
  return crypto.createHash("md5").update(buf).digest("hex").slice(0, 8);
}

describe("ItemDropManager — atlas-textured drops (F1)", () => {
  beforeEach(() => {
    useHotbarStore.getState().resetSlots();
  });

  it("LOG drop is an atlas-UV'd box using the shared block material", () => {
    const atlas = makeAtlas();
    const scene = new THREE.Scene();
    const mgr = new ItemDropManager(scene, atlas);

    mgr.spawnDrop(BLOCK_ID.LOG, 0, 0, 0);
    const mesh = scene.children[scene.children.length - 1] as THREE.Mesh;

    expect(mesh.geometry.type).toBe("BoxGeometry");
    const material = mesh.material as THREE.MeshLambertMaterial;
    expect(material).toBeInstanceOf(THREE.MeshLambertMaterial);
    expect(material.map).toBe(atlas.getTexture());
    expect(material.alphaTest).toBe(0.5);

    const pos = mesh.geometry.getAttribute("position");
    const uv = mesh.geometry.getAttribute("uv");
    const logTop = ATLAS_UVS.log_top;
    const logSide = ATLAS_UVS.log_side;

    // py group (top face): verts 8-11
    for (let i = 8; i < 12; i++) {
      expect(uvWithin(uv.getX(i), uv.getY(i), logTop)).toBe(true);
    }
    // ny group (bottom face): verts 12-15 — LOG's bottom texture is also log_top
    for (let i = 12; i < 16; i++) {
      expect(uvWithin(uv.getX(i), uv.getY(i), logTop)).toBe(true);
    }
    // side groups: px, nx, pz, nz — verts 0-7 and 16-23
    for (const i of [...range(0, 8), ...range(16, 24)]) {
      expect(uvWithin(uv.getX(i), uv.getY(i), logSide)).toBe(true);
      const y = pos.getY(i);
      if (y > 0) {
        expect(uv.getY(i)).toBeCloseTo(logSide.v0, 5);
      } else {
        expect(uv.getY(i)).toBeCloseTo(logSide.v1, 5);
      }
    }
  });

  it("STICK drop is a DoubleSide item quad using the shared item material", () => {
    const atlas = makeAtlas();
    const scene = new THREE.Scene();
    const mgr = new ItemDropManager(scene, atlas);

    mgr.spawnDrop(BLOCK_ID.STICK, 0, 0, 0);
    const mesh = scene.children[scene.children.length - 1] as THREE.Mesh;

    expect(mesh.geometry.type).toBe("PlaneGeometry");
    const material = mesh.material as THREE.MeshLambertMaterial;
    expect(material.side).toBe(THREE.DoubleSide);
    expect(material.map).toBe(atlas.getItemTexture());

    const uv = mesh.geometry.getAttribute("uv");
    const rect = ITEM_ATLAS_UVS[BLOCK_ID.STICK];
    for (let i = 0; i < 4; i++) {
      expect(uvWithin(uv.getX(i), uv.getY(i), rect)).toBe(true);
    }
  });

  it("unknown block id falls back to a colour box without throwing", () => {
    const atlas = makeAtlas();
    const scene = new THREE.Scene();
    const mgr = new ItemDropManager(scene, atlas);

    expect(() => mgr.spawnDrop(999, 0, 0, 0)).not.toThrow();
    const mesh = scene.children[scene.children.length - 1] as THREE.Mesh;
    expect(mesh.geometry.type).toBe("BoxGeometry");
    expect(mesh.material).toBeInstanceOf(THREE.MeshBasicMaterial);
  });

  it("two LOG drops share one material instance", () => {
    const atlas = makeAtlas();
    const scene = new THREE.Scene();
    const mgr = new ItemDropManager(scene, atlas);

    mgr.spawnDrop(BLOCK_ID.LOG, 0, 0, 0);
    const meshA = scene.children[scene.children.length - 1] as THREE.Mesh;
    mgr.spawnDrop(BLOCK_ID.LOG, 20, 20, 20);
    const meshB = scene.children[scene.children.length - 1] as THREE.Mesh;

    expect(meshA.material).toBe(meshB.material);
  });

  it("picking up one drop does not dispose the shared material other drops still use", () => {
    const atlas = makeAtlas();
    const scene = new THREE.Scene();
    const mgr = new ItemDropManager(scene, atlas);

    mgr.spawnDrop(BLOCK_ID.LOG, 5, 5, 5, 0);
    const meshA = scene.children[scene.children.length - 1] as THREE.Mesh;
    mgr.spawnDrop(BLOCK_ID.LOG, 50, 50, 50, 0);
    const meshB = scene.children[scene.children.length - 1] as THREE.Mesh;

    const material = meshA.material as THREE.Material;
    expect(meshB.material).toBe(material);
    const disposeSpy = vi.spyOn(material, "dispose");

    // Player stands right on top of drop A (spawned at grid 5,5,5 -> world ~5.5,5.5,5.5).
    mgr.update(0.001, { x: 5.5, y: 4.6, z: 5.5 });

    expect(scene.children.includes(meshA)).toBe(false);
    expect(disposeSpy).not.toHaveBeenCalled();
    expect(scene.children.includes(meshB)).toBe(true);
    expect((meshB.material as THREE.MeshLambertMaterial).map).toBe(atlas.getTexture());
  });

  it("with no atlas, drops still render as the original colour box (fallback regression guard)", () => {
    const scene = new THREE.Scene();
    const mgr = new ItemDropManager(scene);

    mgr.spawnDrop(BLOCK_ID.LOG, 0, 0, 0);
    const mesh = scene.children[scene.children.length - 1] as THREE.Mesh;

    expect(mesh.geometry.type).toBe("BoxGeometry");
    const material = mesh.material as THREE.MeshBasicMaterial;
    expect(material).toBeInstanceOf(THREE.MeshBasicMaterial);
    expect(material.color.getHex()).toBe(BLOCK_HEX_COLORS[BLOCK_ID.LOG]);
  });
});

function range(start: number, end: number): number[] {
  const out: number[] = [];
  for (let i = start; i < end; i++) out.push(i);
  return out;
}

describe("item icon sheet (F2)", () => {
  it("has exactly one UV rect per non-block item id, no more no less", () => {
    const expectedIds = BLOCK_DEFINITIONS.filter((b) => b.id !== 0 && b.textures.side === "")
      .map((b) => b.id)
      .sort((a, b) => a - b);
    const actualIds = Object.keys(ITEM_ATLAS_UVS)
      .map(Number)
      .sort((a, b) => a - b);
    expect(actualIds).toEqual(expectedIds);
  });

  it("every item rect is within [0,1] and 32px wide/tall on the actual sheet", async () => {
    const { width, height } = await readPng("items.png");
    for (const rect of Object.values(ITEM_ATLAS_UVS)) {
      expect(rect.u0).toBeGreaterThanOrEqual(0);
      expect(rect.v0).toBeGreaterThanOrEqual(0);
      expect(rect.u1).toBeLessThanOrEqual(1);
      expect(rect.v1).toBeLessThanOrEqual(1);
      expect((rect.u1 - rect.u0) * width).toBeCloseTo(32, 3);
      expect((rect.v1 - rect.v0) * height).toBeCloseTo(32, 3);
    }
  });

  it("STICK's icon tile has a plausible amount of opaque art (not blank, not solid-filled)", async () => {
    const { data, width, height } = await readPng("items.png");
    const rect = ITEM_ATLAS_UVS[BLOCK_ID.STICK];
    const x0 = Math.round(rect.u0 * width), y0 = Math.round(rect.v0 * height);
    const x1 = Math.round(rect.u1 * width), y1 = Math.round(rect.v1 * height);
    let opaque = 0;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = (y * width + x) * 4;
        if (data[i + 3] > 127) opaque++;
      }
    }
    expect(opaque).toBeGreaterThan(40);
    expect(opaque).toBeLessThan(1024);
  });

  it("items.png and atlas.png content hashes match the generated constants", () => {
    expect(md5Of("items.png")).toBe(ITEM_ATLAS_HASH);
    expect(md5Of("atlas.png")).toBe(ATLAS_HASH);
  });

  it("TextureAtlas.getItemUVs resolves item ids and returns null for block ids", () => {
    const atlas = new TextureAtlas();
    expect(atlas.getItemUVs(BLOCK_ID.STICK)).not.toBeNull();
    expect(atlas.getItemUVs(BLOCK_ID.LOG)).toBeNull();
  });

  it("useTextures installs textures without touching the network loader", () => {
    const atlas = new TextureAtlas();
    const block = new THREE.DataTexture(new Uint8Array(4), 1, 1);
    const items = new THREE.DataTexture(new Uint8Array(4), 1, 1);
    atlas.useTextures(block, items);
    expect(atlas.getTexture()).toBe(block);
    expect(atlas.getItemTexture()).toBe(items);
  });
});

/** Tile names of every leaves block: the only tiles allowed sub-threshold alpha. */
const CUTOUT_TILES = new Set(
  BLOCK_DEFINITIONS.filter((d) => d.wood?.part === "leaves").map((d) => d.textures.side)
);

describe("block atlas art (F3)", () => {
  it("leaves tile has clumped cutout holes covering 15-35% of the tile, with real colour variety", async () => {
    const { data, width, height } = await readPng("atlas.png");
    const rect = ATLAS_UVS.leaves;
    const x0 = Math.round(rect.u0 * width), y0 = Math.round(rect.v0 * height);
    const x1 = Math.round(rect.u1 * width), y1 = Math.round(rect.v1 * height);
    let below = 0, total = 0;
    const opaqueColors = new Set<string>();
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = (y * width + x) * 4;
        total++;
        if (data[i + 3] < 128) {
          below++;
        } else {
          opaqueColors.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
        }
      }
    }
    const frac = below / total;
    expect(frac).toBeGreaterThanOrEqual(0.15);
    expect(frac).toBeLessThanOrEqual(0.35);
    expect(opaqueColors.size).toBeGreaterThanOrEqual(5);
  });

  it("every other block tile is fully opaque — the leaves cutout is deliberate, not leaked", async () => {
    const { data, width, height } = await readPng("atlas.png");
    for (const [name, rect] of Object.entries(ATLAS_UVS)) {
      if (CUTOUT_TILES.has(name)) continue;
      const x0 = Math.round(rect.u0 * width), y0 = Math.round(rect.v0 * height);
      const x1 = Math.round(rect.u1 * width), y1 = Math.round(rect.v1 * height);
      let below = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          if (data[(y * width + x) * 4 + 3] < 128) below++;
        }
      }
      expect(below, `tile "${name}" has unexpected sub-threshold alpha pixels`).toBe(0);
    }
  });

  it("log_side has bark grooves across at least 4 distinct columns", async () => {
    const { data, width, height } = await readPng("atlas.png");
    const rect = ATLAS_UVS.log_side;
    const x0 = Math.round(rect.u0 * width), y0 = Math.round(rect.v0 * height);
    const cols = new Set<number>();
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const i = ((y0 + y) * width + (x0 + x)) * 4;
        if (data[i] === 0x3f && data[i + 1] === 0x2f && data[i + 2] === 0x1c) cols.add(x);
      }
    }
    expect(cols.size).toBeGreaterThanOrEqual(4);
  });

  it("planks keeps the board seam colour on the four seam rows", async () => {
    const { data, width, height } = await readPng("atlas.png");
    const rect = ATLAS_UVS.planks;
    const x0 = Math.round(rect.u0 * width), y0 = Math.round(rect.v0 * height);
    for (const y of [3, 7, 11, 15]) {
      for (let x = 0; x < 16; x++) {
        const i = ((y0 + y) * width + (x0 + x)) * 4;
        expect(data[i]).toBe(0x71);
        expect(data[i + 1]).toBe(0x51);
        expect(data[i + 2]).toBe(0x2a);
      }
    }
  });
});

describe("atlas <-> mesh builder integrity (F4 guard, complements ChunkMeshBuilder.test.ts)", () => {
  it("every block face texture name used in BLOCK_DEFINITIONS has an ATLAS_UVS rect", () => {
    for (const def of BLOCK_DEFINITIONS) {
      for (const face of ["top", "bottom", "side"] as const) {
        const name = def.textures[face];
        if (name === "") continue;
        expect(ATLAS_UVS[name], `missing ATLAS_UVS entry for "${name}" (block ${def.name})`).toBeDefined();
      }
    }
  });

  it("every ATLAS_UVS rect is exactly one 16px tile of a 4-column sheet", () => {
    const cols = 4;
    const rows = Math.ceil(Object.keys(ATLAS_UVS).length / cols);
    for (const [name, rect] of Object.entries(ATLAS_UVS)) {
      expect(rect.u1 - rect.u0, name).toBeCloseTo(1 / cols, 5);
      expect(rect.v1 - rect.v0, name).toBeCloseTo(1 / rows, 5);
    }
  });

  it("two adjacent LEAVES blocks emit all 12 faces (no culling between transparent neighbours)", () => {
    const registry = BlockRegistry.getInstance();
    const chunk = new Chunk(0, 0, 0);
    chunk.setBlock(5, 5, 5, BLOCK_ID.LEAVES);
    chunk.setBlock(6, 5, 5, BLOCK_ID.LEAVES);

    const result = ChunkMeshBuilder.buildMesh(chunk, {}, registry);

    expect(result.vertexCount).toBe(48);
    expect(result.indexCount).toBe(72);
  });
});

async function tileMeanColour(name: string): Promise<{ r: number; g: number; b: number; holeFrac: number }> {
  const { data, width, height } = await readPng("atlas.png");
  const rect = ATLAS_UVS[name];
  const x0 = Math.round(rect.u0 * width), y0 = Math.round(rect.v0 * height);
  const x1 = Math.round(rect.u1 * width), y1 = Math.round(rect.v1 * height);
  let r = 0, g = 0, b = 0, n = 0, below = 0, total = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * width + x) * 4;
      total++;
      if (data[i + 3] < 128) { below++; continue; }
      r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
    }
  }
  return { r: r / n, g: g / n, b: b / n, holeFrac: below / total };
}

describe("wood species palettes (F5)", () => {
  it("birch bark is lighter than oak, spruce bark is darker than oak", async () => {
    const oak = await tileMeanColour("log_side");
    const birch = await tileMeanColour("birch_log_side");
    const spruce = await tileMeanColour("spruce_log_side");
    const lum = (c: { r: number; g: number; b: number }) => (c.r + c.g + c.b) / 3;
    expect(lum(birch)).toBeGreaterThan(lum(oak));
    expect(lum(oak)).toBeGreaterThan(lum(spruce));
  });

  it("every species' leaves tile has 15-35% cutout holes", async () => {
    for (const name of ["leaves", "birch_leaves", "spruce_leaves"]) {
      const { holeFrac } = await tileMeanColour(name);
      expect(holeFrac, name).toBeGreaterThanOrEqual(0.15);
      expect(holeFrac, name).toBeLessThanOrEqual(0.35);
    }
  });

  it("the three planks tiles have pairwise distinct mean colour", async () => {
    const oak = await tileMeanColour("planks");
    const birch = await tileMeanColour("birch_planks");
    const spruce = await tileMeanColour("spruce_planks");
    const dist = (a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }) =>
      Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
    expect(dist(oak, birch)).toBeGreaterThan(15);
    expect(dist(oak, spruce)).toBeGreaterThan(15);
    expect(dist(birch, spruce)).toBeGreaterThan(15);
  });

  it("every wood block's texture names resolve to atlas UV rects", () => {
    for (const id of woodBlockIds()) {
      const def = BLOCK_DEFINITIONS[id];
      for (const face of ["top", "bottom", "side"] as const) {
        const name = def.textures[face];
        expect(ATLAS_UVS[name], `${def.name} ${face} -> "${name}"`).toBeDefined();
      }
    }
  });
});
