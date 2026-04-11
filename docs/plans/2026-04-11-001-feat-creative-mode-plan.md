---
title: "feat: Add creative mode with flight, instant break, and creative inventory"
type: feat
status: active
date: 2026-04-11
origin: docs/brainstorms/2026-04-11-creative-mode-requirements.md
---

# feat: Add Creative Mode

## Overview

Wire up the existing Creative/Survival toggle on the world creation page. Creative mode gives players invulnerability, flight, instant block breaking (no drops), and an infinite-stack creative inventory. Multiplayer sessions inherit the host's mode.

## Problem Frame

Voxelheim has no way to build freely — every interaction is gated by survival mechanics (health, hunger, tools, mining speed). The create-world page already has a disabled Creative button and the physics architecture doc describes how to add flight. This plan wires it all together. (see origin: `docs/brainstorms/2026-04-11-creative-mode-requirements.md`)

## Requirements Trace

- R1. Game mode persisted in WorldMeta, loaded in Engine
- R2. Mode set at creation, multiplayer inherits host's mode
- R3. No damage, no death, health/hunger hidden
- R4. Mobs ignore creative player
- R5. Double-tap Space toggles flight; Space=up, Shift=down, WASD=horizontal
- R6. Flight disables gravity, fall damage, auto-jump; landing doesn't disable flight
- R7. Toggling flight off resumes gravity
- R8. Creative inventory with infinite stacks of every placeable block
- R9. Creative inventory replaces survival inventory and crafting
- R10. Breaking blocks in creative doesn't drop items
- R11. Instant break (no mining time, no tool required)
- R12. isFlying syncs in multiplayer

## Scope Boundaries

- No spectator mode
- No mid-game mode switching
- No creative-exclusive blocks
- No per-player mode in multiplayer — all players share host's mode

## Context & Research

### Relevant Code and Patterns

- `src/app/game/create/page.tsx` — disabled Creative button at line 214-223, `gameMode` state var at line 31
- `src/systems/persistence/WorldStorage.ts` — `WorldMeta` interface (lines 3-17), no `gameMode` field
- `src/engine/Engine.ts` — loads `worldType` from savedMeta/sessionStorage (lines 94-113), similar pattern for gameMode
- `src/engine/player/PlayerController.ts` — gravity at line 89-92, jump at 94-97, velocity from input at 86-87
- `src/engine/player/BlockInteraction.ts` — break progress at 104-126, drops at 132-141, placement depletion at 215
- `src/ui/HUD.tsx` — health/hunger bars at lines 235-246
- `src/engine/entities/MobManager.ts` — mob attacks at lines 84-93
- `src/engine/entities/Mob.ts` — `updateHostileAI` detects player at line 292
- `src/lib/multiplayer/types.ts` — `MultiplayerPlayerState` (lines 15-25)
- `src/store/useGameStore.ts` — game state store, no mode field
- `src/ui/InventoryUI.tsx` — 2x2 crafting grid, slot click handlers

### Institutional Learnings

- `docs/solutions/best-practices/player-physics-movement-architecture-2026-04-10.md` — describes adding flight: gate gravity with `isFlying`, extend multiplayer sync, disable auto-jump
- `docs/solutions/runtime-errors/inventory-tool-system-crash-and-data-loss-2026-04-08.md` — pad slot arrays on load, thread durability through all cursor ops

## Key Technical Decisions

- **gameMode stored in useGameStore, not a separate store**: One source of truth, already read by HUD, Engine, and damage systems. Added as `gameMode: "survival" | "creative"` with setter.
- **Double-tap detection in PlayerController**: 300ms window between Space presses. Tracks `lastSpacePressTime` to detect double-tap vs single press.
- **Creative inventory as a new component (CreativeInventoryUI)**: Cleaner than branching InventoryUI with conditionals. The creative grid is fundamentally different — no crafting, infinite stacks, all blocks visible.
- **Flight uses Shift for descend, not Ctrl**: Ctrl stays as crouch for edge-building. Shift is repurposed in flight mode (not sprint — sprint is irrelevant while flying).
- **isFlying added to MultiplayerPlayerState**: New boolean field. Remote avatars already interpolate position — they'll just float instead of walk-animate when `isFlying` is true.

