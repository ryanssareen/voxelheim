import { describe, it, expect } from "vitest";
import { TerrainGenerator, type Biome } from "@engine/generation/TerrainGenerator";
import { StructureGenerator } from "@engine/generation/StructureGenerator";
import { Chunk } from "@engine/world/Chunk";
import { BLOCK_ID } from "@data/blocks";
import { chunkKey } from "@lib/coords";
import { CHUNK_SIZE } from "@engine/world/constants";

const SEED = "voxelheim-mvp";

describe("StructureGenerator cluster-noise tree placement", () => {
  it("decorateChunk is deterministic across two fresh generator instances", () => {
    const terrainA = new TerrainGenerator(SEED, "infinite");
    const structA = new StructureGenerator(SEED);
    const chunkA = terrainA.generateChunk(4, 2, -3);
    structA.decorateChunk(4, 2, -3, terrainA, chunkA);

    const terrainB = new TerrainGenerator(SEED, "infinite");
    const structB = new StructureGenerator(SEED);
    const chunkB = terrainB.generateChunk(4, 2, -3);
    structB.decorateChunk(4, 2, -3, terrainB, chunkB);

    expect(chunkA.getBlockData()).toEqual(chunkB.getBlockData());
  });

  it("treeChance is a pure, deterministic function of (wx, wz, biome)", () => {
    const struct1 = new StructureGenerator(SEED);
    const struct2 = new StructureGenerator(SEED);
    expect(struct1.treeChance(123, -456, "forest")).toBe(struct2.treeChance(123, -456, "forest"));
    expect(struct1.treeChance(0, 0, "plains")).toBe(struct1.treeChance(0, 0, "plains"));
  });

  it("desert columns always have zero tree chance", () => {
    const struct = new StructureGenerator(SEED);
    for (let i = 0; i < 200; i++) {
      expect(struct.treeChance(i * 37, -i * 53, "desert")).toBe(0);
    }
  });

  describe("density bands via actual decorateChunk output", () => {
    // Generate a grid of chunk columns (all 8 cy layers, decorated), count
    // LOG blocks whose local trunk base is a tree base (nothing LOG directly
    // below), and group by the centre-column biome.
    const STRIDE = 11;
    const HALF_N = 20; // 40x40 chunk columns
    const CY_LAYERS = 8;

    const terrainGen = new TerrainGenerator(SEED, "infinite");
    const structGen = new StructureGenerator(SEED);
    const treesByBiome: Record<Biome, number[]> = {
      plains: [],
      forest: [],
      desert: [],
      mountains: [],
      snowy: [],
    };

    for (let icx = 0; icx < HALF_N; icx++) {
      for (let icz = 0; icz < HALF_N; icz++) {
        const cx = (icx - HALF_N / 2) * STRIDE;
        const cz = (icz - HALF_N / 2) * STRIDE;
        const centerWx = cx * CHUNK_SIZE + 8;
        const centerWz = cz * CHUNK_SIZE + 8;
        const biome = terrainGen.getBiome(centerWx, centerWz);
        if (biome === "desert") continue;

        const chunks = new Map<string, Chunk>();
        const surfaceMap = new Map<string, number>();
        for (let cy = 0; cy < CY_LAYERS; cy++) {
          const chunk = terrainGen.generateChunk(cx, cy, cz, surfaceMap);
          chunks.set(chunkKey(cx, cy, cz), chunk);
        }
        for (let cy = 0; cy < CY_LAYERS; cy++) {
          const chunk = chunks.get(chunkKey(cx, cy, cz))!;
          structGen.decorateChunk(cx, cy, cz, terrainGen, chunk);
        }

        let trunkBaseCount = 0;
        for (let cy = 0; cy < CY_LAYERS; cy++) {
          const chunk = chunks.get(chunkKey(cx, cy, cz))!;
          for (let x = 0; x < CHUNK_SIZE; x++) {
            for (let z = 0; z < CHUNK_SIZE; z++) {
              for (let y = 0; y < CHUNK_SIZE; y++) {
                if (chunk.getBlock(x, y, z) !== BLOCK_ID.LOG) continue;
                const belowIsLog =
                  y > 0
                    ? chunk.getBlock(x, y - 1, z) === BLOCK_ID.LOG
                    : (chunks.get(chunkKey(cx, cy - 1, cz))?.getBlock(x, CHUNK_SIZE - 1, z) ?? BLOCK_ID.AIR) ===
                      BLOCK_ID.LOG;
                if (!belowIsLog) trunkBaseCount++;
              }
            }
          }
        }
        treesByBiome[biome].push(trunkBaseCount);
      }
    }

    const mean = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;

    it("forest mean is in [6, 16] trees per chunk column", () => {
      expect(treesByBiome.forest.length).toBeGreaterThan(50);
      expect(mean(treesByBiome.forest)).toBeGreaterThanOrEqual(6);
      expect(mean(treesByBiome.forest)).toBeLessThanOrEqual(16);
    });

    it("plains mean is in [1, 4] trees per chunk column", () => {
      expect(treesByBiome.plains.length).toBeGreaterThan(50);
      expect(mean(treesByBiome.plains)).toBeGreaterThanOrEqual(1);
      expect(mean(treesByBiome.plains)).toBeLessThanOrEqual(4);
    });

    it("mountains mean is in [1.5, 5] trees per chunk column", () => {
      expect(treesByBiome.mountains.length).toBeGreaterThan(20);
      expect(mean(treesByBiome.mountains)).toBeGreaterThanOrEqual(1.5);
      expect(mean(treesByBiome.mountains)).toBeLessThanOrEqual(5);
    });

    it("snowy mean is in [2.5, 7] trees per chunk column", () => {
      expect(treesByBiome.snowy.length).toBeGreaterThan(20);
      expect(mean(treesByBiome.snowy)).toBeGreaterThanOrEqual(2.5);
      expect(mean(treesByBiome.snowy)).toBeLessThanOrEqual(7);
    });

    it("forest is denser than plains by more than 2x (clustering has real structure, not noise)", () => {
      expect(mean(treesByBiome.forest)).toBeGreaterThan(2 * mean(treesByBiome.plains));
    });

    it("plains has a meaningful fraction of treeless chunk columns (20-35%)", () => {
      const treeless = treesByBiome.plains.filter((n) => n === 0).length;
      const frac = treeless / treesByBiome.plains.length;
      expect(frac).toBeGreaterThanOrEqual(0.2);
      expect(frac).toBeLessThanOrEqual(0.35);
    });
  }, 30000);

  describe("structure via treeChance (clearings and groves)", () => {
    it("forest: fraction of columns at floor chance (clearings) is in [0.15, 0.35]", () => {
      const struct = new StructureGenerator(SEED);
      let clearing = 0;
      const n = 10000;
      for (let i = 0; i < n; i++) {
        const wx = (i % 100) * 13 + 500000;
        const wz = Math.floor(i / 100) * 13 + 900000;
        if (struct.treeChance(wx, wz, "forest") <= 0.005) clearing++;
      }
      const frac = clearing / n;
      expect(frac).toBeGreaterThanOrEqual(0.15);
      expect(frac).toBeLessThanOrEqual(0.35);
    });

    it("plains: fraction of columns at grove (high) chance is in [0.05, 0.25]", () => {
      const struct = new StructureGenerator(SEED);
      let grove = 0;
      const n = 10000;
      for (let i = 0; i < n; i++) {
        const wx = (i % 100) * 13 + 100000;
        const wz = Math.floor(i / 100) * 13 + 200000;
        if (struct.treeChance(wx, wz, "plains") >= 0.05) grove++;
      }
      const frac = grove / n;
      expect(frac).toBeGreaterThanOrEqual(0.05);
      expect(frac).toBeLessThanOrEqual(0.25);
    });
  });
});
