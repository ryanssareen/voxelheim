---
title: "Voxel Coordinate Math Patterns: Negative Modulo, Index Layout, and Web Worker Safety"
date: 2026-04-05
category: best-practices
module: engine-coordinates
problem_type: best_practice
component: tooling
severity: low
applies_when:
  - "Building coordinate utility functions for a chunk-based voxel world"
  - "Converting between world-space and local-space coordinates that may be negative"
  - "Indexing into flat chunk storage arrays for terrain generation"
  - "Running coordinate math inside Web Workers"
tags:
  - voxel-coordinates
  - negative-modulo
  - chunk-layout
  - web-worker-safety
  - y-major-indexing
  - pure-functions
---

# Voxel Coordinate Math Patterns: Negative Modulo, Index Layout, and Web Worker Safety

## Context

Voxelheim uses a 16x16x16 chunk-based world coordinate system. Coordinates are split into two levels: world-space (global position) and local-space (position within a chunk). Efficient conversion between these spaces is critical for terrain generation, entity lookups, and block access. Several JavaScript-specific pitfalls make these conversions error-prone, especially with negative world coordinates.

## Guidance

### Double-Modulo for Negative World Coordinates

JavaScript's `%` operator preserves the sign of the dividend. Use the double-modulo pattern to safely wrap negative coordinates into [0, 15]:

```typescript
export function worldToLocal(wx: number, wy: number, wz: number) {
  return {
    lx: ((wx % 16) + 16) % 16,
    ly: ((wy % 16) + 16) % 16,
    lz: ((wz % 16) + 16) % 16,
  };
}
```

### Math.floor for Chunk Coordinates

Always use `Math.floor()` when dividing world coordinates by chunk size. Bitwise `>> 4` and `Math.trunc()` give wrong results for negatives:

```typescript
export function worldToChunk(wx: number, wy: number, wz: number) {
  return {
    cx: Math.floor(wx / 16),
    cy: Math.floor(wy / 16),
    cz: Math.floor(wz / 16),
  };
}
```

### Y-Major Memory Layout for Vertical Slices

Store block indices as `lx + lz * 16 + ly * 256`. This makes vertical columns contiguous in memory, which benefits terrain generation that processes columns sequentially:

```typescript
export function localToIndex(lx: number, ly: number, lz: number): number {
  return lx + lz * 16 + ly * 256;
}
```

### Chunk Keys as Deterministic Strings

Use template literals for chunk identification in Maps and caches:

```typescript
export function chunkKey(cx: number, cy: number, cz: number): string {
  return `${cx},${cy},${cz}`;
}
```

### Zero Dependencies for Web Worker Safety

Keep coordinate utilities free of imports — including project-internal constants. Hardcode chunk size as a literal (16). This enables safe execution in Web Workers without module resolution complexity.

## Why This Matters

Coordinate conversion errors compound across a voxel engine:

- Wrong local wrapping causes blocks to appear in the wrong chunk
- Wrong chunk coordinates break spatial indexing and culling
- Non-contiguous memory layout degrades terrain generation performance
- Negative coordinate bugs only surface in quadrants away from the origin, making them hard to catch in early testing

## When to Apply

- Converting between world and local coordinate spaces
- Indexing into chunk storage arrays
- Looking up chunks in a spatial cache or map
- Generating terrain that processes vertical columns
- Running coordinate math inside Web Worker threads
- Supporting negative world coordinates (underground, negative quadrants)

## Examples

**Before (buggy approaches):**

```typescript
// Wrong: % doesn't handle negatives correctly
function worldToLocal(wx) {
  return wx % 16; // -1 % 16 = -1, not 15
}

// Wrong: Bitwise shift truncates toward zero
function worldToChunk(wx) {
  return wx >> 4; // -17 >> 4 = -2 (happens to work), but semantics are unclear
}

// Wrong: Y-minor layout scatters column data
function localToIndex(lx, ly, lz) {
  return lx + ly * 16 + lz * 256; // Horizontal rows contiguous, not columns
}
```

**After (correct patterns):**

```typescript
// Correct: Double-modulo wraps negatives to [0, 15]
function worldToLocal(wx) {
  return ((wx % 16) + 16) % 16;
}
// -1 → 15, -16 → 0, -17 → 15

// Correct: Math.floor handles all negative cases
function worldToChunk(wx) {
  return Math.floor(wx / 16);
}
// -1 → -1, -16 → -1, -17 → -2

// Correct: Y-major layout keeps vertical slices contiguous
function localToIndex(lx, ly, lz) {
  return lx + lz * 16 + ly * 256;
}
```

**Testing negative coordinates is essential:**

```typescript
it("maps negative coords to local (wraps to positive)", () => {
  expect(worldToLocal(-1, 0, 0)).toEqual({ lx: 15, ly: 0, lz: 0 });
  expect(worldToLocal(-16, 0, 0)).toEqual({ lx: 0, ly: 0, lz: 0 });
  expect(worldToLocal(-17, 0, 0)).toEqual({ lx: 15, ly: 0, lz: 0 });
});
```

## Related

- `src/lib/coords.ts` — implementation of these patterns
- `src/tests/coords.test.ts` — test coverage including negative coordinate edge cases
- docs/solutions/best-practices/vercel-headers-nested-route-matching-2026-04-05.md — related: COOP/COEP headers enabling SharedArrayBuffer for Web Workers
- docs/plans/2026-04-05-002-feat-world-constants-plan.md — defines CHUNK_SIZE and world dimension constants consumed by coordinate functions