## Open Questions

### Resolved During Planning

- **Creative inventory UI approach**: New component — `CreativeInventoryUI.tsx`. The survival inventory has crafting grids, cursor item, durability tracking. Creative needs none of that — a simple grid of all block types with infinite counts.
- **Double-tap timing**: 300ms window. Standard game feel — fast enough to trigger intentionally, slow enough to not trigger by accident during building.
- **isFlying in multiplayer**: New field on `MultiplayerPlayerState`. Clean addition, no reuse of existing fields.

### Deferred to Implementation

- Exact fly speed tuning (start with WALK_SPEED = 5, adjust if too slow/fast)
- Whether creative inventory needs scroll or fits on one screen (depends on block count — currently 13 placeable blocks, fits easily)

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```
Game Mode Flow:
  Create World Page → gameMode saved in WorldMeta + sessionStorage
  Engine.init() → reads gameMode → sets useGameStore.gameMode
  All systems read useGameStore.getState().gameMode to branch behavior

Flight State Machine:
  GROUNDED → [double-tap Space] → FLYING
  FLYING → [Space held] → ascending
  FLYING → [Shift held] → descending
  FLYING → [double-tap Space] → GROUNDED (gravity resumes)
  FLYING → [no vertical input] → hovering (velocity.y = 0)

Creative Inventory:
  E key → opens CreativeInventoryUI (not InventoryUI)
  Grid shows all BLOCK_DEFINITIONS where solid === true
  Each slot: blockId + count = Infinity display
  Click slot → selected as active block in hotbar
  Placing never depletes stack
```

## Implementation Units

- [ ] **Unit 1: Game Mode Persistence & Store**

**Goal:** Add gameMode to WorldMeta, wire it through creation → save → load → game store so all systems can read it.

**Requirements:** R1, R2

**Dependencies:** None

**Files:**
- Modify: `src/systems/persistence/WorldStorage.ts`
- Modify: `src/app/game/create/page.tsx`
- Modify: `src/engine/Engine.ts`
- Modify: `src/store/useGameStore.ts`

**Approach:**
- Add `gameMode?: "survival" | "creative"` to `WorldMeta` interface
- Enable the Creative button on create page (remove disabled styling, pass gameMode to saveWorld and sessionStorage)
- In Engine.init(), load gameMode from savedMeta or sessionStorage, store on `this.gameMode` and call `useGameStore.getState().setGameMode(mode)`
- Add `gameMode: "survival" | "creative"` and `setGameMode` to useGameStore
- For multiplayer: include gameMode in the session metadata so joiners inherit the host's mode

**Patterns to follow:**
- `worldType` loading pattern in Engine.init() lines 94-113
- `WorldMeta` field additions per WorldStorage.ts conventions

**Test scenarios:**
- Happy path: Create world with Creative selected → reload → gameMode persists as "creative"
- Happy path: Create world with Survival → gameMode persists as "survival"
- Edge case: Old save without gameMode field → defaults to "survival"
- Integration: Multiplayer session created with creative → joining player reads creative mode

**Verification:**
- `useGameStore.getState().gameMode` returns "creative" after creating a creative world

---

- [ ] **Unit 2: Flight Physics**

**Goal:** Add flying to PlayerController with double-tap Space toggle, Space=ascend, Shift=descend, no gravity while flying.

**Requirements:** R5, R6, R7

**Dependencies:** Unit 1 (gameMode must be readable)

**Files:**
- Modify: `src/engine/player/PlayerController.ts`
- Modify: `src/engine/Engine.ts` (pass gameMode to PlayerController)

**Approach:**
- Add `public isFlying = false` and `private lastSpacePressTime = 0` to PlayerController
- In update(): detect Space key-down edge (not held). If time since last Space press < 300ms → toggle isFlying. Otherwise record press time.
- When `isFlying`:
  - Skip gravity entirely (no `velocity.y -= GRAVITY * dt`)
  - Space held → `velocity.y = speed` (ascend)
  - ShiftLeft/ShiftRight held → `velocity.y = -speed` (descend)
  - Neither → `velocity.y = 0` (hover)
  - Skip auto-jump
  - Disable crouch edge prevention (irrelevant while flying)
