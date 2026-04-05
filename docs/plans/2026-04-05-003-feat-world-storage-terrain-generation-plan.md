---
title: "feat: Add world storage and terrain generation"
type: feat
status: active
date: 2026-04-05
---

# feat: Add world storage and terrain generation

## Overview

Create the chunk storage layer (Uint8Array-backed block storage) and terrain generation pipeline (height-mapped island with noise, biome assignment, crystal placement, and tree structures). This is the core world data layer that all rendering, physics, and gameplay systems will consume.

## Problem Frame

The engine has block definitions, coordinate utilities, noise generation, and world constants — but no way to store or generate actual world data. This phase bridges the data layer to a playable voxel world.

## Requirements Trace

- R1. Chunk class stores blocks in a Uint8Array of CHUNK_VOLUME length, addressable by local coords
- R2. TerrainGenerator produces deterministic terrain from a seed string using octave noise with island-shaped falloff
- R3. Block assignment follows biome rules: GRASS above sea level, SAND at/below, DIRT subsurface, STONE deep
- R4. Crystal placement: exactly CRYSTAL_SHARD_COUNT crystals in STONE blocks at least CRYSTAL_MIN_DEPTH below surface
- R5. StructureGenerator places trees (~3% chance on eligible GRASS) with LOG trunk and LEAVES canopy
- R6. Trees can span chunk boundaries — writes go to whichever chunk contains each block position
- R7. All generation is deterministic given the same seed

## Scope Boundaries

- No rendering, meshing, or visual output
- No chunk loading/unloading or world manager
- No player interaction or block breaking
- No water or fluid simulation
- No biome system beyond the height-based block assignment described

## Context & Research

### Relevant Code and Patterns

- `src/lib/coords.ts` — `localToIndex`, `worldToChunk`, `worldToLocal`, `chunkKey` for all coordinate conversions
- `src/lib/noise.ts` — `SeededNoise` with `octaveNoise2D` for terrain heightmap
- `src/engine/world/constants.ts` — `CHUNK_SIZE`, `CHUNK_VOLUME`, `SEA_LEVEL`, `CRYSTAL_SHARD_COUNT`, `CRYSTAL_MIN_DEPTH`
- `src/data/blocks.ts` — `BLOCK_ID` for block type constants
- `src/engine/world/BlockRegistry.ts` — singleton pattern to follow for any future registries

### Institutional Learnings

- Path alias convention: use `@lib/coords`, `@data/blocks`, `@engine/world/constants` (Vite prefix matching, no glob in alias keys)
- Seeded PRNG: use `SeededNoise` for deterministic generation; the Alea PRNG with MurmurHash3 mixer handles nearby seeds correctly
- Coordinate math: `localToIndex` uses Y-major layout (`lx + lz * 16 + ly * 256`), matching Chunk's Uint8Array storage order

## Key Technical Decisions

- **Uint8Array storage**: Compact (4096 bytes per chunk), fast indexed access, transferable to Web Workers. Block IDs fit in a byte (max 255 types).
- **Dirty flag on Chunk**: Signals mesh rebuild needed. Set on construction and any setBlock call. Consumers clear it after rebuilding.
- **SeededNoise constructor takes string seed**: TerrainGenerator converts the string seed to a number (e.g., simple hash) for SeededNoise. This allows human-readable seed names.
- **Island falloff via quadratic distance**: Center at (32, 32) with radius 28 creates a natural island boundary. Quadratic falloff produces smooth coastlines.
- **Cross-chunk tree placement**: StructureGenerator receives the full chunk map and writes blocks to any chunk by computing chunk coords from world coords. This avoids edge artifacts.

## Open Questions

### Resolved During Planning

- **How does TerrainGenerator convert string seed to number?** Use a simple string hash (sum of char codes or similar). The exact hash doesn't matter as long as it's deterministic.
- **How does placeCrystals find valid positions?** Iterate through all chunks, collect STONE block positions that are at least CRYSTAL_MIN_DEPTH below the surface, then pick CRYSTAL_SHARD_COUNT positions using seeded random selection.
- **How does StructureGenerator get surface heights?** Caller passes a `surfaceMap: Map<string, number>` keyed by `"wx,wz"`. TerrainGenerator builds this during generation.

### Deferred to Implementation

- **Exact string-to-number hash function**: Any deterministic hash works. Implementation chooses.
- **Tree trunk height variation**: 4-6 blocks, chosen per tree via seeded random. Exact distribution left to implementation.
- **Corner removal pattern for canopy**: "Randomly removed" corners — implementation decides the probability per corner.

