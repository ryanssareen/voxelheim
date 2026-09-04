import { describe, it, expect } from "vitest";
import { TerrainGenerator, type Biome } from "@engine/generation/TerrainGenerator";
import { chunkKey } from "@lib/coords";

const SEEDS = ["voxelheim-mvp", "abc123", "zz9plural"];
const ALL_BIOMES: Biome[] = ["plains", "forest", "desert", "mountains", "snowy"];

/** Samples a 100x100 grid of columns at stride 97 (10,000 columns spanning ~9700 blocks). */
function sampleBiomes(gen: TerrainGenerator): Record<Biome, number> {
  const counts: Record<Biome, number> = { plains: 0, forest: 0, desert: 0, mountains: 0, snowy: 0 };
  for (let ix = 0; ix < 100; ix++) {
    for (let iz = 0; iz < 100; iz++) {
      const wx = (ix - 50) * 97;
      const wz = (iz - 50) * 97;
      counts[gen.getBiome(wx, wz)]++;
    }
  }
  return counts;
}

describe("getBiome distribution (infinite worlds)", () => {
  for (const seed of SEEDS) {
    it(`bands are balanced for seed "${seed}"`, () => {
      const gen = new TerrainGenerator(seed, "infinite");
      const counts = sampleBiomes(gen);
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      expect(total).toBe(10000);

      const share = (b: Biome) => counts[b] / total;

      // Every biome must actually appear.
      for (const biome of ALL_BIOMES) {
        expect(counts[biome]).toBeGreaterThan(0);
      }

      expect(share("plains")).toBeGreaterThanOrEqual(0.22);
      expect(share("plains")).toBeLessThanOrEqual(0.36);

      expect(share("forest")).toBeGreaterThanOrEqual(0.22);
      expect(share("forest")).toBeLessThanOrEqual(0.38);

      expect(share("desert")).toBeGreaterThanOrEqual(0.10);
      expect(share("desert")).toBeLessThanOrEqual(0.22);

      expect(share("snowy")).toBeGreaterThanOrEqual(0.10);
      expect(share("snowy")).toBeLessThanOrEqual(0.22);

      expect(share("mountains")).toBeGreaterThanOrEqual(0.05);
      expect(share("mountains")).toBeLessThanOrEqual(0.15);
    });
  }

  it("plains and forest are no longer lopsided (forest was ~50%, plains ~10% before the fix)", () => {
    const gen = new TerrainGenerator("voxelheim-mvp", "infinite");
    const counts = sampleBiomes(gen);
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    const plainsShare = counts.plains / total;
    const forestShare = counts.forest / total;
    // The two should now be roughly comparable, not off by 4-5x.
    expect(Math.abs(plainsShare - forestShare)).toBeLessThan(0.1);
  });

  it("is deterministic: two generators with the same seed agree on every sampled column", () => {
    const a = new TerrainGenerator("determinism-seed", "infinite");
    const b = new TerrainGenerator("determinism-seed", "infinite");
    for (let ix = 0; ix < 100; ix++) {
      for (let iz = 0; iz < 100; iz++) {
        const wx = (ix - 50) * 97;
        const wz = (iz - 50) * 97;
        expect(a.getBiome(wx, wz)).toBe(b.getBiome(wx, wz));
      }
    }
  });

  it("getSurfaceHeight matches the surfaceMap generateChunk writes for an infinite-world chunk (guards the getBiome hoist)", () => {
    const gen = new TerrainGenerator("hoist-guard-seed", "infinite");
    const surfaceMap = new Map<string, number>();
    gen.generateChunk(3, 1, 3, surfaceMap);
    expect(surfaceMap.size).toBeGreaterThan(0);
    for (const [key, surfaceY] of surfaceMap) {
      const [wx, wz] = key.split(",").map(Number);
      expect(gen.getSurfaceHeight(wx, wz)).toBe(surfaceY);
    }
  });

  it("generateChunk output for an infinite-world chunk is identical across two generator instances with the same seed", () => {
    const a = new TerrainGenerator("hoist-guard-seed-2", "infinite");
    const b = new TerrainGenerator("hoist-guard-seed-2", "infinite");
    const chunkA = a.generateChunk(-2, 1, 5);
    const chunkB = b.generateChunk(-2, 1, 5);
    expect(chunkA.getBlockData()).toEqual(chunkB.getBlockData());
    // Sanity: chunkKey helper still round-trips through the standard layout used elsewhere.
    expect(chunkKey(-2, 1, 5)).toBe("-2,1,5");
  });
});
