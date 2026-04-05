import { localToIndex } from "@lib/coords";
import { CHUNK_VOLUME } from "@engine/world/constants";

/**
 * A 16x16x16 block storage unit backed by a Uint8Array.
 * Each element stores a block ID (0 = AIR).
 */
export class Chunk {
  public readonly cx: number;
  public readonly cy: number;
  public readonly cz: number;

  /** When true, the chunk's mesh needs to be rebuilt. */
  public dirty = true;

  private data: Uint8Array;

  constructor(cx: number, cy: number, cz: number) {
    this.cx = cx;
    this.cy = cy;
    this.cz = cz;
    this.data = new Uint8Array(CHUNK_VOLUME);
  }

  /** Returns the block ID at the given local coordinates. */
  getBlock(lx: number, ly: number, lz: number): number {
    return this.data[localToIndex(lx, ly, lz)];
  }

  /** Sets the block ID at the given local coordinates and marks the chunk dirty. */
  setBlock(lx: number, ly: number, lz: number, blockId: number): void {
    this.data[localToIndex(lx, ly, lz)] = blockId;
    this.dirty = true;
  }

  /** Fills the entire chunk with a single block type. */
  fill(blockId: number): void {
    this.data.fill(blockId);
    this.dirty = true;
  }

  /** Returns a copy of the internal block data. */
  getBlockData(): Uint8Array {
    return new Uint8Array(this.data);
  }

  /** Replaces the internal block data with a copy of the provided array. */
  setBlockData(data: Uint8Array): void {
    this.data = new Uint8Array(data);
    this.dirty = true;
  }

  /** Returns true if every block in the chunk is AIR (id 0). */
  isEmpty(): boolean {
    return this.data.every((v) => v === 0);
  }
}