## Implementation Units

- [ ] **Unit 1: Chunk class**

  **Goal:** Create block storage with Uint8Array backing and local-coord accessors

  **Requirements:** R1

  **Dependencies:** None

  **Files:**
  - Create: `src/engine/world/Chunk.ts`
  - Test: `src/tests/Chunk.test.ts`

  **Approach:**
  - Import `localToIndex` from `@lib/coords` and `CHUNK_VOLUME` from constants
  - Uint8Array initialized to zeros (AIR by default)
  - `getBlock`/`setBlock` delegate to `localToIndex` for array offset
  - `fill` uses `TypedArray.fill()`
  - `getBlockData` returns `new Uint8Array(this.data)` (copy)
  - `setBlockData` replaces internal array with a copy
  - `isEmpty` checks if `every` element is 0

  **Patterns to follow:**
  - `src/engine/world/BlockRegistry.ts` — class with readonly properties and JSDoc
  - `src/lib/coords.ts` — import pattern for coordinate utilities

  **Test scenarios:**
  - Happy path: New chunk `isEmpty()` returns true, all blocks are AIR (id 0)
  - Happy path: `setBlock(5, 3, 7, BLOCK_ID.STONE)` then `getBlock(5, 3, 7)` returns STONE
  - Happy path: `fill(BLOCK_ID.DIRT)` makes every position return DIRT, `isEmpty()` false
  - Happy path: `setBlock` sets `dirty = true` (create chunk, set dirty=false, call setBlock, verify dirty=true)
  - Edge case: `getBlockData()` returns a copy — modifying the returned array does not change chunk state
  - Edge case: `setBlockData()` stores a copy — modifying the source array after set does not change chunk state
  - Edge case: Chunk coordinates (cx, cy, cz) are accessible as readonly properties

  **Verification:**
  - `npx tsc --noEmit` passes
  - All Chunk tests pass

- [ ] **Unit 2: TerrainGenerator — heightmap and block assignment**

  **Goal:** Generate terrain chunks with noise-based island heightmap and biome block placement

  **Requirements:** R2, R3, R7

  **Dependencies:** Unit 1

  **Files:**
  - Create: `src/engine/generation/TerrainGenerator.ts`
  - Test: `src/tests/TerrainGenerator.test.ts`

  **Approach:**
  - Constructor takes a string seed, hashes it to a number, creates SeededNoise
  - `generateChunk(cx, cy, cz)` creates a Chunk, iterates 16x16 columns:
    - Compute world coords, octaveNoise2D for height, apply island falloff
    - Assign blocks per biome rules (GRASS/SAND/DIRT/STONE/AIR)
  - Island center at world (32, 32), falloff radius 28
  - Return a surfaceY lookup alongside the chunk for downstream tree placement
  - Consider exposing a `generateWorld()` method or having `generateChunk` populate a shared surfaceMap

  **Patterns to follow:**
  - `src/lib/noise.ts` — SeededNoise usage pattern with octaveNoise2D params
  - `src/lib/coords.ts` — worldToChunk, worldToLocal for coordinate conversion

  **Test scenarios:**
  - Happy path: Same seed string produces identical chunk block data (generate twice, compare getBlockData)
  - Happy path: Surface block at world position above SEA_LEVEL is GRASS
  - Happy path: Surface block at world position at/below SEA_LEVEL is SAND
  - Happy path: Block 1-3 layers below surface is DIRT
  - Happy path: Block 4+ layers below surface is STONE
  - Edge case: At island edge (distance >= 28 from center), surfaceY is 0 — all blocks are AIR or at ground level
  - Edge case: Block at exact surface Y matches expected surface block type (not off-by-one)

  **Verification:**
  - `npx tsc --noEmit` passes
  - Terrain generation tests pass
  - Determinism verified across multiple instantiations

