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

  it("culls shared face between two adjacent blocks", () => {
    const chunk = new Chunk(0, 0, 0);
    chunk.setBlock(5, 5, 5, BLOCK_ID.STONE);
    chunk.setBlock(6, 5, 5, BLOCK_ID.STONE);

    const result = ChunkMeshBuilder.buildMesh(chunk, {}, registry);

    // 2 blocks * 6 faces - 2 shared faces (culled) = 10 visible faces = 40 verts
    expect(result.vertexCount).toBe(40);
    expect(result.indexCount).toBe(60);
  });

  it("produces only outer faces for a full solid chunk", () => {
    const chunk = new Chunk(0, 0, 0);
    chunk.fill(BLOCK_ID.STONE);
    const result = ChunkMeshBuilder.buildMesh(chunk, {}, registry);

    // Full chunk: only 6 outer walls have visible faces
    // Each wall = 16x16 = 256 faces, 6 walls = 1536 faces = 6144 verts
    expect(result.vertexCount).toBe(6144);
    expect(result.indexCount).toBe(9216);
  });

  it("culls faces at chunk boundary when neighbor has solid block", () => {
    const chunk = new Chunk(0, 0, 0);
    chunk.setBlock(15, 8, 8, BLOCK_ID.STONE);

    const neighborPx = new Chunk(1, 0, 0);
    neighborPx.setBlock(0, 8, 8, BLOCK_ID.STONE);

    const result = ChunkMeshBuilder.buildMesh(chunk, { px: neighborPx }, registry);

    // +X face culled by neighbor → 5 faces remain
    expect(result.vertexCount).toBe(20);
    expect(result.indexCount).toBe(30);
  });

  it("renders face adjacent to transparent block", () => {
    const chunk = new Chunk(0, 0, 0);
    chunk.setBlock(8, 8, 8, BLOCK_ID.STONE);
    chunk.setBlock(9, 8, 8, BLOCK_ID.LEAVES);

    const result = ChunkMeshBuilder.buildMesh(chunk, {}, registry);

    // Stone: 6 faces (LEAVES is transparent, so stone's +X face renders)
    // Leaves: 5 faces (leaves' -X face adjacent to stone is culled — stone is solid, not transparent)
    // Total: 11 faces = 44 verts
    expect(result.vertexCount).toBe(44);
  });
});
