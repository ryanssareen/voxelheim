import { describe, it, expect } from "vitest";
import { RandomTicker, type TickWorld } from "@systems/simulation/RandomTicker";
import { createSurfaceSpreadRule, GRASS_SPREAD } from "@systems/simulation/grassSpread";
import { Chunk } from "@engine/world/Chunk";
import { BLOCK_ID } from "@data/blocks";
import { BlockRegistry } from "@engine/world/BlockRegistry";
import { worldToChunk, worldToLocal, chunkKey } from "@lib/coords";
import type { BlockChangeSource } from "@engine/world/ChunkManager";

interface LogEntry {
  wx: number;
  wy: number;
  wz: number;
  blockId: number;
  source: BlockChangeSource;
}

/** Headless TickWorld backed by a Map<string, Chunk> — no ChunkManager, no renderer, no React. */
class FakeWorld implements TickWorld {
  readonly chunks = new Map<string, Chunk>();
  readonly log: LogEntry[] = [];

  addChunk(cx: number, cy: number, cz: number): Chunk {
    const chunk = new Chunk(cx, cy, cz);
    this.chunks.set(chunkKey(cx, cy, cz), chunk);
    return chunk;
  }

  /** Writes a block directly without going through setBlock (so setup doesn't pollute `log`). */
  seedBlock(wx: number, wy: number, wz: number, blockId: number): void {
    const { cx, cy, cz } = worldToChunk(wx, wy, wz);
    const chunk = this.chunks.get(chunkKey(cx, cy, cz));
    if (!chunk) throw new Error(`FakeWorld.seedBlock: no chunk at ${cx},${cy},${cz}`);
    const { lx, ly, lz } = worldToLocal(wx, wy, wz);
    chunk.setBlock(lx, ly, lz, blockId);
  }

  forEachLoadedChunk(visit: (chunk: Chunk) => void): void {
    for (const chunk of this.chunks.values()) {
      visit(chunk);
    }
  }

  getBlock(wx: number, wy: number, wz: number): number {
    const { cx, cy, cz } = worldToChunk(wx, wy, wz);
    const chunk = this.chunks.get(chunkKey(cx, cy, cz));
    if (!chunk) return BLOCK_ID.AIR;
    const { lx, ly, lz } = worldToLocal(wx, wy, wz);
    return chunk.getBlock(lx, ly, lz);
  }

  setBlock(wx: number, wy: number, wz: number, blockId: number, source: BlockChangeSource): boolean {
    const { cx, cy, cz } = worldToChunk(wx, wy, wz);
    const chunk = this.chunks.get(chunkKey(cx, cy, cz));
    if (!chunk) return false;
    const { lx, ly, lz } = worldToLocal(wx, wy, wz);
    chunk.setBlock(lx, ly, lz, blockId);
    this.log.push({ wx, wy, wz, blockId, source });
    return true;
  }
}

const registry = BlockRegistry.getInstance();

/** Builds a 3x3 chunk plate (cy=0) with DIRT filling the y=5 layer and a single GRASS cell at the origin. */
function build3x3DirtPlate(): FakeWorld {
  const world = new FakeWorld();
  for (let cx = -1; cx <= 1; cx++) {
    for (let cz = -1; cz <= 1; cz++) {
      world.addChunk(cx, 0, cz);
    }
  }
  for (let wx = -16; wx < 32; wx++) {
    for (let wz = -16; wz < 32; wz++) {
      world.seedBlock(wx, 5, wz, BLOCK_ID.DIRT);
    }
  }
  world.seedBlock(0, 5, 0, BLOCK_ID.GRASS);
  return world;
}

function grassSpreadRules() {
  return [createSurfaceSpreadRule(GRASS_SPREAD, registry)];
}

