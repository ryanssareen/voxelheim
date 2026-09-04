import type { Chunk } from "@engine/world/Chunk";
import type { BlockChangeSource } from "@engine/world/ChunkManager";
import { CHUNK_SIZE } from "@engine/world/constants";

/**
 * Minimal world surface the random ticker needs. ChunkManager satisfies this
 * structurally (forEachLoadedChunk, getBlock, setBlock already exist there).
 */
export interface TickWorld {
  forEachLoadedChunk(visit: (chunk: Chunk) => void): void;
  getBlock(wx: number, wy: number, wz: number): number;
  setBlock(wx: number, wy: number, wz: number, blockId: number, source: BlockChangeSource): boolean;
}

/**
 * A rule that fires for a set of block IDs when a random tick samples a
 * matching block. Returning true means the rule changed the world (a
 * setBlock happened) and counts against the per-tick change budget.
 */
export interface RandomTickRule {
  readonly blockIds: ReadonlySet<number>;
  tick(
    world: TickWorld,
    wx: number,
    wy: number,
    wz: number,
    blockId: number,
    rng: () => number
  ): boolean;
}

export interface RandomTickerOptions {
  /** How many random-tick passes to run per real second. Default 20. */
  ticksPerSecond?: number;
  /** How many random cells to sample per loaded chunk per tick. Default 3. */
  samplesPerChunkPerTick?: number;
  /** Hard cap on setBlock calls in a single tick. Default 16. */
  maxChangesPerTick?: number;
  /** Hard cap on chunks visited in a single tick. Default 2048. */
  maxChunksPerTick?: number;
}

const DEFAULT_TICKS_PER_SECOND = 20;
const DEFAULT_SAMPLES_PER_CHUNK_PER_TICK = 3;
const DEFAULT_MAX_CHANGES_PER_TICK = 16;
const DEFAULT_MAX_CHUNKS_PER_TICK = 2048;

/** Simple deterministic string hash producing a 32-bit integer (local copy — see docs/solutions/best-practices/seeded-prng-for-simplex-noise). */
function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return h;
}

/** mulberry32: small, fast, deterministic PRNG seeded from a 32-bit integer. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Budgeted random-tick pass over loaded chunks, Minecraft-style: each real
 * tick, a handful of cells per chunk are sampled and any rule matching the
 * sampled block id gets a chance to change the world. Bounded by both a
 * per-tick change count (bounds ChunkManager.setBlock's synchronous re-mesh
 * cost) and a per-tick chunk count (bounds work at very high chunk counts),
 * with a rotating cursor so chunks skipped this tick get their turn next.
 */
export class RandomTicker {
  private readonly world: TickWorld;
  private readonly rulesByBlockId: Map<number, RandomTickRule[]>;
  private readonly ticksPerSecond: number;
  private readonly samplesPerChunkPerTick: number;
  private readonly maxChangesPerTick: number;
  private readonly maxChunksPerTick: number;
  private readonly rng: () => number;

  private accum = 0;
  private chunkCursor = 0;

  constructor(
    world: TickWorld,
    rules: readonly RandomTickRule[],
    seed: string,
    options: RandomTickerOptions = {}
  ) {
    this.world = world;
    this.ticksPerSecond = options.ticksPerSecond ?? DEFAULT_TICKS_PER_SECOND;
    this.samplesPerChunkPerTick = options.samplesPerChunkPerTick ?? DEFAULT_SAMPLES_PER_CHUNK_PER_TICK;
    this.maxChangesPerTick = options.maxChangesPerTick ?? DEFAULT_MAX_CHANGES_PER_TICK;
    this.maxChunksPerTick = options.maxChunksPerTick ?? DEFAULT_MAX_CHUNKS_PER_TICK;
    this.rng = mulberry32(hashString(seed + ":randomtick"));

    this.rulesByBlockId = new Map();
    for (const rule of rules) {
      for (const blockId of rule.blockIds) {
        const list = this.rulesByBlockId.get(blockId);
        if (list) {
          list.push(rule);
        } else {
          this.rulesByBlockId.set(blockId, [rule]);
        }
      }
    }
  }

  /**
   * Advances the ticker by `dt` seconds, running zero or more whole ticks.
   * Returns the total number of block changes made across those ticks.
   */
  update(dt: number): number {
    if (dt <= 0) return 0;
    this.accum += dt * this.ticksPerSecond;
    let totalChanges = 0;
    while (this.accum >= 1) {
      this.accum -= 1;
      totalChanges += this.runOneTick();
    }
    return totalChanges;
  }

  private runOneTick(): number {
    let changes = 0;
    let chunksProcessed = 0;
    let totalChunks = 0;
    let skip = this.chunkCursor;

    const visitChunk = (chunk: Chunk): void => {
      if (changes >= this.maxChangesPerTick) return;
      if (chunksProcessed >= this.maxChunksPerTick) return;
      chunksProcessed++;
      changes += this.tickChunk(chunk, this.maxChangesPerTick - changes);
    };

    this.world.forEachLoadedChunk((chunk) => {
      totalChunks++;
      if (skip > 0) {
        skip--;
        return;
      }
      visitChunk(chunk);
    });

    // If chunks were skipped because the cursor started mid-list, and there
    // is still budget left after reaching the end, wrap around and take the
    // skipped prefix so a full pass eventually covers every loaded chunk.
    if (changes < this.maxChangesPerTick && chunksProcessed < this.maxChunksPerTick && totalChunks > 0) {
      const wrapLimit = Math.min(this.chunkCursor, totalChunks);
      let seen = 0;
      this.world.forEachLoadedChunk((chunk) => {
        if (seen >= wrapLimit) return;
        seen++;
        visitChunk(chunk);
      });
    }

    this.chunkCursor = totalChunks > 0 ? (this.chunkCursor + chunksProcessed) % totalChunks : 0;
    return changes;
  }

  private tickChunk(chunk: Chunk, remaining: number): number {
    let changes = 0;
    for (let i = 0; i < this.samplesPerChunkPerTick; i++) {
      if (changes >= remaining) break;

      const lx = (this.rng() * CHUNK_SIZE) | 0;
      const ly = (this.rng() * CHUNK_SIZE) | 0;
      const lz = (this.rng() * CHUNK_SIZE) | 0;
      const blockId = chunk.getBlock(lx, ly, lz);

      const rules = this.rulesByBlockId.get(blockId);
      if (!rules || rules.length === 0) continue;

      const wx = chunk.cx * CHUNK_SIZE + lx;
      const wy = chunk.cy * CHUNK_SIZE + ly;
      const wz = chunk.cz * CHUNK_SIZE + lz;

      for (const rule of rules) {
        if (rule.tick(this.world, wx, wy, wz, blockId, this.rng)) {
          changes++;
          break;
        }
      }
    }
    return changes;
  }
}
