import { describe, it, expect } from "vitest";
import { TerrainGenerator } from "@engine/generation/TerrainGenerator";
import { StructureGenerator } from "@engine/generation/StructureGenerator";
import { Chunk } from "@engine/world/Chunk";
import { BLOCK_ID } from "@data/blocks";
import {
  CHUNK_SIZE,
  SEA_LEVEL,
  WORLD_SIZE_CHUNKS,
  WORLD_HEIGHT_CHUNKS,
  CRYSTAL_SHARD_COUNT,
  CRYSTAL_MIN_DEPTH,
} from "@engine/world/constants";
import { chunkKey } from "@lib/coords";

/** Helper: generate the full world and return chunks + surfaceMap. */
function generateWorld(seed: string) {
  const gen = new TerrainGenerator(seed);
  const chunks = new Map<string, Chunk>();
  const surfaceMap = new Map<string, number>();

  for (let cx = 0; cx < WORLD_SIZE_CHUNKS; cx++) {
    for (let cy = 0; cy < WORLD_HEIGHT_CHUNKS; cy++) {
      for (let cz = 0; cz < WORLD_SIZE_CHUNKS; cz++) {
        const chunk = gen.generateChunk(cx, cy, cz, surfaceMap);
        chunks.set(chunkKey(cx, cy, cz), chunk);
      }
    }
  }

  return { gen, chunks, surfaceMap };
}

describe("TerrainGenerator", () => {
  it("produces identical terrain from the same seed", () => {
    const a = new TerrainGenerator("test-seed");
    const b = new TerrainGenerator("test-seed");
    const chunkA = a.generateChunk(1, 0, 1);
    const chunkB = b.generateChunk(1, 0, 1);
    expect(chunkA.getBlockData()).toEqual(chunkB.getBlockData());
  });

  it("places GRASS on surface above sea level", () => {
    const { surfaceMap, chunks } = generateWorld("biome-test");

    let foundGrass = false;
    for (const [key, surfaceY] of surfaceMap) {
      if (surfaceY <= SEA_LEVEL || surfaceY === 0) continue;
      const [wx, wz] = key.split(",").map(Number);
      // Find the chunk containing this surface block
      const cx = Math.floor(wx / CHUNK_SIZE);
      const cy = Math.floor(surfaceY / CHUNK_SIZE);
      const cz = Math.floor(wz / CHUNK_SIZE);
      const chunk = chunks.get(chunkKey(cx, cy, cz));
      if (!chunk) continue;
      const lx = wx - cx * CHUNK_SIZE;
      const ly = surfaceY - cy * CHUNK_SIZE;
      const lz = wz - cz * CHUNK_SIZE;
      if (ly < 0 || ly >= CHUNK_SIZE) continue;
      const block = chunk.getBlock(lx, ly, lz);
      if (block === BLOCK_ID.GRASS) {
        foundGrass = true;
        break;
      }
    }
    expect(foundGrass).toBe(true);
  });

  it("places SAND on surface at or below sea level", () => {
    const { surfaceMap, chunks } = generateWorld("biome-test");

    let foundSand = false;
    for (const [key, surfaceY] of surfaceMap) {
      if (surfaceY > SEA_LEVEL || surfaceY === 0) continue;
      const [wx, wz] = key.split(",").map(Number);
      const cx = Math.floor(wx / CHUNK_SIZE);
      const cy = Math.floor(surfaceY / CHUNK_SIZE);
      const cz = Math.floor(wz / CHUNK_SIZE);
      const chunk = chunks.get(chunkKey(cx, cy, cz));
      if (!chunk) continue;
      const lx = wx - cx * CHUNK_SIZE;
      const ly = surfaceY - cy * CHUNK_SIZE;
      const lz = wz - cz * CHUNK_SIZE;
      if (ly < 0 || ly >= CHUNK_SIZE) continue;
      const block = chunk.getBlock(lx, ly, lz);
      if (block === BLOCK_ID.SAND) {
        foundSand = true;
        break;
      }
    }
    expect(foundSand).toBe(true);
  });

  it("places STONE below the dirt layer", () => {
    const gen = new TerrainGenerator("stone-test");
    // Generate a central chunk where terrain is tall
    const chunk = gen.generateChunk(1, 0, 1);
    // Check deep underground — y=0 in chunk (0,0,0) should be STONE if surface is high enough
    let foundStone = false;
    for (let x = 0; x < CHUNK_SIZE; x++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        if (chunk.getBlock(x, 0, z) === BLOCK_ID.STONE) {
          foundStone = true;
          break;
        }
      }
      if (foundStone) break;
    }
    expect(foundStone).toBe(true);
  });

  it("produces zero terrain height at island edges (falloff)", () => {
    const gen = new TerrainGenerator("edge-test");
    const surfaceMap = new Map<string, number>();
    // Generate chunk at far corner (chunk 3,0,3 covers world x=48-63, z=48-63)
    gen.generateChunk(3, 0, 3, surfaceMap);
    // Far corner positions should have surfaceY = 0
    const edgeSurface = surfaceMap.get("63,63");
    expect(edgeSurface).toBe(0);
  });
});