- [ ] **Unit 3: Crystal placement**

  **Goal:** Place exactly CRYSTAL_SHARD_COUNT crystal blocks in valid STONE positions

  **Requirements:** R4, R7

  **Dependencies:** Unit 2

  **Files:**
  - Modify: `src/engine/generation/TerrainGenerator.ts`
  - Modify: `src/tests/TerrainGenerator.test.ts`

  **Approach:**
  - `placeCrystals(chunks, seed)` scans all chunks for STONE blocks at least CRYSTAL_MIN_DEPTH below surface
  - Uses a separate SeededNoise or seeded PRNG (from the seed string) to pick positions deterministically
  - Needs surface height data — either passed in or recomputed. Passing surfaceMap from generation is more efficient.
  - If fewer valid positions than CRYSTAL_SHARD_COUNT exist, place as many as possible

  **Patterns to follow:**
  - `src/lib/noise.ts` — Alea PRNG pattern for deterministic random selection

  **Test scenarios:**
  - Happy path: Exactly 5 crystal blocks placed in a fully generated world
  - Happy path: All crystal positions were previously STONE blocks
  - Happy path: All crystal positions are at least CRYSTAL_MIN_DEPTH below the surface
  - Happy path: Placement is deterministic — same seed produces same crystal positions
  - Edge case: If world has fewer than 5 valid STONE positions, place as many as available without error

  **Verification:**
  - Crystal count matches CRYSTAL_SHARD_COUNT
  - All placements in valid positions
  - Deterministic across runs

- [ ] **Unit 4: StructureGenerator — tree placement**

  **Goal:** Place trees on eligible GRASS surfaces with cross-chunk boundary support

  **Requirements:** R5, R6, R7

  **Dependencies:** Unit 2

  **Files:**
  - Create: `src/engine/generation/StructureGenerator.ts`
  - Modify: `src/tests/TerrainGenerator.test.ts` (or create separate test file)

  **Approach:**
  - Constructor takes string seed, creates seeded PRNG for tree placement decisions
  - `placeTrees(chunks, surfaceMap)` iterates surfaceMap entries
  - For each eligible position (surfaceY > SEA_LEVEL + 2, surface is GRASS, random > 0.97):
    - Trunk: 4-6 LOG blocks from surfaceY+1 upward (height varies per tree via seeded random)
    - Canopy: 3x3x2 LEAVES block region on top of trunk, some corners randomly removed
  - For each block placed: compute chunk coords via `worldToChunk`, look up chunk in map, use `worldToLocal` + `setBlock`
  - Skip block placement if target chunk doesn't exist in the map

  **Patterns to follow:**
  - `src/lib/coords.ts` — worldToChunk, worldToLocal, chunkKey for cross-chunk writes
  - `src/lib/noise.ts` — SeededNoise for deterministic random decisions

  **Test scenarios:**
  - Happy path: Trees only appear where surfaceY > SEA_LEVEL + 2 and surface is GRASS
  - Happy path: Tree trunk is LOG blocks, canopy is LEAVES blocks
  - Happy path: Tree placement is deterministic — same seed, same trees
  - Integration: Tree spanning chunk boundary writes blocks to correct chunks (place tree near chunk edge, verify blocks appear in adjacent chunk)
  - Edge case: No trees placed on SAND surfaces or below SEA_LEVEL + 2

  **Verification:**
  - Trees placed only on eligible positions
  - Cross-chunk writes land in correct chunks
  - Deterministic across runs

## System-Wide Impact

- **Interaction graph:** Chunk.setBlock is called by TerrainGenerator and StructureGenerator. Both generators consume coords.ts and noise.ts. No callbacks or middleware.
- **Error propagation:** No async operations. Invalid coords would produce wrong array indices — localToIndex handles this via the established coordinate contract.
- **State lifecycle risks:** Chunk.dirty flag must be respected by future mesh builders. getBlockData/setBlockData copy semantics prevent aliasing bugs.
- **API surface parity:** No other interfaces yet.
- **Integration coverage:** Tree cross-chunk placement is the key integration scenario — unit tests should verify blocks land in the correct chunk when a tree spans a boundary.
- **Unchanged invariants:** coords.ts, noise.ts, constants.ts, blocks.ts, BlockRegistry.ts are not modified.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| SeededNoise constructor takes number but TerrainGenerator spec says string seed | Hash string to number deterministically; document the conversion |
| Crystal placement may be slow if scanning all chunks naively | For a 4x4x4 world (64 chunks, 262144 blocks), linear scan is fine. Optimize later if world grows. |
| Tree canopy corner removal is underspecified | Implementation chooses ~50% removal probability per corner. Visuals can be tuned later. |
| Cross-chunk tree writes assume all relevant chunks exist in the map | Skip placement for blocks whose target chunk is missing. Document this behavior. |

## Sources & References

- Related code: `src/lib/coords.ts`, `src/lib/noise.ts`, `src/engine/world/constants.ts`, `src/data/blocks.ts`
- Institutional learnings: `docs/solutions/best-practices/seeded-prng-for-simplex-noise-2026-04-05.md`, `docs/solutions/best-practices/voxel-coordinate-math-patterns-2026-04-05.md`
