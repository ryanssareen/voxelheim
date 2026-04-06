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

/*
 * Face table derived from Three.js BoxGeometry buildPlane calls.
 * Each face: [u-axis, v-axis, w-axis, udir, vdir, normal-sign]
 * Maps to: vertex[u] = udir*(i-0.5), vertex[v] = vdir*(j-0.5), vertex[w] = normal-sign*0.5
 * Then offset by block center (x+0.5, y+0.5, z+0.5).
 *
 * For a unit cube at origin, the 4 corners of each face (CCW from outside):
 */
interface FaceDef {
  // Direction to check for neighbor (dx, dy, dz)
  dx: number;
  dy: number;
  dz: number;
  // Normal
  nx: number;
  ny: number;
  nz: number;
  // 4 vertices as offsets from block origin (0,0,0) to (1,1,1)
  corners: [number, number, number][];
  // Texture face name
  faceName: "top" | "bottom" | "side";
  // Neighbor chunk key
  neighborKey: keyof ChunkNeighbors;
}

// Vertex positions derived from Three.js BoxGeometry (CCW winding from outside)
const faces: FaceDef[] = [
  {
    // Right face (+X) - buildPlane('z','y','x', -1,-1, ...)
    dx: 1, dy: 0, dz: 0, nx: 1, ny: 0, nz: 0,
    corners: [[1,0,1],[1,1,1],[1,1,0],[1,0,0]],
    faceName: "side", neighborKey: "px",
  },
  {
    // Left face (-X) - buildPlane('z','y','x', 1,-1, ...)
    dx: -1, dy: 0, dz: 0, nx: -1, ny: 0, nz: 0,
    corners: [[0,0,0],[0,1,0],[0,1,1],[0,0,1]],
    faceName: "side", neighborKey: "nx",
  },
  {
    // Top face (+Y) - buildPlane('x','z','y', 1,1, ...)
    dx: 0, dy: 1, dz: 0, nx: 0, ny: 1, nz: 0,
    corners: [[1,1,1],[0,1,1],[0,1,0],[1,1,0]],
    faceName: "top", neighborKey: "py",
  },
  {
    // Bottom face (-Y) - buildPlane('x','z','y', 1,-1, ...)
    dx: 0, dy: -1, dz: 0, nx: 0, ny: -1, nz: 0,
    corners: [[1,0,0],[0,0,0],[0,0,1],[1,0,1]],
    faceName: "bottom", neighborKey: "ny",
  },
  {
    // Front face (+Z) - buildPlane('x','y','z', 1,-1, ...)
    dx: 0, dy: 0, dz: 1, nx: 0, ny: 0, nz: 1,
    corners: [[0,0,1],[1,0,1],[1,1,1],[0,1,1]],
    faceName: "side", neighborKey: "pz",
  },
  {
    // Back face (-Z) - buildPlane('x','y','z', -1,-1, ...)
    dx: 0, dy: 0, dz: -1, nx: 0, ny: 0, nz: -1,
    corners: [[1,0,0],[0,0,0],[0,1,0],[1,1,0]],
    faceName: "side", neighborKey: "nz",
  },
];

/**
 * Builds chunk mesh by emitting one quad per visible face.
 * Face vertex winding follows Three.js BoxGeometry conventions.
 */
export class ChunkMeshBuilder {
  static buildMesh(
    chunk: Chunk,
    neighbors: ChunkNeighbors,
    registry: BlockRegistry,
    getUV: GetUV = DEFAULT_GET_UV
  ): ChunkMeshData {
    const positions: number[] = [];
    const norms: number[] = [];
    const uvArr: number[] = [];
    const idxArr: number[] = [];
    let vertCount = 0;

    for (let y = 0; y < S; y++) {
      for (let z = 0; z < S; z++) {
        for (let x = 0; x < S; x++) {
          const blockId = chunk.getBlock(x, y, z);
          if (!registry.isSolid(blockId)) continue;

          const blockDef = registry.getBlock(blockId);

          for (const face of faces) {
            const adjX = x + face.dx;
            const adjY = y + face.dy;
            const adjZ = z + face.dz;

            let adjBlock: number;
            if (adjX < 0 || adjX >= S || adjY < 0 || adjY >= S || adjZ < 0 || adjZ >= S) {
              const neighbor = neighbors[face.neighborKey];
              if (neighbor) {
                adjBlock = neighbor.getBlock(
                  ((adjX % S) + S) % S,
                  ((adjY % S) + S) % S,
                  ((adjZ % S) + S) % S
                );
              } else {
                adjBlock = 0;
              }
            } else {
              adjBlock = chunk.getBlock(adjX, adjY, adjZ);
            }

            if (registry.isSolid(adjBlock) && !registry.isTransparent(adjBlock)) continue;

            // Get UVs
            const texName = blockDef ? blockDef.textures[face.faceName] : "";
            const uv = getUV(texName);

            // Emit 4 vertices
            const base = vertCount;
            for (const corner of face.corners) {
              positions.push(x + corner[0], y + corner[1], z + corner[2]);
              norms.push(face.nx, face.ny, face.nz);
            }

            // UVs for the 4 corners
            uvArr.push(uv.u0, uv.v0);
            uvArr.push(uv.u1, uv.v0);
            uvArr.push(uv.u1, uv.v1);
            uvArr.push(uv.u0, uv.v1);

            // Two triangles: (0,1,2) and (0,2,3)
            idxArr.push(base, base + 1, base + 2);
            idxArr.push(base, base + 2, base + 3);

            vertCount += 4;
          }
        }
      }
    }

    return {
      positions: new Float32Array(positions),
      normals: new Float32Array(norms),
      uvs: new Float32Array(uvArr),
      indices: new Uint32Array(idxArr),
      vertexCount: vertCount,
      indexCount: idxArr.length,
    };
  }
}
