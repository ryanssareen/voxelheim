import { describe, it, expect } from "vitest";
import { TerrainGenerator, type Biome } from "@engine/generation/TerrainGenerator";
import { StructureGenerator } from "@engine/generation/StructureGenerator";
import { Chunk } from "@engine/world/Chunk";
import { BLOCK_ID, getWoodBlockId, woodBlockIds } from "@data/blocks";
import { chunkKey } from "@lib/coords";
import {
  CHUNK_SIZE,
  WORLD_SIZE_CHUNKS,
  WORLD_HEIGHT_CHUNKS,
} from "@engine/world/constants";

const SEED = "voxelheim-mvp";

const LOG_IDS = new Set(woodBlockIds("log"));
const OAK_LOG = getWoodBlockId("oak", "log");
const BIRCH_LOG = getWoodBlockId("birch", "log");
const SPRUCE_LOG = getWoodBlockId("spruce", "log");

describe("StructureGenerator.treeSpecies", () => {
  it("is a pure, deterministic function of (seed, wx, wz, biome) across fresh instances", () => {
    const a = new StructureGenerator(SEED);
    const b = new StructureGenerator(SEED);
    const biomes: Biome[] = ["forest", "plains", "mountains", "snowy", "desert"];
    for (let i = 0; i < 500; i++) {
      const wx = i * 17 - 4000;
      const wz = i * 23 + 1000;
      for (const biome of biomes) {
        expect(a.treeSpecies(wx, wz, biome)).toBe(b.treeSpecies(wx, wz, biome));
      }
      // island path (no biome argument)
      expect(a.treeSpecies(wx, wz)).toBe(b.treeSpecies(wx, wz));
    }
  });

  describe("per-biome species shares (raw column sampling against real getBiome)", () => {
    // Cheap: no chunk generation, just noise field evaluation. treeSpecies()
    // is a pure function of (wx, wz, biome) independent of whether a tree is
    // actually placed at that column (that's treeChance's job), so sampling
    // every column on a grid and bucketing by the real biome is a fast,
    // faithful proxy for the species mix real placed trees would show.
    const GRID_N = 200;
    const SPACING = 13;

    const terrainGen = new TerrainGenerator(SEED, "infinite");
    const struct = new StructureGenerator(SEED);

    const tally: Record<Biome, Record<string, number>> = {
      forest: {},
      plains: {},
      desert: {},
      mountains: {},
      snowy: {},
    };

    for (let i = 0; i < GRID_N; i++) {
      for (let j = 0; j < GRID_N; j++) {
        const wx = (i - GRID_N / 2) * SPACING;
        const wz = (j - GRID_N / 2) * SPACING;
        const biome = terrainGen.getBiome(wx, wz);
        const species = struct.treeSpecies(wx, wz, biome);
        tally[biome][species] = (tally[biome][species] ?? 0) + 1;
      }
    }

    function total(biome: Biome): number {
      return Object.values(tally[biome]).reduce((a, b) => a + b, 0);
    }

    function share(biome: Biome, species: string): number {
      return (tally[biome][species] ?? 0) / total(biome);
    }

    it("forest: oak share in [0.60, 0.85], birch share in [0.15, 0.40], sampled over >= 500 columns", () => {
      expect(total("forest")).toBeGreaterThanOrEqual(500);
      expect(share("forest", "oak")).toBeGreaterThanOrEqual(0.60);
      expect(share("forest", "oak")).toBeLessThanOrEqual(0.85);
      expect(share("forest", "birch")).toBeGreaterThanOrEqual(0.15);
      expect(share("forest", "birch")).toBeLessThanOrEqual(0.40);
    });

    it("plains: oak share is 1 (single-species biome), sampled over >= 500 columns", () => {
      expect(total("plains")).toBeGreaterThanOrEqual(500);
      expect(share("plains", "oak")).toBe(1);
    });

    it("snowy: spruce share is 1 (single-species biome), sampled over >= 500 columns", () => {
      expect(total("snowy")).toBeGreaterThanOrEqual(500);
      expect(share("snowy", "spruce")).toBe(1);
    });

    it("mountains: spruce share in [0.45, 0.80], sampled over >= 500 columns", () => {
      expect(total("mountains")).toBeGreaterThanOrEqual(500);
      expect(share("mountains", "spruce")).toBeGreaterThanOrEqual(0.45);
      expect(share("mountains", "spruce")).toBeLessThanOrEqual(0.80);
    });
  });

  describe("island tree species (placeTrees, no biome)", () => {
    it("oak share is >= 0.75 and spruce never appears (ISLAND_WOOD has no spruce entry)", () => {
      const gen = new TerrainGenerator(SEED, "island");
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

      const structGen = new StructureGenerator(SEED);
      structGen.placeTrees(chunks, surfaceMap);

      const counts: Record<string, number> = { oak: 0, birch: 0, spruce: 0, unknown: 0 };
      for (const chunk of chunks.values()) {
        for (let x = 0; x < CHUNK_SIZE; x++) {
          for (let z = 0; z < CHUNK_SIZE; z++) {
            for (let y = 0; y < CHUNK_SIZE; y++) {
              const id = chunk.getBlock(x, y, z);
              if (!LOG_IDS.has(id)) continue;
              const belowIsLog =
                y > 0
                  ? LOG_IDS.has(chunk.getBlock(x, y - 1, z))
                  : LOG_IDS.has(
                      chunks.get(chunkKey(chunk.cx, chunk.cy - 1, chunk.cz))?.getBlock(x, CHUNK_SIZE - 1, z) ??
                        BLOCK_ID.AIR
                    );
              if (belowIsLog) continue; // not a trunk base
              if (id === OAK_LOG) counts.oak++;
              else if (id === BIRCH_LOG) counts.birch++;
              else if (id === SPRUCE_LOG) counts.spruce++;
              else counts.unknown++;
            }
          }
        }
      }

      const totalTrees = counts.oak + counts.birch + counts.spruce + counts.unknown;
      expect(totalTrees).toBeGreaterThan(20);
      expect(counts.spruce).toBe(0);
      expect(counts.unknown).toBe(0);
      expect(counts.oak / totalTrees).toBeGreaterThanOrEqual(0.75);
    });
  });

  describe("trunk shape by species", () => {
    it("spruce trunks are taller on average than oak trunks", () => {
      const terrainGen = new TerrainGenerator(SEED, "infinite");
      const structGen = new StructureGenerator(SEED);

      const STRIDE = 11;
      const HALF_N = 20; // 40x40 chunk columns, mirrors treeClusters.test.ts's density grid
      const CY_LAYERS = 8;

      const oakHeights: number[] = [];
      const spruceHeights: number[] = [];

      for (let icx = 0; icx < HALF_N; icx++) {
        for (let icz = 0; icz < HALF_N; icz++) {
          const cx = (icx - HALF_N / 2) * STRIDE;
          const cz = (icz - HALF_N / 2) * STRIDE;

          const chunks = new Map<string, Chunk>();
          for (let cy = 0; cy < CY_LAYERS; cy++) {
            chunks.set(chunkKey(cx, cy, cz), terrainGen.generateChunk(cx, cy, cz));
          }
          for (let cy = 0; cy < CY_LAYERS; cy++) {
            structGen.decorateChunk(cx, cy, cz, terrainGen, chunks.get(chunkKey(cx, cy, cz))!);
          }

          for (let x = 0; x < CHUNK_SIZE; x++) {
            for (let z = 0; z < CHUNK_SIZE; z++) {
              for (let cy = 0; cy < CY_LAYERS; cy++) {
                const chunk = chunks.get(chunkKey(cx, cy, cz))!;
                for (let y = 0; y < CHUNK_SIZE; y++) {
                  const id = chunk.getBlock(x, y, z);
                  if (id !== OAK_LOG && id !== SPRUCE_LOG) continue;

                  const belowIsSame =
                    y > 0
                      ? chunk.getBlock(x, y - 1, z) === id
                      : chunks.get(chunkKey(cx, cy - 1, cz))?.getBlock(x, CHUNK_SIZE - 1, z) === id;
                  if (belowIsSame) continue; // not a trunk base; already counted from below

                  // Walk upward counting consecutive blocks of the same species id.
                  let height = 0;
                  let gy = cy * CHUNK_SIZE + y;
                  const maxGy = CY_LAYERS * CHUNK_SIZE;
                  while (gy < maxGy) {
                    const gcy = Math.floor(gy / CHUNK_SIZE);
                    const gly = gy - gcy * CHUNK_SIZE;
                    const c = chunks.get(chunkKey(cx, gcy, cz));
                    if (!c || c.getBlock(x, gly, z) !== id) break;
                    height++;
                    gy++;
                  }

                  if (id === OAK_LOG) oakHeights.push(height);
                  else spruceHeights.push(height);
                }
              }
            }
          }
        }
      }

      expect(oakHeights.length).toBeGreaterThan(20);
      expect(spruceHeights.length).toBeGreaterThan(20);

      const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
      expect(avg(spruceHeights)).toBeGreaterThan(avg(oakHeights));
    }, 30000);
  });
});
