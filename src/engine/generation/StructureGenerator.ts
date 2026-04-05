import { Chunk } from "@engine/world/Chunk";
import { BLOCK_ID } from "@data/blocks";
import { CHUNK_SIZE, SEA_LEVEL } from "@engine/world/constants";
import { worldToChunk, worldToLocal, chunkKey } from "@lib/coords";

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
}
