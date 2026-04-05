import { describe, it, expect } from "vitest";
import {
  worldToChunk,
  worldToLocal,
  localToIndex,
  indexToLocal,
  chunkKey,
} from "@lib/coords";

describe("worldToChunk", () => {
  it("maps positive coords within chunk 0", () => {
    expect(worldToChunk(0, 0, 0)).toEqual({ cx: 0, cy: 0, cz: 0 });
    expect(worldToChunk(15, 15, 15)).toEqual({ cx: 0, cy: 0, cz: 0 });
  });

  it("maps coords at chunk boundary", () => {
    expect(worldToChunk(16, 0, 0)).toEqual({ cx: 1, cy: 0, cz: 0 });
  });

  it("maps negative coords correctly", () => {
    expect(worldToChunk(-1, 0, 0)).toEqual({ cx: -1, cy: 0, cz: 0 });
    expect(worldToChunk(-16, 0, 0)).toEqual({ cx: -1, cy: 0, cz: 0 });
    expect(worldToChunk(-17, 0, 0)).toEqual({ cx: -2, cy: 0, cz: 0 });
  });
});

describe("worldToLocal", () => {
  it("maps positive coords to local", () => {
    expect(worldToLocal(0, 0, 0)).toEqual({ lx: 0, ly: 0, lz: 0 });
    expect(worldToLocal(16, 0, 0)).toEqual({ lx: 0, ly: 0, lz: 0 });
  });

  it("maps negative coords to local (wraps to positive)", () => {
    expect(worldToLocal(-1, 0, 0)).toEqual({ lx: 15, ly: 0, lz: 0 });
    expect(worldToLocal(-16, 0, 0)).toEqual({ lx: 0, ly: 0, lz: 0 });
    expect(worldToLocal(-17, 0, 0)).toEqual({ lx: 15, ly: 0, lz: 0 });
  });
});

describe("localToIndex / indexToLocal round-trip", () => {
  it.each([
    { lx: 0, ly: 0, lz: 0 },
    { lx: 15, ly: 15, lz: 15 },
    { lx: 7, ly: 3, lz: 12 },
  ])("round-trips ($lx, $ly, $lz)", ({ lx, ly, lz }) => {
    const index = localToIndex(lx, ly, lz);
    expect(indexToLocal(index)).toEqual({ lx, ly, lz });
  });
});

describe("chunkKey", () => {
  it("produces comma-separated string", () => {
    expect(chunkKey(1, -2, 3)).toBe("1,-2,3");
  });
});
