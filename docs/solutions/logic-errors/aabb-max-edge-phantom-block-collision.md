---
title: "Voxel AABB Scans Used an Inclusive Max Edge, Making Flush Entities Climb and Sink"
date: 2026-07-31
category: logic-errors
module: engine-physics
problem_type: logic_error
component: physics-collision
symptoms:
  - "Player climbs a wall one block per frame and walks over the top when travelling +X or +Z"
  - "Player teleported ~0.8 blocks sideways on the cross axis after touching a block face"
  - "Mobs knocked into a wall fall under the world and die within ~34 frames (~0.5s)"
  - "Collision only misbehaves in +X/+Z travel, so it looked key-dependent (W fine, S/A/D broken)"
  - "Resting mobs had onGround cleared every frame, causing gravity and landing jitter"
root_cause: logic_error
resolution_type: code_fix
severity: high
related_components:
  - "PlayerController"
  - "Mob"
  - "Engine"
  - "maxBlock"
tags:
  - aabb-collision
  - voxel-physics
  - off-by-one
  - half-open-range
  - player-controller
  - mob-physics
  - zero-delta-guard
  - floor-semantics
---

# Voxel AABB Scans Used an Inclusive Max Edge, Making Flush Entities Climb and Sink

## Problem

Every AABB-vs-voxel scan in the engine derived its block range as `Math.floor(min) .. Math.floor(max)`, which keeps a block in range when an entity's max edge lands exactly on that block's boundary — precisely the state collision resolution creates when it snaps an entity flush against a `+X` or `+Z` face. Acting on that zero-width "phantom" overlap, players ratcheted up walls a block per frame and walked over the top, and mobs knocked into a wall sank out of the world and void-died within half a second.

## Symptoms

- User's report, player side: "Ramming myself into a block with w causes no collision problems but when i ram myself into a block I'm not facing at by using w,s,d, it does some weird stuff and doesn't collide properly."
- User's report, mob side: "When I hit mobs, they instantly teleport to under the world."
- Walking into a wall while travelling `+X`/`+Z`: the player is shoved ~0.8 blocks along the *untouched* cross axis, then `position.y` increments by one per frame until they are standing on top of the wall.
- Travelling `-X`/`-Z` into the same wall behaves perfectly — the player parks flush and stays there.
- A mob hit by the player near a wall drops ~2 blocks per frame and disappears; `Mob.dead` is set by the void check at `src/engine/entities/Mob.ts:153` (`if (this.position.y < 0)`).
- Resting mobs jitter between grounded and airborne states even without a wall involved.

## What Didn't Work

There were no failed fix attempts here — the first hypothesis was the root cause and the first fix held. What is worth recording is what made the bug hard to *see*:

1. **The symptom presented as key-dependent, but the bug is direction-of-travel-dependent.** "W is fine, S/A/D is weird" is a report about keys; the actual predicate is the sign of world-space travel. Which key misbehaves depends entirely on where the camera happens to be pointing, so the report is reproducible-but-inconsistent and does not point at the collision range at all. The fix only became obvious after restating the repro in world coordinates.

2. **`resolveOverlap` already looks like it handles point-touching.** `src/engine/player/PlayerController.ts:297-298` carries the comment "pen > EPS filters out point-touching (zero-area overlap) at boundaries", and it does — but only for the *one* candidate on the touching axis. The block's three sibling candidates (built at lines 285-295) still report large positive penetrations, because nothing ever verified that the AABB genuinely overlaps the block on all three axes. Min-penetration then picks one of the siblings and teleports the player. The guard reads as complete and is not.

3. **The physics doc already warned about this class of divergence and nobody acted on it.** Its "Mob Physics Parity" section noted that mobs have their own `moveAxis()` and advised: "If collision behavior changes in `PlayerController`, consider whether `Mob.moveAxis()` needs the same fix." That is exactly how bug 2 survived — advisory prose in a doc is not a mechanism. That section has since been rewritten into an explicit checklist; see `docs/solutions/best-practices/player-physics-movement-architecture-2026-04-10.md`.

## Solution

Committed directly to `main` as `7bcf27c` (no PR); confirmed reachable from `HEAD` via `git merge-base --is-ancestor 7bcf27c HEAD`.

`src/engine/physics/index.ts` was a one-line `// TODO: implement` stub before the fix. It now holds the single shared helper the whole engine scans through:

```typescript
// src/engine/physics/index.ts:16-20
/** Highest block index an AABB edge overlaps with non-zero width. */
export function maxBlock(max: number): number {
  const floored = Math.floor(max);
  return floored === max ? floored - 1 : floored;
}
```

Applied to every AABB **max** edge. Min edges are left as `Math.floor(min)` — on an exact boundary that correctly yields the block the AABB genuinely starts inside.

