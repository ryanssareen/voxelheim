---
title: "Player Physics and Movement Architecture"
date: 2026-04-10
category: best-practices
module: engine-player
problem_type: best_practice
component: player-controller
severity: medium
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

Voxelheim uses a ground-based gravity model for the player. The `PlayerController` handles all physics locally each frame: gravity, input-driven movement, AABB collision, and auto-jump. There is no server-authoritative physics -- each client runs its own simulation. Understanding this architecture is essential before modifying movement behavior or adding new movement modes.

## Guidance

### Physics Loop Order

The player update runs once per frame in this exact order within `PlayerController.update()`:

1. Read crouch/sprint state from input
2. Compute camera-relative WASD movement vector, apply speed multiplier
3. Apply gravity to `velocity.y` (only when `onGround === false`)
4. Handle jump input (Space when `onGround` and not crouching)
5. Move and collide: Y axis first, then X, then Z (sub-stepped)
6. Post-collision overlap resolution (safety push-up)
7. Auto-jump check (post-collision, with cooldown)

After `PlayerController.update()` returns, `Engine.gameLoopInner()` handles:

8. Fall damage calculation (compares `fallStartY` to landing position)
9. Void death check (Y < -10)
10. Block interaction, mob combat, hunger, and rendering

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
| AUTO_JUMP_COOLDOWN | 0.35s | Minimum time between auto-jumps |

### Collision Sub-Stepping

The original plan called for single-step axis movement, but this caused clipping at high velocities (knockback from mobs can reach 5 m/s). The current implementation breaks each axis displacement into sub-steps of at most 0.45 blocks. If collision stops the player on any sub-step, remaining sub-steps for that axis are skipped.

### Why Y-Axis Resolves First

Y-axis collision runs before X and Z so that `onGround` is set correctly before lateral collision. This matters for:

- Auto-jump: only triggers when `onGround` is true
- Jump input: only accepted when `onGround` is true
- Gravity: only applies when `onGround` is false

If X/Z resolved first, the player could briefly register as on-ground during a lateral slide, causing phantom jumps.

### Auto-Jump Implementation

Auto-jump allows the player to walk up 1-block steps without pressing Space. It is NOT part of the collision loop -- it runs after all collision is resolved. This prevents the auto-jump from modifying position mid-collision, which previously caused the player to clip inside blocks.

Conditions (all must be true):
- `onGround` is true
- Not crouching
- Cooldown expired (0.35s between auto-jumps)
- A horizontal collision was detected this frame
- `velocity.y <= 0` (not already jumping upward)
- The collided block has two empty blocks above it
- The player has headroom (block above player's head is empty)

### Multiplayer Position Sync

Player position is broadcast every 120ms via `MultiplayerManager.update()`. Only position (x, y, z), rotation (yaw, pitch), and `isCrouching` are synced.

What is NOT synced:
- `velocity` (each client runs its own physics)
- `onGround` (local computation only)
- `isSprinting` (visual only for local player)
- Fall damage state (`fallStartY`, `wasFalling`)

Remote players are rendered via `RemotePlayerAvatar` which interpolates position with a lerp factor of 12/s. This means remote jump arcs appear smoothed rather than parabolic. The visual is acceptable but not physics-accurate.

### Adding New Movement Modes

If adding a flight mode, swimming, or other movement mode:

1. The gravity gate is `if (!this.onGround)` in `PlayerController.update()`. A flight mode would need to bypass this, e.g., by adding an `isFlying` flag and skipping gravity when true.
2. Jump velocity would need to be repurposed or disabled during flight (Space = ascend, Ctrl = descend is the Minecraft creative pattern).
3. Fall damage in `Engine.gameLoopInner()` tracks `wasFalling` and `fallStartY` -- flight mode must reset these when entering flight to avoid damage on landing.
4. Multiplayer sync does not include movement mode. Adding flight would require extending `MultiplayerPlayerState` with an `isFlying` field, or remote players will appear to teleport vertically.
5. Auto-jump should be disabled during flight (it checks `onGround`, which would be false during flight, so it naturally won't trigger).
6. Collision still matters during flight to prevent flying through solid blocks -- the AABB system works regardless of movement mode.

### Mob Physics Parity

Mobs use the same gravity constant (20 m/s^2) and axis-by-axis AABB collision as the player, but with their own `moveAxis()` implementation in `Mob.ts`. They have a different terminal velocity cap (-15 vs -40) and no sub-stepping. If collision behavior changes in `PlayerController`, consider whether `Mob.moveAxis()` needs the same fix.

## Related Files

- `src/engine/player/PlayerController.ts` -- all player physics
- `src/engine/Engine.ts` -- game loop, fall damage, void death, hunger effects on movement
- `src/engine/entities/Mob.ts` -- mob physics (parallel implementation)
- `src/engine/multiplayer/MultiplayerManager.ts` -- position sync protocol
- `src/engine/multiplayer/RemotePlayerAvatar.ts` -- remote player interpolation
- `src/lib/multiplayer/types.ts` -- `MultiplayerPlayerState` shape