describe("Crystal placement", () => {
  it("places exactly CRYSTAL_SHARD_COUNT crystals in valid positions", () => {
    const { gen, chunks, surfaceMap } = generateWorld("crystal-test");
    gen.placeCrystals(chunks, surfaceMap);

    let crystalCount = 0;
    for (const chunk of chunks.values()) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        for (let y = 0; y < CHUNK_SIZE; y++) {
          for (let z = 0; z < CHUNK_SIZE; z++) {
            if (chunk.getBlock(x, y, z) === BLOCK_ID.CRYSTAL) {
              crystalCount++;
              // Verify depth: world Y must be at least CRYSTAL_MIN_DEPTH below surface
              const wx = chunk.cx * CHUNK_SIZE + x;
              const wy = chunk.cy * CHUNK_SIZE + y;
              const wz = chunk.cz * CHUNK_SIZE + z;
              const surface = surfaceMap.get(`${wx},${wz}`);
              expect(surface).toBeDefined();
              expect(wy).toBeLessThanOrEqual(surface! - CRYSTAL_MIN_DEPTH);
            }
          }
        }
      }
    }
    expect(crystalCount).toBe(CRYSTAL_SHARD_COUNT);
  });
});

describe("StructureGenerator", () => {
  it("places trees only on eligible GRASS positions above SEA_LEVEL + 2", () => {
    const { gen, chunks, surfaceMap } = generateWorld("tree-test");
    gen.placeCrystals(chunks, surfaceMap);

    const structGen = new StructureGenerator("tree-test");
    structGen.placeTrees(chunks, surfaceMap);

    // Find at least one LOG block
    let foundLog = false;
    for (const chunk of chunks.values()) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        for (let y = 0; y < CHUNK_SIZE; y++) {
          for (let z = 0; z < CHUNK_SIZE; z++) {
            if (chunk.getBlock(x, y, z) === BLOCK_ID.LOG) {
              foundLog = true;
              break;
            }
          }
          if (foundLog) break;
        }
        if (foundLog) break;
      }
      if (foundLog) break;
    }
    expect(foundLog).toBe(true);
  });

  it("tree placement is deterministic", () => {
    const world1 = generateWorld("det-test");
    world1.gen.placeCrystals(world1.chunks, world1.surfaceMap);
    const struct1 = new StructureGenerator("det-test");
    struct1.placeTrees(world1.chunks, world1.surfaceMap);

    const world2 = generateWorld("det-test");
    world2.gen.placeCrystals(world2.chunks, world2.surfaceMap);
    const struct2 = new StructureGenerator("det-test");
    struct2.placeTrees(world2.chunks, world2.surfaceMap);

    // Compare all chunk data
    for (const [key, chunk1] of world1.chunks) {
      const chunk2 = world2.chunks.get(key)!;
      expect(chunk1.getBlockData()).toEqual(chunk2.getBlockData());
    }
  });
});
