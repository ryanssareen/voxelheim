import { createNoise2D, createNoise3D } from "simplex-noise";

/**
 * MurmurHash3-style mixer to derive well-distributed state from a seed.
 * Ensures nearby seeds (e.g. 1 and 2) produce very different PRNG streams.
 */
function mixSeed(n: number): number {
  n = ((n >>> 0) ^ ((n >>> 0) >> 16)) >>> 0;
  n = Math.imul(n, 0x45d9f3b) >>> 0;
  n = ((n >>> 0) ^ ((n >>> 0) >> 16)) >>> 0;
  return n;
}

/**
 * Simple Alea-style PRNG seeded from a numeric value.
 * Produces deterministic [0, 1) floats from a given seed.
 */
function alea(seed: number): () => number {
  let s0 = mixSeed(seed) / 4294967296;
  let s1 = mixSeed(seed + 111) / 4294967296;
  let s2 = mixSeed(seed + 222) / 4294967296;
  const c = 1;

  return () => {
    const t = 2091639 * s0 + c * 2.3283064365386963e-10;
    s0 = s1;
    s1 = s2;
    s2 = t - (t | 0);
    return s2;
  };
}

/**
 * Seeded simplex noise generator.
 * Wraps `simplex-noise` with a deterministic PRNG so the same seed
 * always produces the same noise field.
 */
export class SeededNoise {
  private readonly n2: (x: number, y: number) => number;
  private readonly n3: (x: number, y: number, z: number) => number;

  constructor(seed: number) {
    const rng = alea(seed);
    this.n2 = createNoise2D(rng);
    this.n3 = createNoise3D(rng);
  }

  /** 2D simplex noise in [-1, 1]. */
  noise2D(x: number, y: number): number {
    return this.n2(x, y);
  }

  /** 3D simplex noise in [-1, 1]. */
  noise3D(x: number, y: number, z: number): number {
    return this.n3(x, y, z);
  }

  /**
   * Fractal Brownian motion (octave noise) in 2D, normalized to [-1, 1].
   *
   * @param x - World x coordinate
   * @param y - World y coordinate
   * @param octaves - Number of noise layers (default 4)
   * @param persistence - Amplitude multiplier per octave (default 0.5)
   * @param lacunarity - Frequency multiplier per octave (default 2.0)
   * @param scale - Initial frequency divisor (default 1.0)
   */
  octaveNoise2D(
    x: number,
    y: number,
    octaves = 4,
    persistence = 0.5,
    lacunarity = 2.0,
    scale = 1.0
  ): number {
    let value = 0;
    let amplitude = 1;
    let frequency = 1 / scale;
    let maxAmplitude = 0;

    for (let i = 0; i < octaves; i++) {
      value += this.n2(x * frequency, y * frequency) * amplitude;
      maxAmplitude += amplitude;
      amplitude *= persistence;
      frequency *= lacunarity;
    }

    return value / maxAmplitude;
  }
}
