import { describe, it, expect, afterEach, vi } from "vitest";
import { ChunkManager } from "@engine/world/ChunkManager";
import type { Renderer } from "@engine/renderer/Renderer";
import type { ChunkMeshData } from "@engine/renderer/ChunkMeshBuilder";
import { BLOCK_ID } from "@data/blocks";
import { CHUNK_SIZE, SEA_LEVEL, CRYSTAL_SHARD_COUNT, WORLD_SIZE_BLOCKS } from "@engine/world/constants";
import { chunkKey } from "@lib/coords";
import { useSettingsStore } from "@store/useSettingsStore";

/**
 * Renderer's real constructor needs a WebGL canvas, unavailable under
 * vitest's `environment: 'node'`. This stub tracks exactly what ChunkManager
 * would have handed a real Renderer, keyed by chunk key, so tests can assert
 * on mesh presence/absence and vertex counts without touching WebGL.
 */
function createStubRenderer() {
  const meshes = new Map<string, { vertexCount: number }>();
  const addChunkMesh = vi.fn((key: string, meshData: ChunkMeshData) => {
    meshes.set(key, { vertexCount: meshData.vertexCount });
  });
  const removeChunkMesh = vi.fn((key: string) => {
    meshes.delete(key);
  });
  const renderer = { addChunkMesh, removeChunkMesh } as unknown as Renderer;
  return { renderer, meshes, addChunkMesh, removeChunkMesh };
}

/**
 * Both queues are time-budgeted per frame (CHUNK_GEN_BUDGET_MS,
 * CHUNK_MESH_BUDGET_MS) — a single call does not guarantee they empty.
 * Drive enough simulated frames that any pending work has to finish.
 */
function drainQueues(cm: ChunkManager, frames = 400): void {
  for (let i = 0; i < frames; i++) {
    cm.processGenerationQueue();
    cm.processMeshQueue();
  }
}

const originalRenderDistance = useSettingsStore.getState().renderDistance;

afterEach(() => {
  useSettingsStore.setState({ renderDistance: originalRenderDistance });
});

describe("ChunkManager unload/arrival remesh (C1, C2)", () => {
  it("re-meshes a surviving neighbour column after its unloaded neighbour is removed", () => {
    useSettingsStore.setState({ renderDistance: 1 });
    const { renderer, meshes, addChunkMesh } = createStubRenderer();
    const cm = new ChunkManager(renderer, "c1-unload-seed", "flat");

    // Spawns columns cx,cz in [-3,3] (radius 3) around (0,0).
    cm.generateSpawnArea(0, 0);

    // cy=0 is a fully solid slab in flat worlds (well below the surface),
    // so its boundary faces are a reliable, large signal for culling.
    const neighbourKey = chunkKey(-1, 0, 0);
    const before = meshes.get(neighbourKey)?.vertexCount ?? -1;
    expect(before).toBeGreaterThan(0);
    const callsBefore = addChunkMesh.mock.calls.filter((c) => c[0] === neighbourKey).length;

    // Move the player so column cx=-2 crosses the unload threshold
    // (renderDistance=1 -> unloadDist=3; dist(-2)=4>3 unloads) while its
    // immediate neighbour cx=-1 stays active in the buffer zone (dist=3,
    // not >3). Before the C1 fix, cx=-1 never gets told cx=-2 is gone and
    // keeps its stale, hole-free mesh — that's the invisible wall bug.
    cm.update(2 * CHUNK_SIZE, 0, 0);
    drainQueues(cm);

    const callsAfter = addChunkMesh.mock.calls.filter((c) => c[0] === neighbourKey).length;
    expect(callsAfter).toBeGreaterThan(callsBefore);

    const after = meshes.get(neighbourKey)!.vertexCount;
    expect(after).toBeGreaterThan(before);
  });

  it("regression guard: an edge column's boundary face is re-culled once its outside neighbour finally generates", () => {
    useSettingsStore.setState({ renderDistance: 1 });
    const { renderer, meshes } = createStubRenderer();
    const cm = new ChunkManager(renderer, "c2-arrive-seed", "flat");

    cm.generateSpawnArea(0, 0);

    // cx=-3 is the outer edge of the initial spawn batch: its -X neighbour
    // (cx=-4) doesn't exist yet, so it currently renders an "extra" face.
    const edgeKey = chunkKey(-3, 0, 0);
    const before = meshes.get(edgeKey)?.vertexCount ?? -1;
    expect(before).toBeGreaterThan(0);

    // Move toward -X so column cx=-4 enters render distance and generates,
    // becoming cx=-3's real neighbour.
    cm.update(-4 * CHUNK_SIZE, 0, 0);
    drainQueues(cm);

    const after = meshes.get(edgeKey)!.vertexCount;
    expect(after).toBeLessThan(before);
  });
});

