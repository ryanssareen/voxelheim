import { describe, it, expect } from "vitest";
import { Vector3 } from "@lib/Vector3";

describe("Vector3 arithmetic", () => {
  it("adds two vectors", () => {
    const a = new Vector3(1, 2, 3);
    const b = new Vector3(4, 5, 6);
    expect(a.add(b)).toEqual(new Vector3(5, 7, 9));
  });

  it("subtracts two vectors", () => {
    const a = new Vector3(5, 7, 9);
    const b = new Vector3(1, 2, 3);
    expect(a.sub(b)).toEqual(new Vector3(4, 5, 6));
  });

  it("scales a vector", () => {
    const v = new Vector3(1, 2, 3);
    expect(v.scale(2)).toEqual(new Vector3(2, 4, 6));
  });
});

describe("Vector3 geometry", () => {
  it("computes length", () => {
    expect(new Vector3(3, 4, 0).length()).toBeCloseTo(5);
  });

  it("normalizes to unit length", () => {
    const n = new Vector3(0, 0, 5).normalize();
    expect(n.length()).toBeCloseTo(1);
    expect(n).toEqual(new Vector3(0, 0, 1));
  });

  it("normalize of zero vector returns ZERO", () => {
    expect(Vector3.ZERO.normalize()).toBe(Vector3.ZERO);
  });

  it("computes dot product", () => {
    const a = new Vector3(1, 0, 0);
    const b = new Vector3(0, 1, 0);
    expect(a.dot(b)).toBe(0);
    expect(a.dot(a)).toBe(1);
  });

  it("computes cross product", () => {
    const x = new Vector3(1, 0, 0);
    const y = new Vector3(0, 1, 0);
    expect(x.cross(y)).toEqual(new Vector3(0, 0, 1));
  });

  it("computes distance between vectors", () => {
    const a = new Vector3(0, 0, 0);
    const b = new Vector3(3, 4, 0);
    expect(a.distanceTo(b)).toBeCloseTo(5);
  });
});

describe("Vector3 immutability", () => {
  it("does not mutate original after add", () => {
    const a = new Vector3(1, 2, 3);
    a.add(new Vector3(10, 10, 10));
    expect(a.x).toBe(1);
    expect(a.y).toBe(2);
    expect(a.z).toBe(3);
  });
});

describe("Vector3 statics", () => {
  it("ZERO is (0, 0, 0)", () => {
    expect(Vector3.ZERO).toEqual(new Vector3(0, 0, 0));
  });

  it("UP is (0, 1, 0)", () => {
    expect(Vector3.UP).toEqual(new Vector3(0, 1, 0));
  });
});
