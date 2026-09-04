---
title: "Invisible Wall: Surviving Chunks Kept Faces Culled Against a Neighbour That Had Unloaded"
date: 2026-09-04
category: logic-errors
module: engine-world
problem_type: logic_error
component: chunk-manager
symptoms:
  - "Terrain cuts off behind an invisible wall in infinite/flat worlds"
  - "The invisible blocks are solid, collide, and can be mined"
  - "Holes appear only after walking away and coming back, never on first load"
root_cause: logic_error
resolution_type: code_fix
severity: high
related_components:
  - "ChunkManager"
  - "ChunkMeshBuilder"
tags:
  - chunk-streaming
  - remesh
  - face-culling
  - world-border
---

# Invisible Wall: Surviving Chunks Kept Faces Culled Against a Neighbour That Had Unloaded

## Problem

In streaming (infinite/flat) worlds, terrain sometimes ended at a wall of
blocks that were real (`getBlock` returned them, physics collided, mining
worked) but were never drawn.

## Why the obvious suspect was wrong

`ChunkMeshBuilder` treats a missing neighbour as air, so a chunk meshed before
its neighbour exists draws *extra* boundary faces, never fewer. The arrival
path already handles that: `processGenerationQueue` calls
`markNeighborColumnsForRemesh` after generating a column, and the neighbour
re-culls the now-shared face. That direction was verified working and is now
pinned by a regression test.

## Root cause

`unloadColumn` removed a column's chunks and meshes but never re-queued the
surviving neighbours. Those neighbours had been meshed while the unloaded
column was solid, so their boundary faces were culled. After the unload nothing
told them the assumption was stale, and the exposed face stayed undrawn while
the block data underneath was still fully real.

## Fix

One line at the end of `unloadColumn`, after the column's chunks are deleted:
`this.markNeighborColumnsForRemesh(ccx, ccz)`. Deleting first matters, so the
rebuild sees the column as absent and draws the boundary face.

## Prevention

- Every state transition that changes *which chunks exist* needs the same
  neighbour-remesh call as its inverse. Arrival and departure must be
  symmetric.
- `src/tests/ChunkManager.test.ts` drives a stub renderer through both
  directions with `renderDistance` forced to 1 and asserts the neighbour's
  mesh is rebuilt and its vertex count moves the right way. Drain the budgeted
  queues over many simulated frames; one call is never enough.
- Island worlds now carve a visible STONE perimeter ring in
  `generateFiniteWorld`, so "the world ends here" is drawn geometry rather than
  a fall into ungenerated space.
