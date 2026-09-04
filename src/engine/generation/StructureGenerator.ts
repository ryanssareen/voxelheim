import { Chunk } from "@engine/world/Chunk";
import { BLOCK_ID, getWoodBlockId, type WoodSpecies } from "@data/blocks";
import { CHUNK_SIZE, SEA_LEVEL, CRYSTAL_MIN_DEPTH } from "@engine/world/constants";
import { worldToChunk, worldToLocal, chunkKey } from "@lib/coords";
import { SeededNoise } from "@lib/noise";
import type { TerrainGenerator, Biome } from "@engine/generation/TerrainGenerator";

/** Simple deterministic string hash producing a 32-bit integer. */
function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return h;
}

/** MurmurHash3-style mixer for deterministic per-position randomness. */
function mixHash(a: number, b: number): number {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 15), 0x45d9f3b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0x45d9f3b) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * Per-biome tree density curve. `floor` is the base (background) tree
 * chance, `peak` is the chance inside a cluster, and `onset` is the
 * cluster-noise threshold (in [0, 1]) above which the chance ramps from
 * floor up to peak. This is a data table, not a switch — tune density here.
 */
interface TreeDensity {
  floor: number;
  peak: number;
  onset: number;
}

const TREE_DENSITY: Record<Biome, TreeDensity> = {
  forest: { floor: 0.004, peak: 0.12, onset: 0.30 },
  plains: { floor: 0.0012, peak: 0.115, onset: 0.68 },
  mountains: { floor: 0.003, peak: 0.05, onset: 0.50 },
  snowy: { floor: 0.004, peak: 0.07, onset: 0.45 },
  desert: { floor: 0, peak: 0, onset: 1 },
};

/** World-space scale (in blocks) of the cluster-noise field driving tree density. */
const TREE_CLUSTER_SCALE = 32;

/** World-space scale (in blocks) of the species-noise field; wider than the cluster scale so birch groves span several trees inside a forest. */
const TREE_SPECIES_SCALE = 48;

/**
 * Per-biome wood species weights for trees placed via `decorateChunk`
 * (infinite and flat worlds, which always have a real biome from
 * `terrainGen.getBiome`). Cumulative-thresholded against a dedicated noise
 * field in `treeSpecies`. Desert is unreachable in practice — `treeChance`
 * is always 0 for desert — but every `Biome` needs an entry for the table
 * to type-check.
 */
const BIOME_WOOD: Record<Biome, ReadonlyArray<{ species: WoodSpecies; weight: number }>> = {
  forest: [{ species: "oak", weight: 0.7 }, { species: "birch", weight: 0.3 }],
  plains: [{ species: "oak", weight: 1 }],
  snowy: [{ species: "spruce", weight: 1 }],
  mountains: [{ species: "spruce", weight: 0.6 }, { species: "oak", weight: 0.4 }],
  desert: [{ species: "oak", weight: 1 }],
};

/**
 * Wood species weights for `placeTrees` (island worlds only). Island
 * generation has no biome concept — `TerrainGenerator.getBiome` is never
 * called on that path — so this is a fixed, oak-dominant fallback table fed
 * through the same species-noise field.
 */
const ISLAND_WOOD: ReadonlyArray<{ species: WoodSpecies; weight: number }> = [
  { species: "oak", weight: 0.85 },
  { species: "birch", weight: 0.15 },
];

/** Trunk height range for a wood species: `minHeight` to `minHeight + heightRange - 1`. */
interface TreeShape {
  minHeight: number;
  heightRange: number;
}

/**
 * Per-species trunk shape. Oak and birch reproduce today's exact
 * `4 + floor(rand * 3)` formula (4-6) bit-for-bit; only spruce (a taller
 * conifer silhouette) differs from the historical output.
 */
const WOOD_TREE_SHAPE: Record<WoodSpecies, TreeShape> = {
  oak: { minHeight: 4, heightRange: 3 },
  birch: { minHeight: 4, heightRange: 3 },
  spruce: { minHeight: 5, heightRange: 4 },
};

