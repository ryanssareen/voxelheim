import { describe, it, expect } from "vitest";
import { SeededNoise } from "@lib/noise";

describe("SeededNoise determinism", () => {
  it("produces identical output for the same seed", () => {
    const a = new SeededNoise(42);
    const b = new SeededNoise(42);
    expect(a.noise2D(1, 2)).toBe(b.noise2D(1, 2));
    expect(a.noise3D(1, 2, 3)).toBe(b.noise3D(1, 2, 3));
  });

  it("produces different output for different seeds", () => {
    const a = new SeededNoise(1);
    const b = new SeededNoise(2);
    expect(a.noise2D(1, 2)).not.toBe(b.noise2D(1, 2));
  });
});

describe("SeededNoise range", () => {
  it("noise2D stays within [-1, 1] over 100 samples", () => {
    const noise = new SeededNoise(123);
    for (let i = 0; i < 100; i++) {
      const v = noise.noise2D(i * 0.1, i * 0.3);
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it("noise3D stays within [-1, 1] over 100 samples", () => {
    const noise = new SeededNoise(456);
    for (let i = 0; i < 100; i++) {
      const v = noise.noise3D(i * 0.1, i * 0.2, i * 0.3);
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});

describe("SeededNoise octaveNoise2D", () => {
  it("stays within [-1, 1]", () => {
    const noise = new SeededNoise(789);
    for (let i = 0; i < 100; i++) {
      const v = noise.octaveNoise2D(i * 0.5, i * 0.7);
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it("is continuous (nearby inputs produce nearby outputs)", () => {
    const noise = new SeededNoise(101);
    const a = noise.octaveNoise2D(5.0, 5.0);
    const b = noise.octaveNoise2D(5.001, 5.001);
    expect(Math.abs(a - b)).toBeLessThan(0.1);
  });
});
