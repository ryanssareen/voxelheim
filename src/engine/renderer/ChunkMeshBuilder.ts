import { Chunk } from "@engine/world/Chunk";
import { BlockRegistry } from "@engine/world/BlockRegistry";
import { CHUNK_SIZE } from "@engine/world/constants";

export interface UVRect {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

export interface ChunkMeshData {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
  vertexCount: number;
  indexCount: number;
}

export type GetUV = (textureName: string) => UVRect;

const DEFAULT_GET_UV: GetUV = () => ({ u0: 0, v0: 0, u1: 1, v1: 1 });

export interface ChunkNeighbors {
  px?: Chunk;
  nx?: Chunk;
  py?: Chunk;
  ny?: Chunk;
  pz?: Chunk;
  nz?: Chunk;
}

const S = CHUNK_SIZE;

// Each face: direction to check, normal, 4 corner positions, texture face
// Corners are in order for two triangles: (0,1,2) and (2,3,0)
// This creates a proper quad with correct CCW winding viewed from outside.
const FACE_DATA = [
  // +X (right): face at x=1 plane
  { d: [1,0,0], n: [1,0,0], f: "side" as const, k: "px" as const,
    c: [[1,0,0],[1,1,0],[1,1,1],[1,0,1]] },
  // -X (left): face at x=0 plane
  { d: [-1,0,0], n: [-1,0,0], f: "side" as const, k: "nx" as const,
    c: [[0,0,1],[0,1,1],[0,1,0],[0,0,0]] },
  // +Y (top): face at y=1 plane
  { d: [0,1,0], n: [0,1,0], f: "top" as const, k: "py" as const,
    c: [[0,1,0],[0,1,1],[1,1,1],[1,1,0]] },
  // -Y (bottom): face at y=0 plane
  { d: [0,-1,0], n: [0,-1,0], f: "bottom" as const, k: "ny" as const,
    c: [[0,0,1],[0,0,0],[1,0,0],[1,0,1]] },
  // +Z (front): face at z=1 plane
  { d: [0,0,1], n: [0,0,1], f: "side" as const, k: "pz" as const,
    c: [[1,0,1],[1,1,1],[0,1,1],[0,0,1]] },
  // -Z (back): face at z=0 plane
  { d: [0,0,-1], n: [0,0,-1], f: "side" as const, k: "nz" as const,
    c: [[0,0,0],[0,1,0],[1,1,0],[1,0,0]] },
];

/**
 * Builds chunk mesh. One quad per visible block face.
 * Uses (0,1,2)(2,3,0) triangle winding for proper CCW front faces.
 */
export class ChunkMeshBuilder {
  static buildMesh(
    chunk: Chunk,
    neighbors: ChunkNeighbors,
    registry: BlockRegistry,
    getUV: GetUV = DEFAULT_GET_UV
  ): ChunkMeshData {
    const pos: number[] = [];
    const nor: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    let vc = 0;

    for (let y = 0; y < S; y++) {
      for (let z = 0; z < S; z++) {
        for (let x = 0; x < S; x++) {
          const bid = chunk.getBlock(x, y, z);
          if (!registry.isSolid(bid)) continue;

          const def = registry.getBlock(bid);

          for (const face of FACE_DATA) {
            const ax = x + face.d[0];
            const ay = y + face.d[1];
            const az = z + face.d[2];

            let adj: number;
            if (ax < 0 || ax >= S || ay < 0 || ay >= S || az < 0 || az >= S) {
              const nb = neighbors[face.k];
              adj = nb
                ? nb.getBlock(((ax % S) + S) % S, ((ay % S) + S) % S, ((az % S) + S) % S)
                : 0;
            } else {
              adj = chunk.getBlock(ax, ay, az);
            }

            if (registry.isSolid(adj) && !registry.isTransparent(adj)) continue;

            const tex = def ? def.textures[face.f] : "";
            const r = getUV(tex);

            // 4 vertices offset by block position
            for (const c of face.c) {
              pos.push(x + c[0], y + c[1], z + c[2]);
              nor.push(face.n[0], face.n[1], face.n[2]);
            }
            uv.push(r.u0, r.v1, r.u0, r.v0, r.u1, r.v0, r.u1, r.v1);

            // Triangles: (0,1,2) and (2,3,0)
            idx.push(vc, vc + 1, vc + 2, vc + 2, vc + 3, vc);
            vc += 4;
          }
        }
      }
    }

    return {
      positions: new Float32Array(pos),
      normals: new Float32Array(nor),
      uvs: new Float32Array(uv),
      indices: new Uint32Array(idx),
      vertexCount: vc,
      indexCount: idx.length,
    };
  }
}