```typescript
// BEFORE — src/engine/entities/Mob.ts (git show 7bcf27c^), inclusive on both ends
for (let bx = Math.floor(minX); bx <= Math.floor(maxX); bx++) {
  for (let by = Math.floor(minY); by <= Math.floor(maxY); by++) {
    for (let bz = Math.floor(minZ); bz <= Math.floor(maxZ); bz++) {

// AFTER — src/engine/entities/Mob.ts:821-827, half-open on the max edge
const bMaxX = maxBlock(maxX);
const bMaxY = maxBlock(maxY);
const bMaxZ = maxBlock(maxZ);

for (let bx = Math.floor(minX); bx <= bMaxX; bx++) {
  for (let by = Math.floor(minY); by <= bMaxY; by++) {
    for (let bz = Math.floor(minZ); bz <= bMaxZ; bz++) {
```

Scan sites converted:

| File | Sites |
|---|---|
| `src/engine/player/PlayerController.ts` | ground probe in `update` (156, 158), `hasGroundSupport` (205, 207), `resolveOverlap` main scan (265, 267, 269), `resolveOverlap` foot-safety scan (319, 321), `moveAxis` (354, 356, 358) |
| `src/engine/entities/Mob.ts` | `moveAxis` (821-823) |
| `src/engine/Engine.ts` | paused / chat-composing gravity path (792, 794, 796) |

Bug 2 needed a second, independent fix: `Mob.moveAxis` never had the zero-delta guard that `PlayerController.moveAxis` has at line 341.

```typescript
// AFTER — src/engine/entities/Mob.ts:805-808
// A zero-length move can't collide with anything. Without this guard the
// `delta < 0` checks below treat it as upward motion and resolve it as a
// ceiling hit, dropping the mob by its own height every frame.
if (delta === 0) return;
```

## Why This Works

Collision resolution snaps an entity flush against the face it hit, and the two directions are not symmetric:

- A **`+X`** hit sets `position.x = bx - HALF_WIDTH` (`PlayerController.ts:380`), so `maxX === bx` **exactly**. `Math.floor(bx) === bx`, so the wall block stayed in range on every subsequent frame despite a zero-width overlap.
- A **`-X`** hit sets `position.x = bx + 1 + HALF_WIDTH` (`PlayerController.ts:378`), so `minX === bx + 1`, which floors clear of the block.

This is exact arithmetic, not float noise: `10 - 0.3 + 0.3 === 10` is exactly true, and the same holds for the mob half-widths and for `bx` values of 5, 10, 12, 100, and -3. That is why the failure was 100% reproducible in `+X`/`+Z` and 0% in `-X`/`-Z`.

The player failure then compounded in two stages. `resolveOverlap` iterated the phantom block; the `pen > EPS` check killed the zero candidate on the touching axis but the sibling axes still scored large penetrations, so min-pen fired and moved the player ~0.8 blocks sideways. The foot-safety scan at `PlayerController.ts:317-331` used the same inclusive range, so `footMaxX === bx` pulled the wall column into the foot scan; a solid block at foot level triggers `this.position.y = footY + 1` (line 325), lifting the player one block. Repeat per frame and the player escalators over the wall.

The mob failure is the phantom block plus the missing guard. `takeDamage` applies knockback (`Mob.ts:641-644`: a normalized away-from-attacker direction scaled by 3 and added to `velocity.x`/`velocity.z`, then `velocity.y = 2` and `onGround = false`), the mob is thrown into the wall, `+X` collision parks it flush, it lands, and `velocity.y` becomes 0. The next frame still calls `moveAxis("y", 0)`, which finds the phantom wall block; because `delta < 0` is **false** for `delta === 0`, it takes the ceiling branch `this.position.y = by - h` (`Mob.ts:836`) and drops the mob by its own height. Now embedded in terrain, alternating zero-delta and negative-delta Y moves march it down until `position.y < 0` trips the void check. A verbatim replica void-died the mob 34 frames (~0.5s) after wall contact — "instantly teleport to under the world". The same missing guard also made `if (axis === "y" && delta <= 0) this.onGround = false;` (`Mob.ts:853`) fire on a resting mob every frame, which is the grounded/airborne jitter.

`maxBlock` fixes both by making the max edge half-open. Crucially it does not weaken genuine collision: for a 0.05-deep overlap, `maxBlock(10.05) === 10` — the block is still scanned. Only the exactly-flush case is dropped, and `-X`/`-Z` behavior is byte-identical because those paths never produce an integral max edge.

## Prevention

**Collision had zero test coverage before this fix. That is the whole reason it shipped.** `src/tests/collision.test.ts` now carries 9 tests; the ones that matter are the ones that assert on *every frame*, not just the final state — the wall-climb is invisible in an end-state assertion because the player does eventually stop somewhere.

Assert the invariant per frame, and test all four horizontal directions, not just the one from the bug report:

```typescript
// src/tests/collision.test.ts (abridged)
const cases = [
  { name: "travelling +X", axis: "x" as const, start: 8,  dir:  1, expected: 9.7  },
  { name: "travelling -X", axis: "x" as const, start: 13, dir: -1, expected: 11.3 },
  { name: "travelling +Z", axis: "z" as const, start: 8,  dir:  1, expected: 9.7  },
  { name: "travelling -Z", axis: "z" as const, start: 13, dir: -1, expected: 11.3 },
];

for (let frame = 0; frame < 180; frame++) {
  player.update(1 / 60, keys, camera, getBlock, registry);
  // The player must never leave the ground — walking into a wall is not a climb.
  expect(player.position.y, `frame ${frame}: player left the ground`).toBe(GROUND_TOP);
}
expect(player.position[c.axis]).toBeCloseTo(c.expected, 6);
expect(player.position[crossAxis]).toBeCloseTo(startCross, 6); // no sideways teleport
```

Pin the exact-arithmetic assumption directly, so a future half-width change that breaks the flush identity fails loudly rather than silently changing behavior:

```typescript
it("matches the flush edge left behind by a +X collision snap", () => {
  const halfWidth = 0.3;
  const x = 10 - halfWidth;
  expect(x + halfWidth).toBe(10);           // exactly flush, not merely close
  expect(maxBlock(x + halfWidth)).toBe(9);
});
```

Tightening a collision range can break the *rescue* path, so cover that too — a player genuinely embedded in a block must still be ejected:

```typescript
const player = new PlayerController(10.5, GROUND_TOP, 20.5);
player.update(1 / 60, heldKeys(), facing(1, 0), flatWorldWithWall("x", 10), registry);
const stillInsideWall =
  player.position.x > 10 && player.position.x < 11 && player.position.y < 68;
expect(stillInsideWall, "player is still embedded in the wall").toBe(false);
```

Further guardrails:

- **Any new AABB voxel scan must import `maxBlock` from `@engine/physics` for its max edges.** Grep before adding a loop: `grep -rn "<= Math.floor(max" src/` should return nothing. A raw `Math.floor(max)` upper bound is now a bug by definition.
- **Test mobs alongside the player whenever collision changes.** The parity warning in the physics doc existed and was ignored; a mob test in the same file is the mechanism the prose was not. Harness notes: `PlayerController` unit-tests cleanly in the `node` vitest environment with plain object stubs for `InputManager`, `Camera`, and `BlockRegistry`. `Mob` needs only a tiny `document.createElement` stub because `takeDamage` renders a damage-number canvas, and a **pig** is the right mob to test with — passive mobs skip `createNameTag()`, which also needs canvas. No jsdom dependency was required.
- **Duplicated physics is where fixes go to die.** The `Engine.ts` paused-gravity scan was a *third* copy of the same loop and nobody knew it existed. Prefer extracting the shared primitive (as `maxBlock` now is) over documenting that N copies should be kept in sync.

## Related Issues

- `docs/solutions/best-practices/player-physics-movement-architecture-2026-04-10.md` — the surrounding architecture: physics loop order, constants, sub-stepping, multiplayer sync. Its "Mob Physics Parity" advisory is what this bug proved out: the parity gap it warned about is exactly how the mob half of this defect survived. That doc was corrected alongside this learning — it had drifted badly, describing an auto-jump system that no longer exists in `src/` and treating flight mode as hypothetical after it had shipped.
- `docs/solutions/best-practices/voxel-coordinate-math-patterns-2026-04-05.md` — related floor-semantics pitfalls in this codebase (negative modulo, chunk-coordinate flooring). `maxBlock()` belongs to the same family: a coordinate helper that exists because the obvious `Math.floor` is wrong at an exact block boundary.
- **Residual, not fixed:** the paused-gravity scan in `src/engine/Engine.ts:797-811` does not `break`/`return` on the first solid hit, so the last block scanned wins rather than the nearest. It is guarded by `if (dy !== 0)` (line 787) so the zero-delta bug cannot fire there, and `maxBlock` removes the phantom-block bug, but the last-block-wins behavior remains. Separately, `moveAxis` in both `PlayerController` and `Mob` returns on the *first* solid block found scanning ascending — correct for negative deltas, but for positive deltas the nearest face is the *highest* index, so an already-embedded entity can be snapped to the far column.
- **Dead state to clean up:** `hadHorizCollision` in `PlayerController.ts` (declared 29, reset 144, set 383 and 392) is never read anywhere in `src/`. It is the vestige of the removed auto-jump system.
- **Multiplayer note (supplementary):** mob state is not synced — each client simulates mobs locally — so this mob bug fired independently per client, and players in one session would each have seen mobs vanish at different moments.
- No GitHub issues exist on this repository (`gh issue list --state all` returns empty), so there is nothing to link.
- **Verification.** `npm test`, `npx tsc --noEmit`, and `npm run lint` (0 errors; 11 pre-existing warnings, none introduced) all pass, both at the fix commit and again after the unrelated `lib/storage` refactor landed on top of it. The engine also boots cleanly in the dev server with no console errors, confirming the new `@engine/physics` module resolves at runtime under webpack as well as under vitest. The in-game collision behavior itself was verified through the regression tests rather than by driving the browser: reproducing it live needs pointer lock plus sustained directional input against a specific world-space axis, which the tests cover far more precisely.
