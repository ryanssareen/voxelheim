---
title: "Noise vs Hash for Probability Decisions in Procedural Generation"
date: 2026-04-05
category: best-practices
module: engine-generation
problem_type: best_practice
component: tooling
severity: low
applies_when:
  - "Making threshold-based placement decisions (tree spawning, ore placement, structure generation)"
  - "Using simplex noise output as a probability and getting zero or near-zero hits"
  - "Needing uniform random distribution at discrete world positions"
tags:
  - simplex-noise
  - hash-function
  - probability
  - procedural-generation
  - uniform-distribution
  - murmurhash
---

# Noise vs Hash for Probability Decisions in Procedural Generation

## Context

When placing trees in the voxel engine's StructureGenerator, the initial approach used simplex noise normalized to [0, 1) as a probability threshold targeting ~3% placement. This produced zero trees across the entire world because simplex noise output clusters near zero and rarely reaches extreme values.

## Guidance

**Use noise for continuous spatial variation. Use hash functions for discrete probability decisions.**

Simplex/Perlin noise outputs follow a roughly Gaussian distribution centered at zero — values near the extremes (-1 or 1) are statistically rare. After normalization to [0, 1), getting above 0.97 is far less than 3%. Even high-frequency input multipliers don't fix the distribution shape.

Hash functions produce uniformly distributed integers across [0, 2^32). Dividing by 2^32 gives uniform [0, 1), making threshold comparisons reliable:

```typescript
function mixHash(a: number, b: number): number {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 15), 0x45d9f3b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0x45d9f3b) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

const chance = mixHash(wx + seedHash, wz) / 4294967296;
if (chance > 0.03) continue; // Exactly ~3% placement rate
```

## Why This Matters

This is a silent failure. The system appears to work (no errors, deterministic output) but produces zero results because the random values never hit the threshold. Debugging requires understanding the output distribution of your random source — not just its range.

## When to Apply

| Use case | Right tool |
|----------|-----------|
| Terrain heightmaps, temperature gradients, biome blending | Simplex/Perlin noise |
| Tree/ore/structure spawn chance (threshold decisions) | Hash function |
| Smooth color or density variation | Noise |
| Loot drops, weighted selection | Hash function |

Rule of thumb: if you're comparing against a threshold to make a yes/no decision, you need uniform distribution. Use a hash.

## Examples

**Before (broken — zero trees placed):**

```typescript
// Simplex noise clusters near 0; values above 0.97 are extremely rare
const chance = (noise.noise2D(wx * 0.7, wz * 0.7) + 1) / 2;
if (chance <= 0.97) continue; // Almost never passes
```

**After (correct — ~3% trees placed):**

```typescript
// Hash output is uniformly distributed; 3% of values fall below 0.03
const chance = mixHash(wx + seedHash, wz) / 4294967296;
if (chance > 0.03) continue; // Passes ~3% of the time
```

## Related

- `src/engine/generation/StructureGenerator.ts` — uses mixHash for tree placement probability
- docs/solutions/best-practices/seeded-prng-for-simplex-noise-2026-04-05.md — complementary: covers PRNG seed initialization (when to use noise), this doc covers when NOT to use noise
- docs/solutions/best-practices/voxel-coordinate-math-patterns-2026-04-05.md — same terrain generation pipeline
