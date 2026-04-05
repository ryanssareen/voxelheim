import { Chunk } from "@engine/world/Chunk";
import { BlockRegistry } from "@engine/world/BlockRegistry";
import { CHUNK_SIZE } from "@engine/world/constants";

/** UV rectangle for a single texture in the atlas. */
export interface UVRect {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

/** Raw mesh data suitable for creating GPU buffers. No Three.js types. */
export interface ChunkMeshData {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
  vertexCount: number;
  indexCount: number;
}

/** Callback to resolve a texture name to atlas UV coordinates. */
export type GetUV = (textureName: string) => UVRect;

/** Default UV callback returning the full [0,1] range. */
const DEFAULT_GET_UV: GetUV = () => ({ u0: 0, v0: 0, u1: 1, v1: 1 });

/**
 * Six face directions. Each entry defines:
 * - normal: the face normal direction
 * - tangentU / tangentV: axes spanning the face plane
 * - faceName: which texture face to use ('top', 'bottom', or 'side')
 */
const FACES = [
  { normal: [1, 0, 0], tangentU: [0, 0, 1], tangentV: [0, 1, 0], faceName: "side" as const },   // +X
  { normal: [-1, 0, 0], tangentU: [0, 0, -1], tangentV: [0, 1, 0], faceName: "side" as const },  // -X
  { normal: [0, 1, 0], tangentU: [1, 0, 0], tangentV: [0, 0, 1], faceName: "top" as const },     // +Y
  { normal: [0, -1, 0], tangentU: [1, 0, 0], tangentV: [0, 0, -1], faceName: "bottom" as const },// -Y
  { normal: [0, 0, 1], tangentU: [1, 0, 0], tangentV: [0, 1, 0], faceName: "side" as const },    // +Z
  { normal: [0, 0, -1], tangentU: [-1, 0, 0], tangentV: [0, 1, 0], faceName: "side" as const },  // -Z
];

/** Neighbor chunk map keyed by direction. */
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
 * Converts chunk block data into renderable vertex arrays using greedy meshing.
 * No Three.js dependency — safe for Web Workers.
 */
export class ChunkMeshBuilder {
  /**
   * Builds optimized mesh data for a chunk using greedy meshing.
   *
   * @param chunk - The chunk to mesh
   * @param neighbors - Adjacent chunks for boundary face culling
   * @param registry - Block registry for solid/transparent lookups
   * @param getUV - Callback to resolve texture names to UV rects
   */
  static buildMesh(
    chunk: Chunk,
    neighbors: ChunkNeighbors,
    registry: BlockRegistry,
    getUV: GetUV = DEFAULT_GET_UV
  ): ChunkMeshData {
    // Max possible: 6 faces * 16*16 quads * 4 verts = 6144 verts, 6 * 16*16 * 6 indices = 9216
    const maxVerts = S * S * 6 * 4;
    const maxIndices = S * S * 6 * 6;

    const positions = new Float32Array(maxVerts * 3);
    const normals = new Float32Array(maxVerts * 3);
    const uvs = new Float32Array(maxVerts * 2);
    const indices = new Uint32Array(maxIndices);

    let vertCursor = 0;
    let idxCursor = 0;

    const neighborChunks: (Chunk | undefined)[] = [
      neighbors.px, neighbors.nx, neighbors.py, neighbors.ny, neighbors.pz, neighbors.nz,
    ];

    const mask = new Int32Array(S * S);

    for (let faceIdx = 0; faceIdx < 6; faceIdx++) {
      const face = FACES[faceIdx];
      const [nx, ny, nz] = face.normal;
      const [ux, uy, uz] = face.tangentU;
      const [vx, vy, vz] = face.tangentV;
      const neighbor = neighborChunks[faceIdx];

      // Determine which axis is the slice axis (the normal direction)
      const sliceAxis = nx !== 0 ? 0 : ny !== 0 ? 1 : 2;
      const isPositive = nx > 0 || ny > 0 || nz > 0;

      for (let slice = 0; slice < S; slice++) {
        // Build the mask for this slice
        mask.fill(0);

        for (let v = 0; v < S; v++) {
          for (let u = 0; u < S; u++) {
            // Compute local coords of the current block
            const lx = sliceAxis === 0 ? slice : (sliceAxis === 1 ? u * ux + v * vx : u * ux + v * vx);
            const ly = sliceAxis === 1 ? slice : (sliceAxis === 0 ? u * uy + v * vy : u * uy + v * vy);
            const lz = sliceAxis === 2 ? slice : (sliceAxis === 0 ? u * uz + v * vz : u * uz + v * vz);

            // Simpler: compute block position from tangent axes
            let bx: number, by: number, bz: number;
            if (sliceAxis === 0) {
              bx = slice;
              bz = u;
              by = v;
            } else if (sliceAxis === 1) {
              bx = u;
              by = slice;
              bz = v;
            } else {
              bx = u;
              by = v;
              bz = slice;
            }

            const blockId = chunk.getBlock(bx, by, bz);
            if (!registry.isSolid(blockId)) continue;

            // Check adjacent block in face direction
            let adjX = bx + nx;
            let adjY = by + ny;
            let adjZ = bz + nz;
            let adjBlock: number;

            if (adjX < 0 || adjX >= S || adjY < 0 || adjY >= S || adjZ < 0 || adjZ >= S) {
              // Boundary — look up neighbor chunk
              if (neighbor) {
                const nlx = ((adjX % S) + S) % S;
                const nly = ((adjY % S) + S) % S;
                const nlz = ((adjZ % S) + S) % S;
                adjBlock = neighbor.getBlock(nlx, nly, nlz);
              } else {
                adjBlock = 0; // AIR
              }
            } else {
              adjBlock = chunk.getBlock(adjX, adjY, adjZ);
            }

            // Render face if adjacent is not solid or is transparent
            if (!registry.isSolid(adjBlock) || registry.isTransparent(adjBlock)) {
              mask[u + v * S] = blockId;
            }
          }
        }

        // Greedy merge
        for (let v = 0; v < S; v++) {
          for (let u = 0; u < S;) {
            const blockId = mask[u + v * S];
            if (blockId === 0) {
              u++;
              continue;
            }

            // Expand width (along u)
            let w = 1;
            while (u + w < S && mask[(u + w) + v * S] === blockId) {
              w++;
            }

            // Expand height (along v)
            let h = 1;
            let done = false;
            while (v + h < S && !done) {
              for (let k = 0; k < w; k++) {
                if (mask[(u + k) + (v + h) * S] !== blockId) {
                  done = true;
                  break;
                }
              }
              if (!done) h++;
            }

            // Clear mask for merged region
            for (let dv = 0; dv < h; dv++) {
              for (let du = 0; du < w; du++) {
                mask[(u + du) + (v + dv) * S] = 0;
              }
            }

            // Get block definition for texture
            const blockDef = registry.getBlock(blockId);
            const textureName = blockDef
              ? blockDef.textures[face.faceName]
              : "";
            const uv = getUV(textureName);

            // Compute 4 corner vertices
            // Base position: the block at (u, v) on this slice
            let baseX: number, baseY: number, baseZ: number;
            if (sliceAxis === 0) {
              baseX = isPositive ? slice + 1 : slice;
              baseZ = u;
              baseY = v;
            } else if (sliceAxis === 1) {
              baseX = u;
              baseY = isPositive ? slice + 1 : slice;
              baseZ = v;
            } else {
              baseX = u;
              baseY = v;
              baseZ = isPositive ? slice + 1 : slice;
            }

            // Tangent directions for the face quad
            let duX: number, duY: number, duZ: number;
            let dvX: number, dvY: number, dvZ: number;
            if (sliceAxis === 0) {
              duX = 0; duY = 0; duZ = w;
              dvX = 0; dvY = h; dvZ = 0;
            } else if (sliceAxis === 1) {
              duX = w; duY = 0; duZ = 0;
              dvX = 0; dvY = 0; dvZ = h;
            } else {
              duX = w; duY = 0; duZ = 0;
              dvX = 0; dvY = h; dvZ = 0;
            }

            const vi = vertCursor;

            // 4 vertices: base, base+du, base+du+dv, base+dv
            positions[vi * 3] = baseX;
            positions[vi * 3 + 1] = baseY;
            positions[vi * 3 + 2] = baseZ;

            positions[(vi + 1) * 3] = baseX + duX;
            positions[(vi + 1) * 3 + 1] = baseY + duY;
            positions[(vi + 1) * 3 + 2] = baseZ + duZ;

            positions[(vi + 2) * 3] = baseX + duX + dvX;
            positions[(vi + 2) * 3 + 1] = baseY + duY + dvY;
            positions[(vi + 2) * 3 + 2] = baseZ + duZ + dvZ;

            positions[(vi + 3) * 3] = baseX + dvX;
            positions[(vi + 3) * 3 + 1] = baseY + dvY;
            positions[(vi + 3) * 3 + 2] = baseZ + dvZ;

            // Normals (same for all 4 vertices)
            for (let i = 0; i < 4; i++) {
              normals[(vi + i) * 3] = nx;
              normals[(vi + i) * 3 + 1] = ny;
              normals[(vi + i) * 3 + 2] = nz;
            }

            // UVs
            uvs[vi * 2] = uv.u0;
            uvs[vi * 2 + 1] = uv.v0;
            uvs[(vi + 1) * 2] = uv.u1;
            uvs[(vi + 1) * 2 + 1] = uv.v0;
            uvs[(vi + 2) * 2] = uv.u1;
            uvs[(vi + 2) * 2 + 1] = uv.v1;
            uvs[(vi + 3) * 2] = uv.u0;
            uvs[(vi + 3) * 2 + 1] = uv.v1;

            // Indices (2 triangles, CCW winding for front face)
            if (isPositive) {
              indices[idxCursor] = vi;
              indices[idxCursor + 1] = vi + 1;
              indices[idxCursor + 2] = vi + 2;
              indices[idxCursor + 3] = vi;
              indices[idxCursor + 4] = vi + 2;
              indices[idxCursor + 5] = vi + 3;
            } else {
              indices[idxCursor] = vi;
              indices[idxCursor + 1] = vi + 2;
              indices[idxCursor + 2] = vi + 1;
              indices[idxCursor + 3] = vi;
              indices[idxCursor + 4] = vi + 3;
              indices[idxCursor + 5] = vi + 2;
            }

            vertCursor += 4;
            idxCursor += 6;

            u += w;
          }
        }
      }
    }

    return {
      positions: positions.slice(0, vertCursor * 3),
      normals: normals.slice(0, vertCursor * 3),
      uvs: uvs.slice(0, vertCursor * 2),
      indices: indices.slice(0, idxCursor),
      vertexCount: vertCursor,
      indexCount: idxCursor,
    };
  }
}