/**
 * Places structures (trees) into an already-generated world.
 */
export class StructureGenerator {
  private readonly seedHash: number;
  private readonly clusterNoise: SeededNoise;
  private readonly speciesNoise: SeededNoise;

  constructor(seed: string) {
    this.seedHash = hashString(seed + ":structures");
    this.clusterNoise = new SeededNoise(hashString(seed + ":treeclusters"));
    this.speciesNoise = new SeededNoise(hashString(seed + ":treespecies"));
  }

  /**
   * Tree placement chance at a world column for a given biome: a low-frequency
   * simplex field (the "cluster" spatial variation) picks out groves and
   * clearings, and the uniform hash roll in decorateChunk/placeTrees decides
   * yes/no against that chance (noise for spatial shape, hash for the
   * probability decision — see docs/solutions/best-practices/noise-vs-hash-for-probability-decisions).
   */
  treeChance(wx: number, wz: number, biome: Biome): number {
    const d = TREE_DENSITY[biome];
    const f = (this.clusterNoise.noise2D(wx / TREE_CLUSTER_SCALE, wz / TREE_CLUSTER_SCALE) + 1) / 2;
    if (f < d.onset) return d.floor;
    return d.floor + (d.peak - d.floor) * ((f - d.onset) / (1 - d.onset));
  }

  /**
   * Picks a tree's wood species at a world column: a dedicated `SeededNoise`
   * field (seeded `seed + ":treespecies"`, scale `TREE_SPECIES_SCALE` so
   * groves of one species span several trees) thresholded against the
   * cumulative weights of the applicable species table. Pure function of
   * (seed, wx, wz, biome).
   *
   * `biome` is only omitted by `placeTrees` (island worlds), which has no
   * biome concept — it falls back to `ISLAND_WOOD`. `decorateChunk`
   * (infinite and flat worlds) always passes the real biome it already
   * computed via `terrainGen.getBiome`, and uses `BIOME_WOOD`.
   */
  treeSpecies(wx: number, wz: number, biome?: Biome): WoodSpecies {
    const entries = biome !== undefined ? BIOME_WOOD[biome] : ISLAND_WOOD;
    if (entries.length === 1) return entries[0].species;
    const t = (this.speciesNoise.noise2D(wx / TREE_SPECIES_SCALE, wz / TREE_SPECIES_SCALE) + 1) / 2;
    const total = entries.reduce((sum, e) => sum + e.weight, 0);
    let cumulative = 0;
    for (const entry of entries) {
      cumulative += entry.weight / total;
      if (t < cumulative) return entry.species;
    }
    return entries[entries.length - 1].species;
  }

  /**
   * Sets a block in the chunk map at world coordinates.
   * Skips silently if the target chunk does not exist.
   */
  private setWorldBlock(
    chunks: Map<string, Chunk>,
    wx: number,
    wy: number,
    wz: number,
    blockId: number
  ): void {
    const { cx, cy, cz } = worldToChunk(wx, wy, wz);
    const chunk = chunks.get(chunkKey(cx, cy, cz));
    if (!chunk) return;
    const { lx, ly, lz } = worldToLocal(wx, wy, wz);
    chunk.setBlock(lx, ly, lz, blockId);
  }

