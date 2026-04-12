import { Chunk } from "@engine/world/Chunk";
import { SeededNoise } from "@lib/noise";
import { BLOCK_ID } from "@data/blocks";
import {
  CHUNK_SIZE,
  SEA_LEVEL,
  CRYSTAL_SHARD_COUNT,
  CRYSTAL_MIN_DEPTH,
  type WorldType,
} from "@engine/world/constants";
import { worldToChunk, worldToLocal, chunkKey } from "@lib/coords";

/** Biome types for infinite world generation. */
export type Biome = "plains" | "forest" | "desert" | "mountains" | "snowy";

/** Simple deterministic string hash producing a 32-bit integer. */
function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return h;
}

/** Deterministic hash for probability decisions (uniform distribution, NOT noise). */
function mixHash(a: number, b: number, c: number, seed: number): number {
  let h = (Math.imul(a, 73856093) ^ Math.imul(b, 19349663) ^ Math.imul(c, 83492791) ^ seed) | 0;
  h = Math.imul(h ^ (h >>> 15), 0x45d9f3b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0x45d9f3b) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/** Clamps a value between min and max. */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Generates terrain chunks using seeded simplex noise with island-shaped falloff.
 */
export class TerrainGenerator {
  private readonly noise: SeededNoise;
  private readonly seed: string;
  private readonly seedHash: number;
  private readonly worldType: WorldType;

  constructor(seed: string, worldType: WorldType = "island") {
    this.seed = seed;
    this.seedHash = hashString(seed);
    this.worldType = worldType;
    this.noise = new SeededNoise(this.seedHash);
  }

  /**
   * Determine the biome at a world column using temperature and humidity noise.
   * Only meaningful for infinite worlds.
   */
  getBiome(wx: number, wz: number): Biome {
    // Large-scale noise -> big biome regions (hundreds of blocks each)
    const temp = this.noise.noise2D(wx / 800, wz / 800);
    const humidity = this.noise.noise2D(wx / 700 + 1000, wz / 700 + 1000);

    // Only extreme temps produce desert/snowy (~15% each)
    if (temp > 0.5) return "desert";
    if (temp < -0.5) return "snowy";
    // Warm + dry -> mountains (~8%)
    if (temp > 0.15 && humidity < -0.15) return "mountains";
    // Very dry -> plains (~12%)
    if (humidity < -0.4) return "plains";
    // Everything else -> forest (dominant ~50%)
    return "forest";
  }

  /** Compute the surface Y height for a single world column. Pure function of coords + noise. */
  getSurfaceHeight(wx: number, wz: number): number {
    if (this.worldType === "flat") return 30;

    if (this.worldType === "infinite") {
      const biome = this.getBiome(wx, wz);
      let baseHeight: number;
      let amplitudeScale: number;
      switch (biome) {
        case "plains":    baseHeight = 30; amplitudeScale = 0.9; break;
        case "forest":    baseHeight = 30; amplitudeScale = 1.0; break;
        case "desert":    baseHeight = 28; amplitudeScale = 0.8; break;
        case "mountains": baseHeight = 35; amplitudeScale = 1.8; break;
        case "snowy":     baseHeight = 32; amplitudeScale = 1.0; break;
      }
      const noiseValue = this.noise.octaveNoise2D(wx, wz, 5, 0.5, 2.0, 40);
      return Math.floor(baseHeight + noiseValue * 14 * amplitudeScale);
    }

    // island
    const baseHeight = 30;
    const noiseValue = this.noise.octaveNoise2D(wx, wz, 4, 0.5, 2.0, 50);
    let surfaceY = Math.floor(baseHeight + noiseValue * 14);
    const dx = wx - 32;
    const dz = wz - 32;
    const distFromCenter = Math.sqrt(dx * dx + dz * dz);
    const normalizedDist = clamp(distFromCenter / 38, 0, 1);
    const falloff = 1 - normalizedDist * normalizedDist * normalizedDist;
    surfaceY = Math.floor(surfaceY * falloff);
    if (surfaceY < 1) surfaceY = 0;
    return surfaceY;
  }

  /**
   * Generates a single chunk and populates it with terrain blocks.
   * Also records surface heights into the provided surfaceMap.
   *
   * @param cx - Chunk x coordinate
   * @param cy - Chunk y coordinate
   * @param cz - Chunk z coordinate
   * @param surfaceMap - Map from "wx,wz" to surface Y height, populated during generation
   */
  generateChunk(
    cx: number,
    cy: number,
    cz: number,
    surfaceMap?: Map<string, number>
  ): Chunk {
    const chunk = new Chunk(cx, cy, cz);

    for (let x = 0; x < CHUNK_SIZE; x++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        const wx = cx * CHUNK_SIZE + x;
        const wz = cz * CHUNK_SIZE + z;

        let surfaceY: number;

        if (this.worldType === "flat") {
          surfaceY = 30;
        } else if (this.worldType === "infinite") {
          surfaceY = this.getSurfaceHeight(wx, wz);
        } else {
          // "island" (default)
          const baseHeight = 30;
          const noiseValue = this.noise.octaveNoise2D(wx, wz, 4, 0.5, 2.0, 50);
          surfaceY = Math.floor(baseHeight + noiseValue * 14);

          // Island shaping: smooth falloff from center (32, 32)
          const dx = wx - 32;
          const dz = wz - 32;
          const distFromCenter = Math.sqrt(dx * dx + dz * dz);
          const normalizedDist = clamp(distFromCenter / 38, 0, 1);
          const falloff = 1 - normalizedDist * normalizedDist * normalizedDist;
          surfaceY = Math.floor(surfaceY * falloff);
          if (surfaceY < 1) surfaceY = 0;
        }

        if (surfaceMap) {
          surfaceMap.set(`${wx},${wz}`, surfaceY);
        }

        for (let y = 0; y < CHUNK_SIZE; y++) {
          const wy = cy * CHUNK_SIZE + y;

          if (this.worldType === "flat") {
            if (wy === 0) {
              chunk.setBlock(x, y, z, BLOCK_ID.STONE); // bedrock
            } else if (wy > surfaceY) {
              // AIR
            } else if (wy === surfaceY) {
              chunk.setBlock(x, y, z, BLOCK_ID.GRASS);
            } else if (wy > surfaceY - 4) {
              chunk.setBlock(x, y, z, BLOCK_ID.DIRT);
            } else {
              // Stone with ore replacement
              let blockId: number = BLOCK_ID.STONE;
              const oreHash = mixHash(wx, wy, wz, this.seedHash);
              const oreChance = oreHash / 4294967296;
              if (wy >= 5 && wy <= 25 && oreChance < 0.03) {
                blockId = BLOCK_ID.IRON_ORE;
              } else if (wy >= 1 && wy <= 12 && oreChance >= 0.03 && oreChance < 0.038) {
                blockId = BLOCK_ID.DIAMOND_ORE;
              }
              chunk.setBlock(x, y, z, blockId);
            }
          } else if (this.worldType === "infinite") {
            // Biome-aware block placement for infinite worlds
            const biome = this.getBiome(wx, wz);
            if (wy === 0) {
              chunk.setBlock(x, y, z, BLOCK_ID.STONE); // bedrock
            } else if (wy > surfaceY) {
              // Above surface: water/ice at or below sea level, air above
              if (wy <= SEA_LEVEL) {
                if (biome === "snowy") {
                  chunk.setBlock(x, y, z, BLOCK_ID.ICE);
                } else {
                  chunk.setBlock(x, y, z, BLOCK_ID.WATER);
                }
              }
            } else if (wy === surfaceY && surfaceY > SEA_LEVEL) {
              // Surface block depends on biome
              if (biome === "desert") {
                chunk.setBlock(x, y, z, BLOCK_ID.SAND);
              } else if (biome === "snowy") {
                chunk.setBlock(x, y, z, BLOCK_ID.SNOW);
              } else if (biome === "mountains" && surfaceY > 38) {
                chunk.setBlock(x, y, z, BLOCK_ID.STONE);
              } else {
                chunk.setBlock(x, y, z, BLOCK_ID.GRASS);
              }
            } else if (wy === surfaceY && surfaceY <= SEA_LEVEL) {
              chunk.setBlock(x, y, z, BLOCK_ID.SAND);
            } else if (wy > surfaceY - 4) {
              // Subsurface layers
              if (biome === "desert") {
                chunk.setBlock(x, y, z, BLOCK_ID.SAND);
              } else {
                chunk.setBlock(x, y, z, BLOCK_ID.DIRT);
              }
            } else {
              // Stone with ore and lava replacement
              let blockId: number = BLOCK_ID.STONE;
              const oreHash = mixHash(wx, wy, wz, this.seedHash);
              const oreChance = oreHash / 4294967296;
              if (wy >= 5 && wy <= 25 && oreChance < 0.03) {
                blockId = BLOCK_ID.IRON_ORE;
              } else if (wy >= 1 && wy <= 12 && oreChance >= 0.03 && oreChance < 0.038) {
                blockId = BLOCK_ID.DIAMOND_ORE;
              }
              chunk.setBlock(x, y, z, blockId);
            }

            // Lava: replace underground air at Y<=5 with lava pools (~2%)
            if (wy <= 5 && wy > 0 && chunk.getBlock(x, y, z) === BLOCK_ID.AIR) {
              const lavaHash = mixHash(wx + 17, wy + 31, wz + 53, this.seedHash);
              const lavaChance = lavaHash / 4294967296;
              if (lavaChance < 0.02) {
                chunk.setBlock(x, y, z, BLOCK_ID.LAVA);
              }
            }
          } else {
            // Island world (original behavior)
            if (wy === 0) {
              chunk.setBlock(x, y, z, BLOCK_ID.STONE); // bedrock
            } else if (wy > surfaceY) {
              // Above surface: water at or below sea level, air above
              if (wy <= SEA_LEVEL) {
                chunk.setBlock(x, y, z, BLOCK_ID.WATER);
              }
            } else if (wy === surfaceY && surfaceY > SEA_LEVEL) {
              chunk.setBlock(x, y, z, BLOCK_ID.GRASS);
            } else if (wy === surfaceY && surfaceY <= SEA_LEVEL) {
              chunk.setBlock(x, y, z, BLOCK_ID.SAND);
            } else if (wy > surfaceY - 4) {
              chunk.setBlock(x, y, z, BLOCK_ID.DIRT);
            } else {
              // Stone with ore and lava replacement
              let blockId: number = BLOCK_ID.STONE;
              const oreHash = mixHash(wx, wy, wz, this.seedHash);
              const oreChance = oreHash / 4294967296;
              if (wy >= 5 && wy <= 25 && oreChance < 0.03) {
                blockId = BLOCK_ID.IRON_ORE;
              } else if (wy >= 1 && wy <= 12 && oreChance >= 0.03 && oreChance < 0.038) {
                blockId = BLOCK_ID.DIAMOND_ORE;
              }
              chunk.setBlock(x, y, z, blockId);
            }

            // Lava: replace underground air at Y<=5 with lava pools (~2%)
            if (wy <= 5 && wy > 0 && chunk.getBlock(x, y, z) === BLOCK_ID.AIR) {
              const lavaHash = mixHash(wx + 17, wy + 31, wz + 53, this.seedHash);
              const lavaChance = lavaHash / 4294967296;
              if (lavaChance < 0.02) {
                chunk.setBlock(x, y, z, BLOCK_ID.LAVA);
              }
            }
          }
        }
      }
    }

    return chunk;
  }

  /**
   * Places exactly {@link CRYSTAL_SHARD_COUNT} crystal blocks in valid STONE
   * positions at least {@link CRYSTAL_MIN_DEPTH} below the surface.
   */
  placeCrystals(
    chunks: Map<string, Chunk>,
    surfaceMap: Map<string, number>
  ): void {
    // Collect all valid positions
    const candidates: Array<{
      cx: number;
      cy: number;
      cz: number;
      lx: number;
      ly: number;
      lz: number;
    }> = [];

    for (const [key, chunk] of chunks) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        for (let y = 0; y < CHUNK_SIZE; y++) {
          for (let z = 0; z < CHUNK_SIZE; z++) {
            if (chunk.getBlock(x, y, z) !== BLOCK_ID.STONE) continue;

            const wx = chunk.cx * CHUNK_SIZE + x;
            const wy = chunk.cy * CHUNK_SIZE + y;
            const wz = chunk.cz * CHUNK_SIZE + z;
            const surface = surfaceMap.get(`${wx},${wz}`);
            if (surface === undefined) continue;
            if (wy > surface - CRYSTAL_MIN_DEPTH) continue;

            candidates.push({
              cx: chunk.cx,
              cy: chunk.cy,
              cz: chunk.cz,
              lx: x,
              ly: y,
              lz: z,
            });
          }
        }
      }
    }

    if (candidates.length === 0) return;

    // Seeded selection using a separate PRNG
    const crystalNoise = new SeededNoise(hashString(this.seed + ":crystals"));
    const count = Math.min(CRYSTAL_SHARD_COUNT, candidates.length);

    // Fisher-Yates partial shuffle for deterministic selection
    for (let i = 0; i < count; i++) {
      const r = Math.abs(
        Math.floor(
          crystalNoise.noise2D(i * 1000, i * 2000) * candidates.length
        )
      );
      const j = i + (r % (candidates.length - i));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }

    for (let i = 0; i < count; i++) {
      const pos = candidates[i];
      const chunk = chunks.get(chunkKey(pos.cx, pos.cy, pos.cz));
      if (chunk) {
        chunk.setBlock(pos.lx, pos.ly, pos.lz, BLOCK_ID.CRYSTAL);
      }
    }
  }
}
