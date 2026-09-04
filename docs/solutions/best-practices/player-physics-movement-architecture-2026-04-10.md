---
title: "Player Physics and Movement Architecture"
date: 2026-04-10
category: best-practices
module: engine-player
problem_type: best_practice
component: player-controller
severity: medium
last_updated: 2026-07-31
applies_when:
  - "Modifying player movement, jump, or gravity behavior"
  - "Adding new movement modes (swimming, climbing, flying)"
  - "Debugging collision issues or player clipping through blocks"
  - "Syncing player state in multiplayer"
  - "Tuning fall damage, knockback, or movement speeds"
tags:
  - physics
  - gravity
  - collision
  - movement
  - multiplayer-sync
  - player-controller
  - aabb
---

# Player Physics and Movement Architecture

## Context

Voxelheim uses a ground-based gravity model for the player. The `PlayerController` handles all physics locally each frame: gravity, input-driven movement, and AABB collision. There is no server-authoritative physics -- each client runs its own simulation. Understanding this architecture is essential before modifying movement behavior or adding new movement modes.

## Guidance

### Physics Loop Order

The player update runs once per frame in this exact order within `PlayerController.update()`:

1. Double-tap Space detection for the flight toggle (creative only)
2. Read crouch/sprint state from input
3. Compute camera-relative WASD movement vector, apply speed multiplier
4. Apply gravity to `velocity.y` (only when `onGround === false`) -- the whole gravity/jump block is gated behind `if (!this.isFlying)`
5. Handle jump input (Space when `onGround`)
6. Move and collide on Y (sub-stepped)
7. Ground probe: when standing still, `moveAxisSafe` skips the Y move entirely, so nothing would clear `onGround`. This step re-checks that ground still exists beneath the hitbox. Skipped while flying.
8. Move and collide on X, then Z (sub-stepped), with a crouch edge-prevention rollback after each
9. Post-collision overlap resolution (`resolveOverlap`)

After `PlayerController.update()` returns, `Engine.gameLoopInner()` handles:

10. Fall damage calculation (compares `fallStartY` to landing position)
11. Void death check. Two different thresholds: the **player** dies below Y < -10, a **mob** below Y < 0 (`Mob.update`). The mob threshold is shallow enough that anything which displaces a mob under the terrain surface kills it almost immediately -- see the phantom-block collision bug linked under Related Files.
12. Block interaction, mob combat, hunger, and rendering

### Physics Constants

| Constant | Value | Purpose |
|----------|-------|---------|
| GRAVITY | 20 m/s^2 | Downward acceleration when airborne |
| JUMP_VELOCITY | 8 m/s | Initial upward velocity on jump |
| MAX_FALL_SPEED | -40 m/s | Terminal velocity cap |
| WALK_SPEED | 5 blocks/s | Normal movement speed |
| SPRINT_SPEED | 8 blocks/s | Sprint (Shift) movement speed |
| CROUCH_SPEED | 2.5 blocks/s | Crouch (Ctrl/CapsLock) movement speed |
| HALF_WIDTH | 0.3 | Half the player hitbox width (hitbox is 0.6 x 0.6) |
| STAND_HEIGHT | 1.8 | Standing hitbox height |
| CROUCH_HEIGHT | 1.4 | Crouching hitbox height |
| MAX_STEP_SIZE | 0.45 | Max displacement per collision sub-step |
| FLY_SPEED | 20 blocks/s | Flight movement and ascend/descend speed |
| FLY_SPRINT_SPEED | 40 blocks/s | Flight speed while holding Shift |
| DOUBLE_TAP_WINDOW | 300 ms | Max gap between Space presses to toggle flight |

### Collision Sub-Stepping

The original plan called for single-step axis movement, but this caused clipping at high velocities (knockback from mobs can reach 5 m/s). The current implementation breaks each axis displacement into sub-steps of at most 0.45 blocks. If collision stops the player on any sub-step, remaining sub-steps for that axis are skipped.

### Why Y-Axis Resolves First

Y-axis collision runs before X and Z so that `onGround` is set correctly before lateral collision. This matters for:

- Jump input: only accepted when `onGround` is true
- Gravity: only applies when `onGround` is false

If X/Z resolved first, the player could briefly register as on-ground during a lateral slide, causing phantom jumps.

### Player Auto-Jump (Settings-Gated)

The player has step-up assist again, gated behind `useSettingsStore().autoJump` (default on). This reverses the "no auto-jump" note that used to live here: `PlayerController` once again tracks whether a frame's horizontal move was blocked, because step-up assist needs that.

`moveAxis` and `moveAxisSafe` now return the block layer their collision resolved against (`number | null`) instead of `void` -- `update()` captures `hitX`/`hitZ` from the X/Z move calls. After `resolveOverlap()`, if the player is grounded, not crouching, not flying, and the setting is on, a blocked axis is checked with `isOneBlockLedge(axis, layer, getBlock, registry)`: solid at foot level somewhere across the cross-axis span (using `maxBlock` for the max edge, per the half-open AABB rule), with `ceil(height)` blocks of clearance above every solid cell in that span. If either blocked axis qualifies, `velocity.y = AUTO_JUMP_VELOCITY` (7, the same impulse `Mob.updateHostileAI` uses for step-ups) and `onGround = false` -- applied at the *end* of the frame, after `resolveOverlap`, so it never competes with that method's downward-push candidate; the actual rise happens on the Y move at the start of the next frame.

