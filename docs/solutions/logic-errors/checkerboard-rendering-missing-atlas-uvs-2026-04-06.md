---
title: "Checkerboard Rendering: Missing Atlas UV Callback in Mesh Builder"
date: 2026-04-06
category: logic-errors
module: engine-renderer
problem_type: logic_error
component: tooling
symptoms:
  - "Terrain renders as a patchwork/checkerboard of all atlas texture colors instead of correct block colors"
  - "Top faces show mixed colors, side faces have striped gaps"
  - "Blocks appear to have random textures applied"
root_cause: logic_error
resolution_type: code_fix
severity: high
tags:
  - texture-atlas
  - uv-mapping
  - mesh-builder
  - three-js
  - voxel-rendering
---

# Checkerboard Rendering: Missing Atlas UV Callback in Mesh Builder

## Problem

The voxel terrain rendered as a patchwork/checkerboard of all atlas texture colors instead of showing correct per-block-type colors. Every block face displayed a random-looking slice of the entire texture atlas.

## Symptoms

- Terrain surface showed alternating strips of green, cyan, brown, grey, yellow
- Side faces had visible gaps with sky showing through
- The pattern was consistent across all chunks — not random, but wrong
- DoubleSide rendering made faces visible but didn't fix the color issue

## What Didn't Work

1. **Rewriting face winding order multiple times** — the geometry was actually correct (verified by unit tests showing correct vertex positions). The visual artifacts looked like a geometry bug but weren't.
2. **Switching between FrontSide and DoubleSide rendering** — this fixed face visibility but not the texture colors.
3. **Trying different triangle index patterns** — `(0,1,2)(0,2,3)` vs `(0,1,2)(2,3,0)` vs `(a,b,d)(b,c,d)`. None fixed the root issue.

## Solution

The `ChunkMeshBuilder.buildMesh()` accepts an optional `getUV` callback parameter that maps texture names to atlas UV coordinates. The callback has a default that returns `{u0: 0, v0: 0, u1: 1, v1: 1}` (the entire atlas). `ChunkManager` was calling `buildMesh()` **without passing the callback**, so every face mapped the full 9-texture atlas onto a single block face.

```typescript
// BEFORE (broken): no getUV callback passed — defaults to full atlas
const meshData = ChunkMeshBuilder.buildMesh(chunk, {}, this.registry);

// AFTER (fixed): pass atlas UV lookup
const meshData = ChunkMeshBuilder.buildMesh(chunk, {}, this.registry, this.getUV);
```

Where `getUV` resolves texture names to their atlas sub-rectangle:

```typescript
private readonly getUV: GetUV = (textureName: string) => {
  const uv = ATLAS_UVS[textureName];
  if (uv) return uv;
  return { u0: 0, v0: 0, u1: 1, v1: 1 };
};
```

## Why This Works

The texture atlas packs 9 different 16x16 textures into a single 64x48 image. Each block face needs UVs that sample only its specific texture tile (e.g., grass_top occupies `u: [0, 0.25], v: [0, 0.333]`). Without the callback, every face sampled the entire atlas — at block-level scale, this created a repeating pattern of all 9 textures, which looked like a random checkerboard.

A secondary issue was also found: the atlas texture needed `flipY = false` because the atlas UV coordinates assume top-left origin but Three.js defaults to bottom-left origin (`flipY = true`). Without this, grass_top's UVs sampled the crystal_shard row.

## Prevention

- When designing APIs with optional callback parameters that have "safe" defaults, document clearly what happens when the default is used. A default of "full texture range" is only safe for single-texture materials, not for atlas-based rendering.
- When debugging rendering issues, **add console.log first** to verify the data pipeline rather than rewriting geometry code based on visual guesses. The geometry was correct — the data flowing through it was wrong.
- Unit test the UV values being passed to the mesh builder, not just vertex positions.

## Related Issues

- docs/solutions/best-practices/noise-vs-hash-for-probability-decisions-2026-04-05.md — same project, different rendering-related debugging
- docs/solutions/best-practices/seeded-prng-for-simplex-noise-2026-04-05.md — same project