describe("ChunkManager island border (C5)", () => {
  it("carves a solid, meshed perimeter ring without disturbing crystal count or the generated grid", () => {
    const { renderer, meshes } = createStubRenderer();
    const islandSize = WORLD_SIZE_BLOCKS;
    const cm = new ChunkManager(renderer, "c5-border-seed", "island", islandSize);

    // Island worlds generate synchronously on the first update() call.
    cm.update(islandSize / 2, 30, islandSize / 2);

    const wallTop = SEA_LEVEL + 6;
    const along = [0, 1, 16, 32, 64, 96, islandSize - 17, islandSize - 2, islandSize - 1];

    for (const y of [1, 5, SEA_LEVEL, wallTop]) {
      for (const c of along) {
        expect(cm.getBlock(0, y, c)).toBe(BLOCK_ID.STONE);
        expect(cm.getBlock(islandSize - 1, y, c)).toBe(BLOCK_ID.STONE);
        expect(cm.getBlock(c, y, 0)).toBe(BLOCK_ID.STONE);
        expect(cm.getBlock(c, y, islandSize - 1)).toBe(BLOCK_ID.STONE);
      }
    }

    // The extreme corner (0,0) sits past the island falloff radius, so
    // without the ring it is bare water/air. Above the ring's height the
    // falloff's own result (air) still shows through — the ring is a
    // coastal cliff, not a floor-to-sky curtain.
    expect(cm.getBlock(0, wallTop + 5, 0)).toBe(BLOCK_ID.AIR);

    // Real, meshed geometry: the corner chunk (which the falloff alone
    // would leave as little more than open water) now has visible faces.
    const cornerKey = chunkKey(0, 0, 0);
    expect(meshes.get(cornerKey)?.vertexCount ?? 0).toBeGreaterThan(0);

    // Never generates chunks outside [0, sizeChunks).
    const sizeChunks = islandSize / CHUNK_SIZE;
    const seenCx = new Set<number>();
    cm.forEachLoadedChunk((chunk) => seenCx.add(chunk.cx));
    expect(seenCx.has(-1)).toBe(false);
    expect(seenCx.has(sizeChunks)).toBe(false);

    // The ring must never overwrite a placed CRYSTAL, so the total count
    // survives generation unchanged.
    let crystalCount = 0;
    cm.forEachLoadedChunk((chunk) => {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        for (let y = 0; y < CHUNK_SIZE; y++) {
          for (let z = 0; z < CHUNK_SIZE; z++) {
            if (chunk.getBlock(x, y, z) === BLOCK_ID.CRYSTAL) crystalCount++;
          }
        }
      }
    });
    expect(crystalCount).toBe(CRYSTAL_SHARD_COUNT);
  });
});

describe("ChunkManager.forEachLoadedChunk (C6)", () => {
  it("visits every loaded chunk, and setBlock is immediately visible through getBlock", () => {
    const { renderer } = createStubRenderer();
    const cm = new ChunkManager(renderer, "c6-seed", "flat");
    cm.generateSpawnArea(0, 0);

    const seen = new Set<string>();
    cm.forEachLoadedChunk((chunk) => {
      seen.add(chunkKey(chunk.cx, chunk.cy, chunk.cz));
    });

    // radius-3 spawn -> 7x7 columns, 8 vertical layers each (flat streams
    // through the infinite-mode height).
    expect(seen.size).toBe(7 * 7 * 8);
    expect(seen.has(chunkKey(0, 0, 0))).toBe(true);

    cm.setBlock(0, 10, 0, BLOCK_ID.CRYSTAL);
    expect(cm.getBlock(0, 10, 0)).toBe(BLOCK_ID.CRYSTAL);
  });
});