The step-up is a plain jump impulse, not a teleport: it clears the ledge in flight the same way a manual jump would, and re-fires on the next grounded blocked frame if the first hop landed short. A two-block-tall obstruction (no head clearance) or a crouching/flying player never triggers it -- see `src/tests/autoJump.test.ts`.

Note the inversion this replaces, because it is easy to get backwards: **mobs** already had step-up assist (`Mob.updateHostileAI` gives a vertical impulse when the next path waypoint is above the mob and it is grounded) while the player did not. Both now behave the same way, modulo the player's setting and its ledge-shape check.

### Multiplayer Position Sync

Player position is broadcast every 120ms via `MultiplayerManager.update()`. Only position (x, y, z), rotation (yaw, pitch), and `isCrouching` are synced.

What is NOT synced:
- `velocity` (each client runs its own physics)
- `onGround` (local computation only)
- `isSprinting` (visual only for local player)
- Fall damage state (`fallStartY`, `wasFalling`)

Remote players are rendered via `RemotePlayerAvatar` which interpolates position with a lerp factor of 12/s. This means remote jump arcs appear smoothed rather than parabolic. The visual is acceptable but not physics-accurate.

### Flight Mode (shipped)

Flight is implemented and creative-only. Double-tapping Space within `DOUBLE_TAP_WINDOW` toggles `isFlying`; Space ascends, Ctrl descends, neither hovers. Survival forces `isFlying = false` every frame.

How it interacts with the rest of the loop:

1. The gravity and jump block is gated behind `if (!this.isFlying)`. Crouch, the ground probe, and the crouch edge-prevention rollbacks are gated the same way.
2. Fall damage in `Engine.gameLoopInner()` tracks `wasFalling` and `fallStartY`, and resets them while flying to avoid ghost fall damage on landing.
3. Collision still applies during flight -- the AABB system runs regardless of movement mode.

**Known gap:** movement mode is not part of the multiplayer sync payload. `MultiplayerPlayerState` has no `isFlying` field, so a flying player's remote avatar is interpolated as if walking and can appear to drift vertically. Adding the field is the fix if this becomes visible.

If adding a further mode (swimming, climbing), follow the same shape: a flag on `PlayerController`, a gate on the gravity/jump block, and a decision about whether the flag needs syncing.

### Mob Physics Parity

Mobs use the same gravity constant (20 m/s^2) and axis-by-axis AABB collision as the player, but with their own `moveAxis()` implementation in `Mob.ts`. They have a different terminal velocity cap (-15 vs -40) and no sub-stepping. Mobs, unlike the player, do have step-up assist.

**Parity is now partly enforced in code rather than by advice.** Both implementations import `maxBlock` from `@engine/physics` for their AABB max edges. The loops are still separate; only the range helper is shared.

This section previously said only "consider whether `Mob.moveAxis()` needs the same fix." That advisory was correct and was not acted on, which is exactly how `Mob.moveAxis` shipped without the `if (delta === 0) return;` guard `PlayerController.moveAxis` already had -- and that gap made mobs fall out of the world when knocked into a wall. See `docs/solutions/logic-errors/aabb-max-edge-phantom-block-collision.md`.

When you change collision behavior, work the checklist rather than the advice:

1. Does the change belong in `@engine/physics` as a shared primitive instead of in one class?
2. Does `Mob.moveAxis` need the same change? Does the paused/chat-composing gravity scan in `Engine.ts` -- a third copy of the same loop -- need it too?
3. Add a test covering **both** the player and a mob. `src/tests/collision.test.ts` is the home and shows the stubbing needed for each.

## Related Files

- `src/engine/player/PlayerController.ts` -- all player physics
- `src/engine/physics/index.ts` -- shared AABB helpers used by both player and mob collision
- `src/engine/Engine.ts` -- game loop, fall damage, void death, hunger effects on movement
- `src/engine/entities/Mob.ts` -- mob physics (parallel implementation)
- `src/engine/multiplayer/MultiplayerManager.ts` -- position sync protocol
- `src/engine/multiplayer/RemotePlayerAvatar.ts` -- remote player interpolation
- `src/lib/multiplayer/types.ts` -- `MultiplayerPlayerState` shape
- `src/tests/collision.test.ts` -- collision regression tests for player and mob

## Related Learnings

- `docs/solutions/logic-errors/aabb-max-edge-phantom-block-collision.md` -- the diagnosed defect behind the parity checklist above: AABB scans used an inclusive max edge, so entities that parked flush against a `+X`/`+Z` face kept "overlapping" a zero-width block. Players climbed walls; mobs knocked into walls sank out of the world.
- `docs/solutions/best-practices/voxel-coordinate-math-patterns-2026-04-05.md` -- the wider family of `Math.floor` / modulo semantics pitfalls in voxel coordinate math.
