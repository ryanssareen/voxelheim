import { describe, it, expect } from "vitest";
import { ChunkMeshBuilder } from "@engine/renderer/ChunkMeshBuilder";
import { Chunk } from "@engine/world/Chunk";
import { BlockRegistry } from "@engine/world/BlockRegistry";
import { BLOCK_ID } from "@data/blocks";

const registry = BlockRegistry.getInstance();

describe("ChunkMeshBuilder", () => {
  it("produces 0 vertices for an empty chunk", () => {
    const chunk = new Chunk(0, 0, 0);
    const result = ChunkMeshBuilder.buildMesh(chunk, {}, registry);
    expect(result.vertexCount).toBe(0);
    expect(result.indexCount).toBe(0);
  });

  it("produces 6 faces (24 vertices, 36 indices) for a single solid block", () => {
    const chunk = new Chunk(0, 0, 0);
    chunk.setBlock(8, 8, 8, BLOCK_ID.STONE);
    const result = ChunkMeshBuilder.buildMesh(chunk, {}, registry);
    expect(result.vertexCount).toBe(24);
    expect(result.indexCount).toBe(36);
  });

  it("merges two adjacent same-type blocks into fewer quads", () => {
    const chunk = new Chunk(0, 0, 0);
    chunk.setBlock(5, 5, 5, BLOCK_ID.STONE);
    chunk.setBlock(6, 5, 5, BLOCK_ID.STONE);

    const result = ChunkMeshBuilder.buildMesh(chunk, {}, registry);

    // Two blocks share the +x/-x face between them (culled).
    // Without greedy: 2 blocks * 6 faces - 2 shared faces = 10 faces = 40 verts
    // With greedy: shared-axis faces merge into 1 wide quad each.
    // Top/bottom/front/back: 2 blocks in a row merge to 1 quad each = 4 merged quads
    // Left face of block 5 and right face of block 6 = 2 single quads
    // Total: 4 + 2 = 6 quads = 24 verts, 36 indices
    // The greedy pass merges the 2-block-wide faces.
    expect(result.vertexCount).toBeLessThanOrEqual(40);
    // Must be fewer than naive (10 faces = 40 verts)
    expect(result.vertexCount).toBeLessThan(40);
  });

  it("produces faces only on outer walls for a full solid chunk", () => {
    const chunk = new Chunk(0, 0, 0);
    chunk.fill(BLOCK_ID.STONE);
    const result = ChunkMeshBuilder.buildMesh(chunk, {}, registry);

    // Full chunk with no neighbors: 6 outer faces, each greedy-merged to one 16x16 quad
    // = 6 quads * 4 verts = 24 verts, 6 * 6 indices = 36 indices
    expect(result.vertexCount).toBe(24);
    expect(result.indexCount).toBe(36);
  });

  it("culls faces at chunk boundary when neighbor has solid block", () => {
    const chunk = new Chunk(0, 0, 0);
    chunk.setBlock(15, 8, 8, BLOCK_ID.STONE);

    // Neighbor in +X direction with solid block at x=0
    const neighborPx = new Chunk(1, 0, 0);
    neighborPx.setBlock(0, 8, 8, BLOCK_ID.STONE);

    const result = ChunkMeshBuilder.buildMesh(chunk, { px: neighborPx }, registry);

    // The +X face of block at (15,8,8) should be culled because neighbor has solid block
    // 5 faces remain instead of 6
    expect(result.vertexCount).toBe(20); // 5 faces * 4 verts
    expect(result.indexCount).toBe(30); // 5 faces * 6 indices
  });

  it("renders face adjacent to transparent block", () => {
    const chunk = new Chunk(0, 0, 0);
    chunk.setBlock(8, 8, 8, BLOCK_ID.STONE);
    chunk.setBlock(9, 8, 8, BLOCK_ID.LEAVES); // transparent

    const result = ChunkMeshBuilder.buildMesh(chunk, {}, registry);

    // Stone block: all 6 faces render (LEAVES is transparent, so +X face not culled)
    // Leaves block: solid + transparent, so its faces render where adjacent is air or transparent
    // Total should be more than 6 faces (stone) + faces for leaves
    expect(result.vertexCount).toBeGreaterThan(24);
  });
});
