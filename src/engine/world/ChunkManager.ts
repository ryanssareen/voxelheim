import { Chunk } from "@engine/world/Chunk";
import { Renderer } from "@engine/renderer/Renderer";
import { ChunkMeshBuilder, type GetUV, type ChunkNeighbors } from "@engine/renderer/ChunkMeshBuilder";
import { BlockRegistry } from "@engine/world/BlockRegistry";
import { TerrainGenerator } from "@engine/generation/TerrainGenerator";
import { StructureGenerator } from "@engine/generation/StructureGenerator";
import { ATLAS_UVS } from "@data/atlasUVs";
import {
  CHUNK_SIZE,
  WORLD_SIZE_CHUNKS,
  WORLD_HEIGHT_CHUNKS,
  WORLD_HEIGHT_CHUNKS_INFINITE,
  CHUNK_GEN_BUDGET_MS,
  CHUNK_MESH_BUDGET_MS,
  type WorldType,
} from "@engine/world/constants";
import { worldToChunk, worldToLocal, chunkKey } from "@lib/coords";
import { useSettingsStore } from "@store/useSettingsStore";

export type BlockChangeSource = "local" | "remote";

/**
 * Manages chunk storage, generation, and rendering.
 * For island/flat worlds: generates all chunks synchronously on first update.
 * For infinite worlds: streams chunks dynamically around the player.
 */
export class ChunkManager {
  private readonly renderer: Renderer;
  private readonly seed: string;
  readonly worldType: WorldType;
  private readonly sizeChunks: number;
  private readonly heightChunks: number;
  private readonly registry = BlockRegistry.getInstance();
  private readonly chunks = new Map<string, Chunk>();
  private readonly modifiedChunks = new Set<string>();
  private loaded = false;

  // --- Infinite-mode streaming state ---
  private readonly terrainGen: TerrainGenerator;
  private readonly structureGen: StructureGenerator;
  private readonly pendingGeneration = new Map<string, number>(); // key -> priority (dist²)
  private readonly pendingMesh = new Set<string>();
  private readonly activeColumns = new Set<string>(); // "cx,cz"
  private lastPlayerCX = -99999;
  private lastPlayerCZ = -99999;
  private readonly savedModifications = new Map<string, Uint8Array>();
  private blockChangeListener:
    | ((change: { x: number; y: number; z: number; blockId: number; source: BlockChangeSource }) => void)
    | null = null;

  private readonly getUV: GetUV = (textureName: string) => {
    const uv = ATLAS_UVS[textureName];
    if (uv) return uv;
    return { u0: 0, v0: 0, u1: 1, v1: 1 };
  };

  constructor(renderer: Renderer, seed: string, worldType: WorldType = "island") {
    this.renderer = renderer;
    this.seed = seed;
    this.worldType = worldType;
    this.sizeChunks = worldType === "infinite" ? 0 : WORLD_SIZE_CHUNKS;
    this.heightChunks = worldType === "infinite" ? WORLD_HEIGHT_CHUNKS_INFINITE : WORLD_HEIGHT_CHUNKS;
    this.terrainGen = new TerrainGenerator(seed, worldType);
    this.structureGen = new StructureGenerator(seed);
  }

  // ──────────────────────────────────────────────
  //  Island / Flat — one-shot generation (unchanged)
  // ──────────────────────────────────────────────

  private generateFiniteWorld(): void {
    const surfaceMap = new Map<string, number>();

    for (let cx = 0; cx < this.sizeChunks; cx++) {
      for (let cy = 0; cy < WORLD_HEIGHT_CHUNKS; cy++) {
        for (let cz = 0; cz < this.sizeChunks; cz++) {
          const chunk = this.terrainGen.generateChunk(cx, cy, cz, surfaceMap);
          this.chunks.set(chunkKey(cx, cy, cz), chunk);
        }
      }
    }

    this.terrainGen.placeCrystals(this.chunks, surfaceMap);
    this.structureGen.placeTrees(this.chunks, surfaceMap);

    for (const [key, chunk] of this.chunks) {
      const neighbors = this.getNeighbors(chunk.cx, chunk.cy, chunk.cz);
      const meshData = ChunkMeshBuilder.buildMesh(chunk, neighbors, this.registry, this.getUV);
      this.renderer.addChunkMesh(
        key,
        meshData,
        chunk.cx * CHUNK_SIZE,
        chunk.cy * CHUNK_SIZE,
        chunk.cz * CHUNK_SIZE
      );
    }
  }

