import { Chunk } from "@engine/world/Chunk";
import { BLOCK_ID } from "@data/blocks";
import { CHUNK_SIZE, SEA_LEVEL, CRYSTAL_MIN_DEPTH } from "@engine/world/constants";
import { worldToChunk, worldToLocal, chunkKey } from "@lib/coords";
import type { TerrainGenerator } from "@engine/generation/TerrainGenerator";

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
 * Places structures (trees) into an already-generated world.
 */
export class StructureGenerator {
  private readonly seedHash: number;

  constructor(seed: string) {
    this.seedHash = hashString(seed + ":structures");
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
      if (chunk.getBlock(lx, ly, lz) !== BLOCK_ID.GRASS) continue;

      // ~3% chance of tree placement (hash-based for uniform distribution)
      const chance = mixHash(wx + this.seedHash, wz) / 4294967296;
      if (chance > 0.03) continue;

      // Trunk height: 4-6 blocks
      const trunkRand = mixHash(wx + this.seedHash + 1000, wz + 1000) / 4294967296;
      const trunkHeight = 4 + Math.floor(trunkRand * 3); // 4, 5, or 6

      // Place trunk
      for (let ty = 1; ty <= trunkHeight; ty++) {
        this.setWorldBlock(chunks, wx, surfaceY + ty, wz, BLOCK_ID.LOG);
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
              BLOCK_ID.LEAVES
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

        // Same hash-based 3% tree check as placeTrees
        const chance = mixHash(wx + this.seedHash, wz) / 4294967296;
        if (chance > 0.03) continue;

        const trunkRand = mixHash(wx + this.seedHash + 1000, wz + 1000) / 4294967296;
        const trunkHeight = 4 + Math.floor(trunkRand * 3);

        // Place trunk blocks that fall in this chunk
        for (let ty = 1; ty <= trunkHeight; ty++) {
          const by = surfaceY + ty;
          if (by < chunkMinY || by > chunkMaxY) continue;
          const tc = worldToChunk(wx, by, wz);
          if (tc.cx !== cx || tc.cz !== cz) continue;
          const local = worldToLocal(wx, by, wz);
          chunk.setBlock(local.lx, local.ly, local.lz, BLOCK_ID.LOG);
        }

        // Place canopy blocks that fall in this chunk
        const canopyBase = surfaceY + trunkHeight + 1;
        let treeIndex = 0;
        for (let ly = 0; ly < 2; ly++) {
          for (let lx = -1; lx <= 1; lx++) {
            for (let lz = -1; lz <= 1; lz++) {
              if (Math.abs(lx) === 1 && Math.abs(lz) === 1) {
                const cornerRand =
                  mixHash(wx + lx * 100 + ly * 200 + this.seedHash, wz + lz * 100 + treeIndex) / 4294967296;
                if (cornerRand < 0.5) continue;
              }
              const bx = wx + lx;
              const by = canopyBase + ly;
              const bz = wz + lz;
              if (by < chunkMinY || by > chunkMaxY) continue;
              const tc = worldToChunk(bx, by, bz);
              if (tc.cx !== cx || tc.cy !== cy || tc.cz !== cz) continue;
              const local = worldToLocal(bx, by, bz);
              chunk.setBlock(local.lx, local.ly, local.lz, BLOCK_ID.LEAVES);
            }
          }
        }
        treeIndex++;
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
