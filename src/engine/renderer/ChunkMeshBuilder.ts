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
 * Greedy meshing: for each of 3 axes and 2 directions (positive/negative),
 * sweep slices, build a mask of visible faces, merge adjacent same-block
 * faces into larger quads.
 */
export class ChunkMeshBuilder {
  static buildMesh(
    chunk: Chunk,
    neighbors: ChunkNeighbors,
    registry: BlockRegistry,
    getUV: GetUV = DEFAULT_GET_UV
  ): ChunkMeshData {
    // Worst case: every block has 6 faces, each face is 1 quad = 4 verts, 6 indices
    const maxQuads = S * S * S * 6;
    const positions = new Float32Array(maxQuads * 4 * 3);
    const normals = new Float32Array(maxQuads * 4 * 3);
    const uvs = new Float32Array(maxQuads * 4 * 2);
    const indices = new Uint32Array(maxQuads * 6);
    let vi = 0; // vertex index
    let ii = 0; // index index

    const mask = new Int32Array(S * S);

    // For each axis (0=X, 1=Y, 2=Z)
    for (let axis = 0; axis < 3; axis++) {
      // For each direction along that axis (+1 or -1)
      for (let dir = -1; dir <= 1; dir += 2) {
        const isPositive = dir > 0;

        // The two axes perpendicular to the sweep axis
        const axis1 = (axis + 1) % 3; // u axis
        const axis2 = (axis + 2) % 3; // v axis

        // Normal vector
        const normal = [0, 0, 0];
        normal[axis] = dir;

        const faceName =
          axis === 1
            ? isPositive
              ? "top"
              : "bottom"
            : "side";

        // Sweep through each slice perpendicular to the axis
        for (let slice = 0; slice < S; slice++) {
          // Build mask: mask[u + v*S] = blockId if face should be rendered, 0 otherwise
          mask.fill(0);

          for (let v = 0; v < S; v++) {
            for (let u = 0; u < S; u++) {
              // Map (slice, u, v) to (x, y, z) based on which axis we're sweeping
              const pos = [0, 0, 0];
              pos[axis] = slice;
              pos[axis1] = u;
              pos[axis2] = v;
              const [bx, by, bz] = pos;

              const blockId = chunk.getBlock(bx, by, bz);
              if (!registry.isSolid(blockId)) continue;

              // Check adjacent block in the face direction
              const adjPos = [bx, by, bz];
              adjPos[axis] += dir;

              let adjBlock: number;
              if (adjPos[axis] < 0 || adjPos[axis] >= S) {
                // Outside chunk — check neighbor
                const neighborKey = isPositive
                  ? (["px", "py", "pz"] as const)[axis]
                  : (["nx", "ny", "nz"] as const)[axis];
                const neighbor = neighbors[neighborKey];
                if (neighbor) {
                  const nlx = ((adjPos[0] % S) + S) % S;
                  const nly = ((adjPos[1] % S) + S) % S;
                  const nlz = ((adjPos[2] % S) + S) % S;
                  adjBlock = neighbor.getBlock(nlx, nly, nlz);
                } else {
                  adjBlock = 0; // AIR
                }
              } else {
                adjBlock = chunk.getBlock(adjPos[0], adjPos[1], adjPos[2]);
              }

              // Render face if adjacent is air or transparent
              if (!registry.isSolid(adjBlock) || registry.isTransparent(adjBlock)) {
                mask[u + v * S] = blockId;
              }
            }
          }

          // Greedy merge the mask into quads
          for (let v = 0; v < S; v++) {
            for (let u = 0; u < S; ) {
              const blockId = mask[u + v * S];
              if (blockId === 0) {
                u++;
                continue;
              }

              // Expand width along u
              let w = 1;
              while (u + w < S && mask[(u + w) + v * S] === blockId) w++;

              // Expand height along v
              let h = 1;
              let canExpand = true;
              while (v + h < S && canExpand) {
                for (let k = 0; k < w; k++) {
                  if (mask[(u + k) + (v + h) * S] !== blockId) {
                    canExpand = false;
                    break;
                  }
                }
                if (canExpand) h++;
              }

              // Clear merged region from mask
              for (let dv = 0; dv < h; dv++) {
                for (let du = 0; du < w; du++) {
                  mask[(u + du) + (v + dv) * S] = 0;
                }
              }

              // Emit quad
              // Corner position: the face sits on the boundary of the block
              const corner = [0, 0, 0];
              corner[axis] = isPositive ? slice + 1 : slice;
              corner[axis1] = u;
              corner[axis2] = v;

              // Two edge vectors spanning the quad
              const du_vec = [0, 0, 0];
              du_vec[axis1] = w;

              const dv_vec = [0, 0, 0];
              dv_vec[axis2] = h;

              // 4 vertices: corner, corner+du, corner+du+dv, corner+dv
              const v0 = [corner[0], corner[1], corner[2]];
              const v1 = [corner[0] + du_vec[0], corner[1] + du_vec[1], corner[2] + du_vec[2]];
              const v2 = [corner[0] + du_vec[0] + dv_vec[0], corner[1] + du_vec[1] + dv_vec[1], corner[2] + du_vec[2] + dv_vec[2]];
              const v3 = [corner[0] + dv_vec[0], corner[1] + dv_vec[1], corner[2] + dv_vec[2]];

              // Get UVs
              const blockDef = registry.getBlock(blockId);
              const texName = blockDef ? blockDef.textures[faceName as "top" | "bottom" | "side"] : "";
              const uv = getUV(texName);

              // Write vertices
              const base = vi;
              const verts = [v0, v1, v2, v3];
              for (let i = 0; i < 4; i++) {
                positions[(base + i) * 3] = verts[i][0];
                positions[(base + i) * 3 + 1] = verts[i][1];
                positions[(base + i) * 3 + 2] = verts[i][2];
                normals[(base + i) * 3] = normal[0];
                normals[(base + i) * 3 + 1] = normal[1];
                normals[(base + i) * 3 + 2] = normal[2];
              }

              uvs[base * 2] = uv.u0;       uvs[base * 2 + 1] = uv.v0;
              uvs[(base + 1) * 2] = uv.u1; uvs[(base + 1) * 2 + 1] = uv.v0;
              uvs[(base + 2) * 2] = uv.u1; uvs[(base + 2) * 2 + 1] = uv.v1;
              uvs[(base + 3) * 2] = uv.u0; uvs[(base + 3) * 2 + 1] = uv.v1;

              // Indices: 2 triangles per quad, winding depends on face direction
              if (isPositive) {
                indices[ii] = base;     indices[ii + 1] = base + 1; indices[ii + 2] = base + 2;
                indices[ii + 3] = base; indices[ii + 4] = base + 2; indices[ii + 5] = base + 3;
              } else {
                indices[ii] = base;     indices[ii + 1] = base + 2; indices[ii + 2] = base + 1;
                indices[ii + 3] = base; indices[ii + 4] = base + 3; indices[ii + 5] = base + 2;
              }

              vi += 4;
              ii += 6;
              u += w;
            }
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