- When flight toggled off: set `isFlying = false`, let gravity resume naturally (velocity.y stays wherever it was)
- Only allow flight toggle when gameMode is "creative"
- Engine.ts: pass gameMode to PlayerController.update() or set a property

**Patterns to follow:**
- Existing jump logic structure at lines 94-97
- Crouch detection pattern at lines 59-66

**Test scenarios:**
- Happy path: Double-tap Space → isFlying becomes true, gravity stops
- Happy path: While flying, hold Space → player ascends
- Happy path: While flying, hold Shift → player descends
- Happy path: Double-tap Space again → isFlying false, gravity resumes
- Edge case: Single Space press while flying → ascend (not toggle off)
- Edge case: Toggle off mid-air → player falls
- Edge case: Survival mode → double-tap Space does nothing special (just normal jump)

**Verification:**
- Player can fly up, hover, descend, and land. Flight only works in creative mode.

---

- [ ] **Unit 3: Invulnerability & HUD**

**Goal:** In creative mode, disable all damage and hide health/hunger bars.

**Requirements:** R3

**Dependencies:** Unit 1

**Files:**
- Modify: `src/engine/Engine.ts` (skip damage, fall damage, void damage, starvation)
- Modify: `src/ui/HUD.tsx` (hide bars)
- Modify: `src/store/useGameStore.ts` (damagePlayer no-ops in creative)

**Approach:**
- In `damagePlayer()`: early return if `gameMode === "creative"`
- In `killPlayer()`: early return if creative
- In Engine.ts: skip fall damage calculation, void death, starvation timer when creative
- In HUD.tsx: read gameMode from store, wrap health/hunger bars in `{gameMode === "survival" && ...}`

**Patterns to follow:**
- Existing `isDead` conditional gates in Engine.ts

**Test scenarios:**
- Happy path: Creative player falls from height → no damage
- Happy path: Creative player at 0 hunger → no starvation damage
- Happy path: HUD shows no hearts/hunger in creative
- Happy path: HUD shows hearts/hunger in survival (no regression)

**Verification:**
- Health stays at 20, hunger stays at 20, no death screen ever appears in creative mode

---

- [ ] **Unit 4: Mob Passivity**

**Goal:** Hostile mobs don't target or attack the creative-mode player.

**Requirements:** R4

**Dependencies:** Unit 1

**Files:**
- Modify: `src/engine/entities/MobManager.ts` (skip attack checks)
- Modify: `src/engine/entities/Mob.ts` (hostile AI ignores player in creative)

**Approach:**
- Pass gameMode to MobManager.update() from Engine.ts
- In MobManager: skip mob attack block (lines 84-93) when creative
- In Mob.updateHostileAI(): when creative, skip player detection — wander instead of chase
- Mobs still spawn and exist, they just don't aggro

**Patterns to follow:**
- Existing `isNight` conditional pattern in MobManager

**Test scenarios:**
- Happy path: Zombie near creative player → wanders, doesn't chase
- Happy path: Skeleton near creative player → no ranged attacks
- Happy path: Survival mode → mobs still attack (no regression)

**Verification:**
- Walking past hostile mobs in creative triggers no damage or aggro

---

- [ ] **Unit 5: Instant Break & No Drops**

**Goal:** Left-click instantly destroys any block with no drops or break progress in creative mode.

**Requirements:** R10, R11

**Dependencies:** Unit 1

**Files:**
- Modify: `src/engine/player/BlockInteraction.ts`

**Approach:**
- In update(), when left-click and creative mode: immediately call `setBlock(AIR)` on the target block, skip break time accumulation, skip drop spawning, skip tool damage
- Read gameMode from useGameStore in BlockInteraction (or receive as parameter)
- Early return from the timed-breaking branch when creative

**Patterns to follow:**
- Existing break flow structure at lines 100-156

**Test scenarios:**
- Happy path: Creative player left-clicks stone → instantly gone, no drops
- Happy path: Creative player left-clicks block requiring tool → still instant
- Happy path: Survival player left-clicks stone → normal timed break with drops (no regression)
- Edge case: Break progress bar should not appear in creative

**Verification:**
- Any block breaks on first click in creative. No floating items spawn.

---

- [ ] **Unit 6: Creative Inventory & Infinite Placement**

