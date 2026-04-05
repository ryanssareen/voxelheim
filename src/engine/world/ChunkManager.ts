import { Chunk } from "@engine/world/Chunk";
import { Renderer } from "@engine/renderer/Renderer";
import { ChunkMeshBuilder } from "@engine/renderer/ChunkMeshBuilder";
import { BlockRegistry } from "@engine/world/BlockRegistry";
import {
  CHUNK_SIZE,
  WORLD_SIZE_CHUNKS,
  WORLD_HEIGHT_CHUNKS,
} from "@engine/world/constants";
import { worldToChunk, worldToLocal, chunkKey } from "@lib/coords";
import type { WorkerToMain, MainToWorker } from "@engine/workers/workerProtocol";
import type { ChunkMeshData } from "@engine/renderer/ChunkMeshBuilder";

/**
 * Coordinates worker-based chunk loading and provides block get/set access.
 */
export class ChunkManager {
  private readonly renderer: Renderer;
  private readonly seed: string;
  private readonly registry = BlockRegistry.getInstance();
  private readonly chunks = new Map<string, Chunk>();
  private readonly pending = new Set<string>();
  private worker: Worker | null = null;
  private requestCounter = 0;
  private initialized = false;

  constructor(renderer: Renderer, seed: string) {
    this.renderer = renderer;
    this.seed = seed;

    this.worker = new Worker(
      new URL("../workers/terrain.worker.ts", import.meta.url),
      { type: "module" }
    );

    this.worker.onmessage = (event: MessageEvent<WorkerToMain>) => {
      const msg = event.data;
      if (msg.type === "chunkReady") {
        this.onChunkReady(msg.cx, msg.cy, msg.cz, msg.meshData, msg.blockData);
      } else if (msg.type === "error") {
        console.error(`Worker error (request ${msg.requestId}):`, msg.message);
      }
    };
  }

  /**
   * Requests all world chunks on first call.
   * Subsequent calls are no-ops for MVP (no dynamic loading).
   */
  update(_playerX: number, _playerY: number, _playerZ: number): void {
    if (this.initialized) return;
    this.initialized = true;

    for (let cx = 0; cx < WORLD_SIZE_CHUNKS; cx++) {
      for (let cy = 0; cy < WORLD_HEIGHT_CHUNKS; cy++) {
        for (let cz = 0; cz < WORLD_SIZE_CHUNKS; cz++) {
          const key = chunkKey(cx, cy, cz);
          if (this.pending.has(key) || this.chunks.has(key)) continue;

          this.pending.add(key);
          const msg: MainToWorker = {
            type: "generateChunk",
            cx,
            cy,
            cz,
            seed: this.seed,
            requestId: String(this.requestCounter++),
          };
          this.worker?.postMessage(msg);
        }
      }
    }
  }

  /** Handles a completed chunk from the worker. */
  private onChunkReady(
    cx: number,
    cy: number,
    cz: number,
    meshData: ChunkMeshData,
    blockData: Uint8Array
  ): void {
    const key = chunkKey(cx, cy, cz);
    this.pending.delete(key);

    const chunk = new Chunk(cx, cy, cz);
    chunk.setBlockData(blockData);
    chunk.dirty = false;
    this.chunks.set(key, chunk);

    this.renderer.addChunkMesh(
      key,
      meshData,
      cx * CHUNK_SIZE,
      cy * CHUNK_SIZE,
      cz * CHUNK_SIZE
    );
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

    // Synchronous main-thread re-mesh for immediate feedback
    const meshData = ChunkMeshBuilder.buildMesh(chunk, {}, this.registry);
    this.renderer.addChunkMesh(
      key,
      meshData,
      cx * CHUNK_SIZE,
      cy * CHUNK_SIZE,
      cz * CHUNK_SIZE
    );
  }

  /** Returns true when all world chunks have been received from the worker. */
  isFullyLoaded(): boolean {
    return (
      this.chunks.size >=
      WORLD_SIZE_CHUNKS * WORLD_HEIGHT_CHUNKS * WORLD_SIZE_CHUNKS
    );
  }

  /** Terminates the worker and clears all state. */
  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
    this.chunks.clear();
    this.pending.clear();
  }
}
