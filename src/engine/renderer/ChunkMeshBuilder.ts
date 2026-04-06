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

/**
 * Each face definition: direction offset, normal, and 4 vertex offsets
 * relative to the block origin (x, y, z).
 * Vertices are in CCW order when viewed from outside the block.
 */
const FACES: Array<{
  dir: [number, number, number];
  normal: [number, number, number];
  verts: [number, number, number][];
  faceName: "top" | "bottom" | "side";
  neighborKey: keyof ChunkNeighbors;
}> = [
  {
    // +X face (right)
    dir: [1, 0, 0],
    normal: [1, 0, 0],
    verts: [
      [1, 0, 1],
      [1, 1, 1],
      [1, 1, 0],
      [1, 0, 0],
    ],
    faceName: "side",
    neighborKey: "px",
  },
  {
    // -X face (left)
    dir: [-1, 0, 0],
    normal: [-1, 0, 0],
    verts: [
      [0, 0, 0],
      [0, 1, 0],
      [0, 1, 1],
      [0, 0, 1],
    ],
    faceName: "side",
    neighborKey: "nx",
  },
  {
    // +Y face (top)
    dir: [0, 1, 0],
    normal: [0, 1, 0],
    verts: [
      [0, 1, 0],
      [1, 1, 0],
      [1, 1, 1],
      [0, 1, 1],
    ],
    faceName: "top",
    neighborKey: "py",
  },
  {
    // -Y face (bottom)
    dir: [0, -1, 0],
    normal: [0, -1, 0],
    verts: [
      [0, 0, 1],
      [1, 0, 1],
      [1, 0, 0],
      [0, 0, 0],
    ],
    faceName: "bottom",
    neighborKey: "ny",
  },
  {
    // +Z face (front)
    dir: [0, 0, 1],
    normal: [0, 0, 1],
    verts: [
      [0, 0, 1],
      [0, 1, 1],
      [1, 1, 1],
      [1, 0, 1],
    ],
    faceName: "side",
    neighborKey: "pz",
  },
  {
    // -Z face (back)
    dir: [0, 0, -1],
    normal: [0, 0, -1],
    verts: [
      [1, 0, 0],
      [1, 1, 0],
      [0, 1, 0],
      [0, 0, 0],
    ],
    faceName: "side",
    neighborKey: "nz",
  },
];

/**
 * Builds chunk mesh by emitting one quad per visible face.
 * Simple and correct — no greedy merging for now.
 */
export class ChunkMeshBuilder {
  static buildMesh(
    chunk: Chunk,
    neighbors: ChunkNeighbors,
    registry: BlockRegistry,
    getUV: GetUV = DEFAULT_GET_UV
  ): ChunkMeshData {
    // Max: 16^3 blocks * 6 faces * 4 verts = 98304 verts
    const maxQuads = S * S * S * 6;
    const positions = new Float32Array(maxQuads * 4 * 3);
    const normals = new Float32Array(maxQuads * 4 * 3);
    const uvs = new Float32Array(maxQuads * 4 * 2);
    const indices = new Uint32Array(maxQuads * 6);
    let vi = 0;
    let ii = 0;

    for (let y = 0; y < S; y++) {
      for (let z = 0; z < S; z++) {
        for (let x = 0; x < S; x++) {
          const blockId = chunk.getBlock(x, y, z);
          if (!registry.isSolid(blockId)) continue;

          const blockDef = registry.getBlock(blockId);

          for (const face of FACES) {
            const nx = x + face.dir[0];
            const ny = y + face.dir[1];
            const nz = z + face.dir[2];

            // Get adjacent block
            let adjBlock: number;
            if (nx < 0 || nx >= S || ny < 0 || ny >= S || nz < 0 || nz >= S) {
              const neighbor = neighbors[face.neighborKey];
              if (neighbor) {
                adjBlock = neighbor.getBlock(
                  ((nx % S) + S) % S,
                  ((ny % S) + S) % S,
                  ((nz % S) + S) % S
                );
              } else {
                adjBlock = 0;
              }
            } else {
              adjBlock = chunk.getBlock(nx, ny, nz);
            }

            // Skip if adjacent is solid and not transparent
            if (registry.isSolid(adjBlock) && !registry.isTransparent(adjBlock)) {
              continue;
            }

            // Emit quad
            const texName = blockDef
              ? blockDef.textures[face.faceName]
              : "";
            const uv = getUV(texName);

            const base = vi;
            for (let i = 0; i < 4; i++) {
              const v = face.verts[i];
              positions[(base + i) * 3] = x + v[0];
              positions[(base + i) * 3 + 1] = y + v[1];
              positions[(base + i) * 3 + 2] = z + v[2];
              normals[(base + i) * 3] = face.normal[0];
              normals[(base + i) * 3 + 1] = face.normal[1];
              normals[(base + i) * 3 + 2] = face.normal[2];
            }

            uvs[base * 2] = uv.u0;
            uvs[base * 2 + 1] = uv.v0;
            uvs[(base + 1) * 2] = uv.u1;
            uvs[(base + 1) * 2 + 1] = uv.v0;
            uvs[(base + 2) * 2] = uv.u1;
            uvs[(base + 2) * 2 + 1] = uv.v1;
            uvs[(base + 3) * 2] = uv.u0;
            uvs[(base + 3) * 2 + 1] = uv.v1;

            // Two triangles: 0-1-2, 0-2-3
            indices[ii] = base;
            indices[ii + 1] = base + 1;
            indices[ii + 2] = base + 2;
            indices[ii + 3] = base;
            indices[ii + 4] = base + 2;
            indices[ii + 5] = base + 3;

            vi += 4;
            ii += 6;
          }
        }
      }
    }

    return {
      positions: positions.slice(0, vi * 3),
      normals: normals.slice(0, vi * 3),
      uvs: uvs.slice(0, vi * 2),
      indices: indices.slice(0, ii),
      vertexCount: vi,
      indexCount: ii,
    };
  }
}