  /**
   * Places trees on eligible GRASS surfaces.
   * Trees have a LOG trunk (4-6 blocks) and a 3x3x2 LEAVES canopy
   * with corners randomly removed.
   *
   * @param chunks - All generated chunks keyed by chunkKey
   * @param surfaceMap - Maps "wx,wz" to surface Y height
   */
  placeTrees(
    chunks: Map<string, Chunk>,
    surfaceMap: Map<string, number>
  ): void {
    let treeIndex = 0;

    for (const [key, surfaceY] of surfaceMap) {
      if (surfaceY <= SEA_LEVEL + 2) continue;

      const [wxStr, wzStr] = key.split(",");
      const wx = Number(wxStr);
      const wz = Number(wzStr);

      // Check that the surface block is GRASS
      const { cx, cy, cz } = worldToChunk(wx, surfaceY, wz);
      const chunk = chunks.get(chunkKey(cx, cy, cz));
      if (!chunk) continue;
      const { lx, ly, lz } = worldToLocal(wx, surfaceY, wz);
      const surfaceBlock = chunk.getBlock(lx, ly, lz);
      if (surfaceBlock !== BLOCK_ID.GRASS && surfaceBlock !== BLOCK_ID.SNOW) continue;

      // ~3% chance of tree placement (hash-based for uniform distribution)
      const chance = mixHash(wx + this.seedHash, wz) / 4294967296;
      if (chance > 0.03) continue;

      // Island worlds have no biome concept — falls back to ISLAND_WOOD.
      const species = this.treeSpecies(wx, wz);
      const shape = WOOD_TREE_SHAPE[species];
      const logId = getWoodBlockId(species, "log");
      const leavesId = getWoodBlockId(species, "leaves");

      // Trunk height: species-dependent range (oak/birch 4-6, spruce 5-8)
      const trunkRand = mixHash(wx + this.seedHash + 1000, wz + 1000) / 4294967296;
      const trunkHeight = shape.minHeight + Math.floor(trunkRand * shape.heightRange);

      // Place trunk
      for (let ty = 1; ty <= trunkHeight; ty++) {
        this.setWorldBlock(chunks, wx, surfaceY + ty, wz, logId);
      }

      // Place 3x3x2 canopy on top of trunk
      const canopyBase = surfaceY + trunkHeight + 1;
      for (let cy = 0; cy < 2; cy++) {
        for (let cx = -1; cx <= 1; cx++) {
          for (let cz = -1; cz <= 1; cz++) {
            // Randomly remove corners (~50% chance)
            if (Math.abs(cx) === 1 && Math.abs(cz) === 1) {
              const cornerRand =
                mixHash(
                  wx + cx * 100 + cy * 200 + this.seedHash,
                  wz + cz * 100 + treeIndex
                ) / 4294967296;
              if (cornerRand < 0.5) continue;
            }
            this.setWorldBlock(
              chunks,
              wx + cx,
              canopyBase + cy,
              wz + cz,
              leavesId
            );
          }
        }
      }

      treeIndex++;
    }
  }

