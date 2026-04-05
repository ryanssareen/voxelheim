---
title: "feat: Add world constants"
type: feat
status: active
date: 2026-04-05
---

# feat: Add world constants

## Overview

Create `src/engine/world/constants.ts` with named exports for chunk dimensions, world size, sea level, and crystal shard placement parameters. These constants will be consumed by terrain generation, chunk management, and game systems.

## Requirements Trace

- R1. File at `src/engine/world/constants.ts`
- R2. Nine named `export const` declarations with exact values specified
- R3. JSDoc comment above each constant explaining what it controls
- R4. Individual named exports, not an object export

## Scope Boundaries

- No implementation code beyond constants
- No imports from other modules
- Do not modify existing files

## Key Technical Decisions

- **Individual named exports**: Enables tree-shaking and explicit imports. Each consumer imports only what it needs.
- **Numeric literals, not computed values**: Use `4096` not `16 * 16 * 16`. Keeps the file simple and values immediately visible. JSDoc can note the derivation.

## Implementation Units

- [ ] **Unit 1: Create world constants file**

  **Goal:** Define all world dimension and gameplay constants

  **Requirements:** R1, R2, R3, R4

  **Dependencies:** None

  **Files:**
  - Create: `src/engine/world/constants.ts`
  - Test: `src/tests/engine/world/constants.test.ts`

  **Approach:**
  - Replace the placeholder `src/engine/world/index.ts` content is untouched — constants.ts is a new sibling file
  - Each constant gets a JSDoc block explaining its role in the game world
  - Derived values (CHUNK_VOLUME, WORLD_SIZE_BLOCKS, WORLD_HEIGHT_BLOCKS) should note their derivation in JSDoc

  **Test scenarios:**
  - Happy path: Each constant is exported and equals its expected value
  - Happy path: CHUNK_VOLUME equals CHUNK_SIZE^3
  - Happy path: WORLD_SIZE_BLOCKS equals WORLD_SIZE_CHUNKS * CHUNK_SIZE
  - Happy path: WORLD_HEIGHT_BLOCKS equals WORLD_HEIGHT_CHUNKS * CHUNK_SIZE

  **Verification:**
  - `npx tsc --noEmit` passes
  - All constants importable by name from the module
