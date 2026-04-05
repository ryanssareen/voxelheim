import { describe, it, expect } from "vitest";
import { Chunk } from "@engine/world/Chunk";
import { BLOCK_ID } from "@data/blocks";

describe("Chunk", () => {
  it("starts as all AIR and isEmpty", () => {
    const chunk = new Chunk(0, 0, 0);
    expect(chunk.isEmpty()).toBe(true);
    expect(chunk.getBlock(0, 0, 0)).toBe(BLOCK_ID.AIR);
  });

  it("round-trips setBlock and getBlock", () => {
    const chunk = new Chunk(0, 0, 0);
    chunk.setBlock(5, 3, 7, BLOCK_ID.STONE);
    expect(chunk.getBlock(5, 3, 7)).toBe(BLOCK_ID.STONE);
  });

  it("fills entire chunk with a block type", () => {
    const chunk = new Chunk(0, 0, 0);
    chunk.fill(BLOCK_ID.DIRT);
    expect(chunk.isEmpty()).toBe(false);
    expect(chunk.getBlock(0, 0, 0)).toBe(BLOCK_ID.DIRT);
    expect(chunk.getBlock(15, 15, 15)).toBe(BLOCK_ID.DIRT);
  });

  it("marks dirty on setBlock", () => {
    const chunk = new Chunk(0, 0, 0);
    chunk.dirty = false;
    chunk.setBlock(0, 0, 0, BLOCK_ID.GRASS);
    expect(chunk.dirty).toBe(true);
  });

  it("getBlockData returns a copy (modifying copy does not affect chunk)", () => {
    const chunk = new Chunk(0, 0, 0);
    chunk.setBlock(0, 0, 0, BLOCK_ID.STONE);
    const copy = chunk.getBlockData();
    copy[0] = BLOCK_ID.AIR;
    expect(chunk.getBlock(0, 0, 0)).toBe(BLOCK_ID.STONE);
  });

  it("setBlockData stores a copy (modifying source does not affect chunk)", () => {
    const chunk = new Chunk(0, 0, 0);
    const source = new Uint8Array(4096);
    source[0] = BLOCK_ID.CRYSTAL;
    chunk.setBlockData(source);
    source[0] = BLOCK_ID.AIR;
    expect(chunk.getBlock(0, 0, 0)).toBe(BLOCK_ID.CRYSTAL);
  });

  it("exposes readonly chunk coordinates", () => {
    const chunk = new Chunk(3, -1, 7);
    expect(chunk.cx).toBe(3);
    expect(chunk.cy).toBe(-1);
    expect(chunk.cz).toBe(7);
  });
});
