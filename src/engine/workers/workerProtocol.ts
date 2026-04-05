import type { ChunkMeshData } from "@engine/renderer/ChunkMeshBuilder";

/** Messages sent from the main thread to the terrain worker. */
export type MainToWorker = {
  type: "generateChunk";
  cx: number;
  cy: number;
  cz: number;
  seed: string;
  requestId: string;
};

/** Messages sent from the terrain worker back to the main thread. */
export type WorkerToMain =
  | {
      type: "chunkReady";
      cx: number;
      cy: number;
      cz: number;
      meshData: ChunkMeshData;
      blockData: Uint8Array;
      requestId: string;
    }
  | {
      type: "error";
      message: string;
      requestId: string;
    };