describe("RandomTicker + grass spread (headless, no React, no renderer)", () => {
  it("is seed-deterministic: identical seed + identical update() sequence produces identical blocks and setBlock logs", () => {
    const worldA = build3x3DirtPlate();
    const worldB = build3x3DirtPlate();
    const options = { samplesPerChunkPerTick: 100 };
    const tickerA = new RandomTicker(worldA, grassSpreadRules(), "seed-t", options);
    const tickerB = new RandomTicker(worldB, grassSpreadRules(), "seed-t", options);

    for (let i = 0; i < 200; i++) {
      tickerA.update(0.05);
      tickerB.update(0.05);
    }

    expect(worldA.log).toEqual(worldB.log);
    for (const [key, chunkA] of worldA.chunks) {
      const chunkB = worldB.chunks.get(key)!;
      expect(chunkA.getBlockData()).toEqual(chunkB.getBlockData());
    }
    expect(worldA.log.length).toBeGreaterThan(0);
  });

  it("a different seed produces a different edit sequence", () => {
    const worldA = build3x3DirtPlate();
    const worldB = build3x3DirtPlate();
    const options = { samplesPerChunkPerTick: 100 };
    const tickerA = new RandomTicker(worldA, grassSpreadRules(), "seed-t", options);
    const tickerB = new RandomTicker(worldB, grassSpreadRules(), "seed-other", options);

    for (let i = 0; i < 200; i++) {
      tickerA.update(0.05);
      tickerB.update(0.05);
    }

    expect(worldA.log).not.toEqual(worldB.log);
  });

  it("spreads: grass grows onto adjacent dirt with an open sky, eventually filling the whole plate", () => {
    const world = build3x3DirtPlate();
    const ticker = new RandomTicker(world, grassSpreadRules(), "spread-seed", {
      ticksPerSecond: 400,
      samplesPerChunkPerTick: 2048,
      maxChangesPerTick: 100000,
      maxChunksPerTick: 100,
    });

    let grassCount = 0;
    for (let i = 0; i < 30 && grassCount < 2304; i++) {
      ticker.update(1);
      grassCount = 0;
      for (const chunk of world.chunks.values()) {
        for (let x = 0; x < 16; x++) {
          for (let z = 0; z < 16; z++) {
            if (chunk.getBlock(x, 5, z) === BLOCK_ID.GRASS) grassCount++;
          }
        }
      }
    }

    expect(grassCount).toBe(2304);
  }, 30000);

  it("spreads diagonally and vertically: a dirt cell one block diagonally-up from grass converts; a dirt cell two blocks away with no grass neighbour never does", () => {
    const world = new FakeWorld();
    world.addChunk(0, 0, 0);
    world.seedBlock(0, 5, 0, BLOCK_ID.GRASS); // above (0,6,0) is AIR: stays grass, and is the spread source
    world.seedBlock(1, 6, 1, BLOCK_ID.DIRT); // dx=1, dy=1, dz=1 from the grass cell: within the 3x3x3 neighbourhood
    world.seedBlock(5, 5, 5, BLOCK_ID.DIRT); // far from any grass: must never convert

    const ticker = new RandomTicker(world, grassSpreadRules(), "diagonal-seed", {
      ticksPerSecond: 400,
      samplesPerChunkPerTick: 512,
      maxChangesPerTick: 1000,
      maxChunksPerTick: 10,
    });

    for (let i = 0; i < 20; i++) {
      ticker.update(1);
    }

    expect(world.getBlock(1, 6, 1)).toBe(BLOCK_ID.GRASS);
    expect(world.getBlock(5, 5, 5)).toBe(BLOCK_ID.DIRT);
  });

  it("decays: grass covered by an opaque block turns to dirt; grass under a transparent block or open sky does not", () => {
    const world = new FakeWorld();
    world.addChunk(0, 0, 0);

    world.seedBlock(0, 5, 0, BLOCK_ID.GRASS);
    world.seedBlock(0, 6, 0, BLOCK_ID.STONE); // opaque above -> decays to DIRT

    world.seedBlock(3, 5, 3, BLOCK_ID.GRASS);
    world.seedBlock(3, 6, 3, BLOCK_ID.LEAVES); // transparent above -> stays GRASS

    world.seedBlock(6, 5, 6, BLOCK_ID.GRASS); // AIR above (default) -> stays GRASS

    const ticker = new RandomTicker(world, grassSpreadRules(), "decay-seed", {
      ticksPerSecond: 400,
      samplesPerChunkPerTick: 512,
      maxChangesPerTick: 1000,
      maxChunksPerTick: 10,
    });

    for (let i = 0; i < 20; i++) {
      ticker.update(1);
    }

    expect(world.getBlock(0, 5, 0)).toBe(BLOCK_ID.DIRT);
    expect(world.getBlock(3, 5, 3)).toBe(BLOCK_ID.GRASS);
    expect(world.getBlock(6, 5, 6)).toBe(BLOCK_ID.GRASS);
  });

  describe("budget", () => {
    it("never records more than maxChangesPerTick setBlock calls in a single tick", () => {
      // Densely packed dirt-under-grass, guaranteed decays on every sample: worst case for the budget.
      const world = new FakeWorld();
      world.addChunk(0, 0, 0);
      for (let x = 0; x < 16; x++) {
        for (let z = 0; z < 16; z++) {
          world.seedBlock(x, 5, z, BLOCK_ID.GRASS);
          world.seedBlock(x, 6, z, BLOCK_ID.STONE); // opaque above every grass cell -> every sample decays it
        }
      }

      const ticker = new RandomTicker(world, grassSpreadRules(), "budget-seed", {
        ticksPerSecond: 20,
        samplesPerChunkPerTick: 3,
        maxChangesPerTick: 2,
        maxChunksPerTick: 10,
      });

      for (let i = 0; i < 50; i++) {
        const before = world.log.length;
        ticker.update(0.05); // exactly one tick per call at ticksPerSecond 20
        const changesThisTick = world.log.length - before;
        expect(changesThisTick).toBeLessThanOrEqual(2);
      }
    });

    it("update(0.049) at ticksPerSecond 20 runs no tick; a following update(0.002) crosses the threshold and runs exactly one", () => {
      const world = new FakeWorld();
      world.addChunk(0, 0, 0);
      // Every column decays on its first sample (opaque above every grass cell), so a
      // single tick with maxChangesPerTick 1 is guaranteed to record exactly one change.
      for (let x = 0; x < 16; x++) {
        for (let z = 0; z < 16; z++) {
          world.seedBlock(x, 5, z, BLOCK_ID.GRASS);
          world.seedBlock(x, 6, z, BLOCK_ID.STONE);
        }
      }

      const ticker = new RandomTicker(world, grassSpreadRules(), "threshold-seed", {
        ticksPerSecond: 20,
        samplesPerChunkPerTick: 200,
        maxChangesPerTick: 1,
        maxChunksPerTick: 10,
      });

      const changes1 = ticker.update(0.049);
      expect(changes1).toBe(0);
      expect(world.log.length).toBe(0);

      const changes2 = ticker.update(0.002);
      expect(changes2).toBe(1);
      expect(world.log.length).toBe(1);
    });

    it("update(0) is a no-op", () => {
      const world = build3x3DirtPlate();
      const ticker = new RandomTicker(world, grassSpreadRules(), "noop-seed");
      const changes = ticker.update(0);
      expect(changes).toBe(0);
      expect(world.log.length).toBe(0);
    });
  });

  it("every setBlock call carries source \"simulation\"", () => {
    const world = build3x3DirtPlate();
    const ticker = new RandomTicker(world, grassSpreadRules(), "source-seed", {
      ticksPerSecond: 400,
      samplesPerChunkPerTick: 512,
      maxChangesPerTick: 1000,
      maxChunksPerTick: 10,
    });

    for (let i = 0; i < 20; i++) {
      ticker.update(1);
    }

    expect(world.log.length).toBeGreaterThan(0);
    for (const entry of world.log) {
      expect(entry.source).toBe("simulation");
    }
  });

  it("does not throw and does not spread across an unloaded chunk boundary (getBlock falls back to AIR)", () => {
    const world = new FakeWorld();
    world.addChunk(0, 0, 0); // only one chunk loaded; its +x/+z neighbours are not
    // Place DIRT at the chunk's edge (x=15) with open sky; its would-be neighbour at x=16
    // lives in an unloaded chunk, so getBlock there must return AIR (not throw).
    world.seedBlock(15, 5, 15, BLOCK_ID.DIRT);
    world.seedBlock(15, 6, 15, BLOCK_ID.AIR);

    const ticker = new RandomTicker(world, grassSpreadRules(), "edge-seed", {
      ticksPerSecond: 400,
      samplesPerChunkPerTick: 4096,
      maxChangesPerTick: 1000,
      maxChunksPerTick: 10,
    });

    expect(() => {
      for (let i = 0; i < 20; i++) {
        ticker.update(1);
      }
    }).not.toThrow();

    // No grass anywhere in the loaded world, so this dirt cell had nothing to spread from.
    expect(world.getBlock(15, 5, 15)).toBe(BLOCK_ID.DIRT);
  });
});
