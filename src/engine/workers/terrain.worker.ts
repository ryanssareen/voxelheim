import { TerrainGenerator } from "@engine/generation/TerrainGenerator";
import { ChunkMeshBuilder } from "@engine/renderer/ChunkMeshBuilder";
import { BlockRegistry } from "@engine/world/BlockRegistry";
import type { MainToWorker, WorkerToMain } from "@engine/workers/workerProtocol";

const generatorCache = new Map<string, TerrainGenerator>();
const registry = BlockRegistry.getInstance();

function getGenerator(seed: string): TerrainGenerator {
  let gen = generatorCache.get(seed);
  if (!gen) {
    gen = new TerrainGenerator(seed);
    generatorCache.set(seed, gen);
  }
  return gen;
}

self.onmessage = (event: MessageEvent<MainToWorker>) => {
  const msg = event.data;

  if (msg.type === "generateChunk") {
    try {
      const gen = getGenerator(msg.seed);
      const chunk = gen.generateChunk(msg.cx, msg.cy, msg.cz);
      const meshData = ChunkMeshBuilder.buildMesh(chunk, {}, registry);

      const response: WorkerToMain = {
        type: "chunkReady",
        cx: msg.cx,
        cy: msg.cy,
        cz: msg.cz,
        meshData,
        requestId: msg.requestId,
      };

      // Transfer ArrayBuffers for zero-copy
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (self.postMessage as any)(response, [
        meshData.positions.buffer,
        meshData.normals.buffer,
        meshData.uvs.buffer,
        meshData.indices.buffer,
      ]);
    } catch (err) {
      const response: WorkerToMain = {
        type: "error",
        message: err instanceof Error ? err.message : String(err),
        requestId: msg.requestId,
      };
      self.postMessage(response);
    }
  }
};
