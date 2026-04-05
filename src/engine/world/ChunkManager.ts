import { Chunk } from "@engine/world/Chunk";
import { Renderer } from "@engine/renderer/Renderer";
import { ChunkMeshBuilder } from "@engine/renderer/ChunkMeshBuilder";
import { BlockRegistry } from "@engine/world/BlockRegistry";
import { TerrainGenerator } from "@engine/generation/TerrainGenerator";
import { StructureGenerator } from "@engine/generation/StructureGenerator";
import {
  CHUNK_SIZE,
  WORLD_SIZE_CHUNKS,
  WORLD_HEIGHT_CHUNKS,
} from "@engine/world/constants";
import { worldToChunk, worldToLocal, chunkKey } from "@lib/coords";

/**
 * Manages chunk storage, generation, and rendering.
 * Generates all chunks synchronously on the main thread for MVP reliability.
 */
export class ChunkManager {
  private readonly renderer: Renderer;
  private readonly seed: string;
  private readonly registry = BlockRegistry.getInstance();
  private readonly chunks = new Map<string, Chunk>();
  private loaded = false;

  constructor(renderer: Renderer, seed: string) {
    this.renderer = renderer;
    this.seed = seed;
  }

  /**
   * Generates all world chunks on first call.
   * Runs synchronously — blocks the main thread briefly but guarantees
   * chunks are available before player physics runs.
   */
  update(_playerX: number, _playerY: number, _playerZ: number): void {
    if (this.loaded) return;
    this.loaded = true;

    const gen = new TerrainGenerator(this.seed);
    const surfaceMap = new Map<string, number>();

    // Generate all chunks
    for (let cx = 0; cx < WORLD_SIZE_CHUNKS; cx++) {
      for (let cy = 0; cy < WORLD_HEIGHT_CHUNKS; cy++) {
        for (let cz = 0; cz < WORLD_SIZE_CHUNKS; cz++) {
          const chunk = gen.generateChunk(cx, cy, cz, surfaceMap);
          this.chunks.set(chunkKey(cx, cy, cz), chunk);
        }
      }
    }

    // Place crystals and trees
    gen.placeCrystals(this.chunks, surfaceMap);
    const structGen = new StructureGenerator(this.seed);
    structGen.placeTrees(this.chunks, surfaceMap);

    // Build meshes and add to renderer
    for (const [key, chunk] of this.chunks) {
      const meshData = ChunkMeshBuilder.buildMesh(chunk, {}, this.registry);
      this.renderer.addChunkMesh(
        key,
        meshData,
        chunk.cx * CHUNK_SIZE,
        chunk.cy * CHUNK_SIZE,
        chunk.cz * CHUNK_SIZE
      );
    }
  }

  /** Returns the block ID at world coordinates, or 0 (AIR) if chunk not loaded. */
  getBlock(wx: number, wy: number, wz: number): number {
    const { cx, cy, cz } = worldToChunk(wx, wy, wz);
    const chunk = this.chunks.get(chunkKey(cx, cy, cz));
    if (!chunk) return 0;
    const { lx, ly, lz } = worldToLocal(wx, wy, wz);
    return chunk.getBlock(lx, ly, lz);
  }

  /** Sets a block at world coordinates and triggers a local re-mesh. */
  setBlock(wx: number, wy: number, wz: number, blockId: number): void {
    const { cx, cy, cz } = worldToChunk(wx, wy, wz);
    const key = chunkKey(cx, cy, cz);
    const chunk = this.chunks.get(key);
    if (!chunk) return;

    const { lx, ly, lz } = worldToLocal(wx, wy, wz);
    chunk.setBlock(lx, ly, lz, blockId);

    // Re-mesh for immediate visual feedback
    const meshData = ChunkMeshBuilder.buildMesh(chunk, {}, this.registry);
    this.renderer.addChunkMesh(
      key,
      meshData,
      cx * CHUNK_SIZE,
      cy * CHUNK_SIZE,
      cz * CHUNK_SIZE
    );
  }

  /** Returns true when all world chunks have been generated. */
  isFullyLoaded(): boolean {
    return this.loaded;
  }

  /** Clears all state. */
  dispose(): void {
    this.chunks.clear();
  }
}