  // ──────────────────────────────────────────────
  //  Infinite — synchronous bootstrap (spawn area)
  // ──────────────────────────────────────────────

  generateSpawnArea(playerX: number, playerZ: number): void {
    const pcx = Math.floor(playerX / CHUNK_SIZE);
    const pcz = Math.floor(playerZ / CHUNK_SIZE);
    const radius = 3;

    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        const colCx = pcx + dx;
        const colCz = pcz + dz;
        this.generateColumn(colCx, colCz);
        this.activeColumns.add(`${colCx},${colCz}`);
      }
    }

    // Build meshes for all generated chunks
    for (const [key, chunk] of this.chunks) {
      const neighbors = this.getNeighbors(chunk.cx, chunk.cy, chunk.cz);
      const meshData = ChunkMeshBuilder.buildMesh(chunk, neighbors, this.registry, this.getUV);
      this.renderer.addChunkMesh(
        key,
        meshData,
        chunk.cx * CHUNK_SIZE,
        chunk.cy * CHUNK_SIZE,
        chunk.cz * CHUNK_SIZE
      );
    }

    this.lastPlayerCX = pcx;
    this.lastPlayerCZ = pcz;
    this.loaded = true;
  }

  // ──────────────────────────────────────────────
  //  Public update — called every frame
  // ──────────────────────────────────────────────

  update(playerX: number, playerY: number, playerZ: number): void {
    if (this.worldType !== "infinite") {
      if (!this.loaded) {
        this.loaded = true;
        this.generateFiniteWorld();
      }
      return;
    }

    // Infinite mode: stream chunks around player
    if (!this.loaded) return; // generateSpawnArea must be called first

    const pcx = Math.floor(playerX / CHUNK_SIZE);
    const pcz = Math.floor(playerZ / CHUNK_SIZE);

    // Only re-scan columns when player crosses a chunk boundary
    if (pcx === this.lastPlayerCX && pcz === this.lastPlayerCZ) return;
    this.lastPlayerCX = pcx;
    this.lastPlayerCZ = pcz;

    const renderDist = useSettingsStore.getState().renderDistance;
    const unloadDist = renderDist + 2;

    // Build desired column set via spiral
    const desired = new Set<string>();
    for (const [dx, dz] of spiralOffsets(renderDist)) {
      desired.add(`${pcx + dx},${pcz + dz}`);
    }

    // Unload columns outside range
    for (const colKey of this.activeColumns) {
      if (!desired.has(colKey)) {
        const [ccx, ccz] = colKey.split(",").map(Number);
        const dist = Math.max(Math.abs(ccx - pcx), Math.abs(ccz - pcz));
        if (dist > unloadDist) {
          this.unloadColumn(ccx, ccz);
          this.activeColumns.delete(colKey);
        }
      }
    }

    // Enqueue new columns
    for (const colKey of desired) {
      if (!this.activeColumns.has(colKey)) {
        const [ccx, ccz] = colKey.split(",").map(Number);
        const dist2 = (ccx - pcx) ** 2 + (ccz - pcz) ** 2;
        // Enqueue all cy layers for this column
        for (let cy = 0; cy < this.heightChunks; cy++) {
          const key = chunkKey(ccx, cy, ccz);
          if (!this.chunks.has(key)) {
            this.pendingGeneration.set(key, dist2);
          }
        }
        this.activeColumns.add(colKey);
      }
    }
  }

  // ──────────────────────────────────────────────
  //  Time-budgeted generation queue
  // ──────────────────────────────────────────────

  processGenerationQueue(): void {
    if (this.pendingGeneration.size === 0) return;

    const start = performance.now();

    // Sort by priority (closest first) — group by column
    const columnPriorities = new Map<string, number>();
    for (const [key, dist2] of this.pendingGeneration) {
      const parts = key.split(",");
      const colKey = `${parts[0]},${parts[2]}`;
      const existing = columnPriorities.get(colKey);
      if (existing === undefined || dist2 < existing) {
        columnPriorities.set(colKey, dist2);
      }
    }

    // Sort columns by distance
    const sortedCols = [...columnPriorities.entries()].sort((a, b) => a[1] - b[1]);

    for (const [colKey] of sortedCols) {
      if (performance.now() - start > CHUNK_GEN_BUDGET_MS) break;

      const [ccx, ccz] = colKey.split(",").map(Number);

      // Check if entire column is still pending
      let anyPending = false;
      for (let cy = 0; cy < this.heightChunks; cy++) {
        if (this.pendingGeneration.has(chunkKey(ccx, cy, ccz))) {
          anyPending = true;
          break;
        }
      }
      if (!anyPending) continue;

      // Generate full column at once
      this.generateColumn(ccx, ccz);

      // Remove from pending, add to mesh queue
      for (let cy = 0; cy < this.heightChunks; cy++) {
        const key = chunkKey(ccx, cy, ccz);
        this.pendingGeneration.delete(key);
        this.pendingMesh.add(key);
      }

      // Also mark neighbors for re-mesh (they now have a new neighbor)
      this.markNeighborColumnsForRemesh(ccx, ccz);
    }
  }

  // ──────────────────────────────────────────────
  //  Time-budgeted mesh queue
  // ──────────────────────────────────────────────

  processMeshQueue(): void {
    if (this.pendingMesh.size === 0) return;

    const start = performance.now();
    const pcx = this.lastPlayerCX;
    const pcz = this.lastPlayerCZ;

    // Sort by distance to player
    const sorted = [...this.pendingMesh].sort((a, b) => {
      const [ax, , az] = a.split(",").map(Number);
      const [bx, , bz] = b.split(",").map(Number);
      const da = (ax - pcx) ** 2 + (az - pcz) ** 2;
      const db = (bx - pcx) ** 2 + (bz - pcz) ** 2;
      return da - db;
    });

    for (const key of sorted) {
      if (performance.now() - start > CHUNK_MESH_BUDGET_MS) break;

      const chunk = this.chunks.get(key);
      if (!chunk) {
        this.pendingMesh.delete(key);
        continue;
      }

      const neighbors = this.getNeighbors(chunk.cx, chunk.cy, chunk.cz);
      const meshData = ChunkMeshBuilder.buildMesh(chunk, neighbors, this.registry, this.getUV);
      this.renderer.addChunkMesh(
        key,
        meshData,
        chunk.cx * CHUNK_SIZE,
        chunk.cy * CHUNK_SIZE,
        chunk.cz * CHUNK_SIZE
      );
      this.pendingMesh.delete(key);
    }
  }

  // ──────────────────────────────────────────────
  //  Column generation (all cy layers)
  // ──────────────────────────────────────────────

  private generateColumn(ccx: number, ccz: number): void {
    for (let cy = 0; cy < this.heightChunks; cy++) {
      const key = chunkKey(ccx, cy, ccz);
      if (this.chunks.has(key)) continue;

      const chunk = this.terrainGen.generateChunk(ccx, cy, ccz);
      this.structureGen.decorateChunk(ccx, cy, ccz, this.terrainGen, chunk);

      // Apply saved modifications if any
      const saved = this.savedModifications.get(key);
      if (saved) {
        chunk.setBlockData(saved);
        this.modifiedChunks.add(key);
        this.savedModifications.delete(key);
      }

      this.chunks.set(key, chunk);
    }
  }

  // ──────────────────────────────────────────────
  //  Column unloading
  // ──────────────────────────────────────────────

  private unloadColumn(ccx: number, ccz: number): void {
    for (let cy = 0; cy < this.heightChunks; cy++) {
      const key = chunkKey(ccx, cy, ccz);
      this.renderer.removeChunkMesh(key);
      this.chunks.delete(key);
      this.pendingGeneration.delete(key);
      this.pendingMesh.delete(key);
    }
  }

  // ──────────────────────────────────────────────
  //  Neighbor helpers
  // ──────────────────────────────────────────────

  private getNeighbors(cx: number, cy: number, cz: number): ChunkNeighbors {
    return {
      px: this.chunks.get(chunkKey(cx + 1, cy, cz)),
      nx: this.chunks.get(chunkKey(cx - 1, cy, cz)),
      py: this.chunks.get(chunkKey(cx, cy + 1, cz)),
      ny: this.chunks.get(chunkKey(cx, cy - 1, cz)),
      pz: this.chunks.get(chunkKey(cx, cy, cz + 1)),
      nz: this.chunks.get(chunkKey(cx, cy, cz - 1)),
    };
  }

  private markNeighborColumnsForRemesh(ccx: number, ccz: number): void {
    const offsets = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (const [dx, dz] of offsets) {
      const nx = ccx + dx;
      const nz = ccz + dz;
      for (let cy = 0; cy < this.heightChunks; cy++) {
        const key = chunkKey(nx, cy, nz);
        if (this.chunks.has(key)) {
          this.pendingMesh.add(key);
        }
      }
    }
  }

  // ──────────────────────────────────────────────
  //  Block access
  // ──────────────────────────────────────────────

  setBlockChangeListener(
    listener:
      | ((change: { x: number; y: number; z: number; blockId: number; source: BlockChangeSource }) => void)
      | null
  ): void {
    this.blockChangeListener = listener;
  }

  getBlock(wx: number, wy: number, wz: number): number {
    const { cx, cy, cz } = worldToChunk(wx, wy, wz);
    const chunk = this.chunks.get(chunkKey(cx, cy, cz));
    if (!chunk) {
      if (this.worldType === "infinite") {
        // Bedrock floor — never fall below y=0
        if (wy <= 0) return 3;
        // Unloaded chunks: use noise-estimated surface to prevent falling through
        const surfaceY = this.terrainGen.getSurfaceHeight(wx, wz);
        return wy <= surfaceY ? 3 : 0; // STONE below surface, AIR above
      }
      // Finite worlds: barrier walls at edges
      if (this.worldType !== "island") {
        const worldBlocks = this.sizeChunks * CHUNK_SIZE;
        if (wx < 0 || wx >= worldBlocks || wz < 0 || wz >= worldBlocks) {
          return wy >= 0 ? 3 : 0;
        }
        if (wy < 0) return 3;
      }
      return 0;
    }
    const { lx, ly, lz } = worldToLocal(wx, wy, wz);
    return chunk.getBlock(lx, ly, lz);
  }

  setBlock(
    wx: number,
    wy: number,
    wz: number,
    blockId: number,
    source: BlockChangeSource = "local"
  ): void {
    const { cx, cy, cz } = worldToChunk(wx, wy, wz);
    const key = chunkKey(cx, cy, cz);
    const chunk = this.chunks.get(key);
    if (!chunk) return;

    const { lx, ly, lz } = worldToLocal(wx, wy, wz);
    chunk.setBlock(lx, ly, lz, blockId);
    this.modifiedChunks.add(key);

    // Re-mesh this chunk immediately for visual feedback
    const neighbors = this.getNeighbors(cx, cy, cz);
    const meshData = ChunkMeshBuilder.buildMesh(chunk, neighbors, this.registry, this.getUV);
    this.renderer.addChunkMesh(
      key,
      meshData,
      cx * CHUNK_SIZE,
      cy * CHUNK_SIZE,
      cz * CHUNK_SIZE
    );

    // If block is on a chunk boundary, re-mesh the neighbor too
    if (lx === 0) this.remeshIfLoaded(cx - 1, cy, cz);
    if (lx === CHUNK_SIZE - 1) this.remeshIfLoaded(cx + 1, cy, cz);
    if (ly === 0) this.remeshIfLoaded(cx, cy - 1, cz);
    if (ly === CHUNK_SIZE - 1) this.remeshIfLoaded(cx, cy + 1, cz);
    if (lz === 0) this.remeshIfLoaded(cx, cy, cz - 1);
    if (lz === CHUNK_SIZE - 1) this.remeshIfLoaded(cx, cy, cz + 1);

    this.blockChangeListener?.({
      x: wx,
      y: wy,
      z: wz,
      blockId,
      source,
    });
  }

  private remeshIfLoaded(cx: number, cy: number, cz: number): void {
    const key = chunkKey(cx, cy, cz);
    const chunk = this.chunks.get(key);
    if (!chunk) return;
    const neighbors = this.getNeighbors(cx, cy, cz);
    const meshData = ChunkMeshBuilder.buildMesh(chunk, neighbors, this.registry, this.getUV);
    this.renderer.addChunkMesh(key, meshData, cx * CHUNK_SIZE, cy * CHUNK_SIZE, cz * CHUNK_SIZE);
  }

  // ──────────────────────────────────────────────
  //  Persistence
  // ──────────────────────────────────────────────

  isFullyLoaded(): boolean {
    return this.loaded;
  }

  getSeed(): string {
    return this.seed;
  }

  getTerrainGenerator(): TerrainGenerator {
    return this.terrainGen;
  }

  getModifiedChunks(): Map<string, Uint8Array> {
    const result = new Map<string, Uint8Array>();
    for (const key of this.modifiedChunks) {
      const chunk = this.chunks.get(key);
      if (chunk) result.set(key, chunk.getBlockData());
    }
    // Also include deferred modifications not yet applied
    for (const [key, data] of this.savedModifications) {
      result.set(key, data);
    }
    return result;
  }

  loadModifiedChunks(saved: Map<string, Uint8Array>): void {
    if (this.worldType === "infinite") {
      // Defer: store for later application when chunks generate
      for (const [key, data] of saved) {
        if (this.chunks.has(key)) {
          // Chunk already loaded (spawn area) — apply immediately
          const chunk = this.chunks.get(key)!;
          chunk.setBlockData(data);
          this.modifiedChunks.add(key);
          // Re-mesh
          const neighbors = this.getNeighbors(chunk.cx, chunk.cy, chunk.cz);
          const meshData = ChunkMeshBuilder.buildMesh(chunk, neighbors, this.registry, this.getUV);
          this.renderer.addChunkMesh(
            key,
            meshData,
            chunk.cx * CHUNK_SIZE,
            chunk.cy * CHUNK_SIZE,
            chunk.cz * CHUNK_SIZE
          );
        } else {
          this.savedModifications.set(key, data);
        }
      }
    } else {
      // Finite: apply immediately (all chunks exist)
      for (const [key, data] of saved) {
        const chunk = this.chunks.get(key);
        if (chunk) {
          chunk.setBlockData(data);
          this.modifiedChunks.add(key);
          const neighbors = this.getNeighbors(chunk.cx, chunk.cy, chunk.cz);
          const meshData = ChunkMeshBuilder.buildMesh(chunk, neighbors, this.registry, this.getUV);
          this.renderer.addChunkMesh(
            key,
            meshData,
            chunk.cx * CHUNK_SIZE,
            chunk.cy * CHUNK_SIZE,
            chunk.cz * CHUNK_SIZE
          );
        }
      }
    }
  }

  dispose(): void {
    this.chunks.clear();
    this.modifiedChunks.clear();
    this.pendingGeneration.clear();
    this.pendingMesh.clear();
    this.activeColumns.clear();
    this.savedModifications.clear();
  }
}

// ──────────────────────────────────────────────
//  Spiral iteration for distance-ordered loading
// ──────────────────────────────────────────────

function spiralOffsets(radius: number): Array<[number, number]> {
  const offsets: Array<[number, number]> = [];
  for (let r = 0; r <= radius; r++) {
    if (r === 0) {
      offsets.push([0, 0]);
      continue;
    }
    // Top edge: x from -r to r, z = -r
    for (let x = -r; x <= r; x++) offsets.push([x, -r]);
    // Right edge: x = r, z from -r+1 to r
    for (let z = -r + 1; z <= r; z++) offsets.push([r, z]);
    // Bottom edge: x from r-1 to -r, z = r
    for (let x = r - 1; x >= -r; x--) offsets.push([x, r]);
    // Left edge: x = -r, z from r-1 to -r+1
    for (let z = r - 1; z >= -r + 1; z--) offsets.push([-r, z]);
  }
  return offsets;
}
