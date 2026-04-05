---
title: "Seeded PRNG for Simplex-Noise: Hash-Based Seed Mixing for Deterministic Noise"
date: 2026-04-05
category: best-practices
module: engine-noise
problem_type: best_practice
component: tooling
severity: low
applies_when:
  - "Using simplex-noise npm package with deterministic seeded randomness"
  - "Initializing Alea PRNG state from a numeric seed"
  - "Implementing procedural terrain generation with reproducible results"
tags:
  - simplex-noise
  - prng
  - seeded-random
  - determinism
  - murmurhash
  - alea
---

# Seeded PRNG for Simplex-Noise: Hash-Based Seed Mixing for Deterministic Noise

## Context

The `simplex-noise` npm package's `createNoise2D` and `createNoise3D` accept an optional `random: () => number` parameter for seeding. The package does not export an Alea PRNG — you must supply your own. Naive PRNG initialization from a numeric seed causes nearby seeds (1, 2, 3) to produce identical noise output, silently breaking procedural generation variety.

## Guidance

**Do not scale the seed directly into PRNG state.** Initializing with `(seed >>> 0) / 4294967296` for sequential offsets produces negligible floating-point differences that the PRNG cannot distinguish.

**Apply a MurmurHash3-style bit mixer before state initialization:**

```typescript
function mixSeed(n: number): number {
  n = ((n >>> 0) ^ ((n >>> 0) >> 16)) >>> 0;
  n = Math.imul(n, 0x45d9f3b) >>> 0;
  n = ((n >>> 0) ^ ((n >>> 0) >> 16)) >>> 0;
  return n;
}

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
```

The mixer's XOR-shift-multiply pattern distributes seed bits across all 32 bits, ensuring nearby seeds map to vastly different PRNG states. The large offsets (111, 222) between state variables prevent accidental clustering.

**Always test seed differentiation, not just determinism:**

```typescript
it("produces different output for different seeds", () => {
  const a = new SeededNoise(1);
  const b = new SeededNoise(2);
  expect(a.noise2D(1, 2)).not.toBe(b.noise2D(1, 2));
});
```

## Why This Matters

Poor PRNG initialization is a silent failure. The system appears deterministic (same seed = same output) but nearby seeds produce identical terrain. In a chunk-based world where chunk seeds derive from coordinates, this means adjacent chunks look the same — destroying the procedural generation contract.

## When to Apply

- Using `simplex-noise` (or any noise library) with a custom `random` function
- Deriving chunk seeds from world coordinates (nearby coordinates = nearby seeds)
- Any system where "same seed = same world" and "different seed = different world" must both hold

## Examples

**Before (broken — seeds 1 and 2 produce identical noise):**

```typescript
function brokenAlea(seed: number): () => number {
  let s0 = (seed >>> 0) / 4294967296;         // 1 → 2.328e-10
  let s1 = ((seed + 1) >>> 0) / 4294967296;   // 2 → 4.657e-10
  let s2 = ((seed + 2) >>> 0) / 4294967296;   // 3 → 6.985e-10
  // Differences are negligible; PRNG converges to same stream
  ...
}
```

**After (fixed — hash mixer produces distinct states):**

```typescript
function alea(seed: number): () => number {
  let s0 = mixSeed(seed) / 4294967296;       // 1 → 0.5198...
  let s1 = mixSeed(seed + 111) / 4294967296; // 112 → 0.8734...
  let s2 = mixSeed(seed + 222) / 4294967296; // 223 → 0.1247...
  // Well-distributed initial state; unique per seed
  ...
}
```

## Related

- `src/lib/noise.ts` — SeededNoise implementation with MurmurHash3 mixer
- `src/tests/noise.test.ts` — tests covering determinism and seed differentiation
- docs/solutions/best-practices/voxel-coordinate-math-patterns-2026-04-05.md — related: coordinate utilities consumed by the same terrain generation pipeline
