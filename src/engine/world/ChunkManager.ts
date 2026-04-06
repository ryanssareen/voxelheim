import { Chunk } from "@engine/world/Chunk";
import { Renderer } from "@engine/renderer/Renderer";
import { ChunkMeshBuilder, type GetUV } from "@engine/renderer/ChunkMeshBuilder";
import { BlockRegistry } from "@engine/world/BlockRegistry";
import { TerrainGenerator } from "@engine/generation/TerrainGenerator";
import { StructureGenerator } from "@engine/generation/StructureGenerator";
import { ATLAS_UVS } from "@data/atlasUVs";
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
  private readonly modifiedChunks = new Set<string>();
  private loaded = false;

  /** Resolves texture name to atlas UV coordinates. */
  private readonly getUV: GetUV = (textureName: string) => {
    const uv = ATLAS_UVS[textureName];
    if (uv) return uv;
    return { u0: 0, v0: 0, u1: 1, v1: 1 };
  };

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
      const meshData = ChunkMeshBuilder.buildMesh(chunk, {}, this.registry, this.getUV);
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
    this.modifiedChunks.add(key);

    // Re-mesh for immediate visual feedback
    const meshData = ChunkMeshBuilder.buildMesh(chunk, {}, this.registry, this.getUV);
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

  /** Returns the seed used for world generation. */
  getSeed(): string {
    return this.seed;
  }

  /** Returns block data for all chunks modified by the player. */
  getModifiedChunks(): Map<string, Uint8Array> {
    const result = new Map<string, Uint8Array>();
    for (const key of this.modifiedChunks) {
      const chunk = this.chunks.get(key);
      if (chunk) result.set(key, chunk.getBlockData());
    }
    return result;
  }

  /** Loads previously saved chunk modifications, overwriting generated data. */
  loadModifiedChunks(saved: Map<string, Uint8Array>): void {
    for (const [key, data] of saved) {
      const chunk = this.chunks.get(key);
      if (chunk) {
        chunk.setBlockData(data);
        this.modifiedChunks.add(key);
        // Re-mesh
        const meshData = ChunkMeshBuilder.buildMesh(chunk, {}, this.registry, this.getUV);
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

  /** Clears all state. */
  dispose(): void {
    this.chunks.clear();
    this.modifiedChunks.clear();
  }
}