**Goal:** E key opens a creative inventory with infinite stacks of all placeable blocks. Placing blocks doesn't deplete.

**Requirements:** R8, R9

**Dependencies:** Unit 1

**Files:**
- Create: `src/ui/CreativeInventoryUI.tsx`
- Modify: `src/ui/GameCanvas.tsx` (render CreativeInventoryUI)
- Modify: `src/engine/Engine.ts` (E key opens creative vs survival inventory)
- Modify: `src/engine/player/BlockInteraction.ts` (skip removeSelectedItem in creative)

**Approach:**
- New `CreativeInventoryUI` component: grid of all `BLOCK_DEFINITIONS` where `solid === true`. Each cell shows the block icon with "∞" count. Clicking a cell sets it as the active hotbar slot.
- In Engine.ts E-key handler: if creative, toggle CreativeInventoryUI via a new `useInventoryStore.creativeOpen` flag instead of `isOpen`
- In BlockInteraction.ts placement: skip `hotbar.removeSelectedItem()` when creative (block already handled by `setBlock` returning true)
- Hotbar slots in creative: pre-filled with common blocks, but player can swap from creative inventory

**Patterns to follow:**
- `CraftingTableUI.tsx` layout and `InventorySlot` component
- `ItemIcon` from `src/ui/ItemIcon.tsx`

**Test scenarios:**
- Happy path: Press E in creative → creative inventory opens with all placeable blocks
- Happy path: Click a block in creative inventory → it becomes the active hotbar item
- Happy path: Place block in creative → block appears, hotbar count doesn't decrease
- Happy path: Press E in survival → normal inventory with crafting (no regression)
- Edge case: Creative inventory shows only solid/placeable blocks, not tools or food

**Verification:**
- Player can browse all blocks, select any, and place infinitely

---

- [ ] **Unit 7: Multiplayer Flight Sync**

**Goal:** isFlying state syncs so remote players see each other flying.

**Requirements:** R12

**Dependencies:** Unit 2

**Files:**
- Modify: `src/lib/multiplayer/types.ts` (add isFlying to MultiplayerPlayerState)
- Modify: `src/engine/multiplayer/MultiplayerManager.ts` (send isFlying)
- Modify: `src/engine/multiplayer/RemotePlayerAvatar.ts` (render floating when flying)

**Approach:**
- Add `isFlying: boolean` to `MultiplayerPlayerState`
- In MultiplayerManager.broadcastState(): include `this.player.isFlying`
- In RemotePlayerAvatar: when `isFlying`, suppress walk animation and optionally add slight bob

**Patterns to follow:**
- Existing `isCrouching` sync pattern in MultiplayerManager

**Test scenarios:**
- Happy path: Player A flies → Player B sees Player A floating
- Happy path: Player A lands → Player B sees walking animation resume
- Edge case: Old client without isFlying field → default to false

**Verification:**
- Remote players render correctly as floating when flying

## System-Wide Impact

- **Interaction graph:** gameMode read by Engine, HUD, BlockInteraction, MobManager, PlayerController, InventoryUI — all through `useGameStore.getState().gameMode`
- **Error propagation:** No new error surfaces — creative mode removes failure paths (no death, no damage)
- **State lifecycle risks:** Switching world types doesn't switch mode (mode is per-world). Old saves default to "survival".
- **API surface parity:** Multiplayer sessions inherit mode — no per-player mismatch possible
- **Unchanged invariants:** Survival mode behavior is unchanged. All creative conditionals are additive gates.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Flight physics feels wrong (too fast/slow) | Start with WALK_SPEED, easy to tune post-implementation |
| Double-tap detection misfires during fast building | 300ms window is well-tested in Minecraft-like games |
| Old saves break with new WorldMeta field | Optional field with "survival" default — backward compatible |

## Sources & References

- **Origin document:** [docs/brainstorms/2026-04-11-creative-mode-requirements.md](docs/brainstorms/2026-04-11-creative-mode-requirements.md)
- Flight architecture: `docs/solutions/best-practices/player-physics-movement-architecture-2026-04-10.md`
- Inventory patterns: `docs/solutions/runtime-errors/inventory-tool-system-crash-and-data-loss-2026-04-08.md`