  /**
   * Per-chunk decoration for infinite worlds.
   * Checks a 2-block border around the chunk to handle tree canopy overlap.
   * Only places blocks that fall within this chunk's bounds.
   */
  decorateChunk(
    cx: number,
    cy: number,
    cz: number,
    terrainGen: TerrainGenerator,
    chunk: Chunk
  ): void {
    const chunkMinX = cx * CHUNK_SIZE;
    const chunkMinZ = cz * CHUNK_SIZE;
    const chunkMinY = cy * CHUNK_SIZE;
    const chunkMaxY = chunkMinY + CHUNK_SIZE - 1;

    // Check columns in chunk + 2-block border (canopy overhang)
    for (let wx = chunkMinX - 2; wx < chunkMinX + CHUNK_SIZE + 2; wx++) {
      for (let wz = chunkMinZ - 2; wz < chunkMinZ + CHUNK_SIZE + 2; wz++) {
        const surfaceY = terrainGen.getSurfaceHeight(wx, wz);
        if (surfaceY <= SEA_LEVEL + 2) continue;

        // Cluster-noise driven tree chance (spatial variation), gated by
        // the existing uniform hash roll (the yes/no decision).
        const biome: Biome = terrainGen.getBiome(wx, wz);
        const chance = mixHash(wx + this.seedHash, wz) / 4294967296;
        if (chance > this.treeChance(wx, wz, biome)) continue;

        const species = this.treeSpecies(wx, wz, biome);
        const shape = WOOD_TREE_SHAPE[species];
        const logId = getWoodBlockId(species, "log");
        const leavesId = getWoodBlockId(species, "leaves");

        const trunkRand = mixHash(wx + this.seedHash + 1000, wz + 1000) / 4294967296;
        const trunkHeight = shape.minHeight + Math.floor(trunkRand * shape.heightRange);

        // Write DIRT under the trunk (Minecraft-style) so the surface block
        // a tree stands on is never GRASS with an opaque block directly
        // above it — otherwise the grass-decay random tick would immediately
        // start converting pristine, freshly generated terrain.
        if (surfaceY >= chunkMinY && surfaceY <= chunkMaxY) {
          const tc = worldToChunk(wx, surfaceY, wz);
          if (tc.cx === cx && tc.cz === cz) {
            const local = worldToLocal(wx, surfaceY, wz);
            chunk.setBlock(local.lx, local.ly, local.lz, BLOCK_ID.DIRT);
          }
        }

        // Place trunk blocks that fall in this chunk
        for (let ty = 1; ty <= trunkHeight; ty++) {
          const by = surfaceY + ty;
          if (by < chunkMinY || by > chunkMaxY) continue;
          const tc = worldToChunk(wx, by, wz);
          if (tc.cx !== cx || tc.cz !== cz) continue;
          const local = worldToLocal(wx, by, wz);
          chunk.setBlock(local.lx, local.ly, local.lz, logId);
        }

        // Place canopy blocks that fall in this chunk
        const canopyBase = surfaceY + trunkHeight + 1;
        for (let ly = 0; ly < 2; ly++) {
          for (let lx = -1; lx <= 1; lx++) {
            for (let lz = -1; lz <= 1; lz++) {
              if (Math.abs(lx) === 1 && Math.abs(lz) === 1) {
                const cornerRand =
                  mixHash(wx + lx * 100 + ly * 200 + this.seedHash, wz + lz * 100) / 4294967296;
                if (cornerRand < 0.5) continue;
              }
              const bx = wx + lx;
              const by = canopyBase + ly;
              const bz = wz + lz;
              if (by < chunkMinY || by > chunkMaxY) continue;
              const tc = worldToChunk(bx, by, bz);
              if (tc.cx !== cx || tc.cy !== cy || tc.cz !== cz) continue;
              const local = worldToLocal(bx, by, bz);
              chunk.setBlock(local.lx, local.ly, local.lz, leavesId);
            }
          }
        }
      }
    }

    // Per-chunk crystal placement for infinite worlds
    const crystalCount = Math.abs(mixHash(cx + this.seedHash, cz)) % 3;
    if (crystalCount === 0) return;

    const candidates: Array<{ lx: number; ly: number; lz: number }> = [];
    for (let x = 0; x < CHUNK_SIZE; x++) {
      for (let y = 0; y < CHUNK_SIZE; y++) {
        for (let z = 0; z < CHUNK_SIZE; z++) {
          if (chunk.getBlock(x, y, z) !== BLOCK_ID.STONE) continue;
          const wy = cy * CHUNK_SIZE + y;
          const wx2 = cx * CHUNK_SIZE + x;
          const wz2 = cz * CHUNK_SIZE + z;
          const surface = terrainGen.getSurfaceHeight(wx2, wz2);
          if (wy > surface - CRYSTAL_MIN_DEPTH) continue;
          candidates.push({ lx: x, ly: y, lz: z });
        }
      }
    }

    const count = Math.min(crystalCount, candidates.length);
    for (let i = 0; i < count; i++) {
      const r = Math.abs(mixHash(cx * 1000 + i, cz * 2000 + this.seedHash)) % (candidates.length - i);
      const j = i + r;
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
      chunk.setBlock(candidates[i].lx, candidates[i].ly, candidates[i].lz, BLOCK_ID.CRYSTAL);
    }
  }
}
