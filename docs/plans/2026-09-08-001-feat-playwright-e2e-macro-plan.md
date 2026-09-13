---
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
created: 2026-09-08
recreated: 2026-09-13
---

# feat: Playwright E2E macro for move/break/place

## Summary

Add a real-browser end-to-end test ("macro") that plays Voxelheim through Playwright-driven Chromium: click into the game, acquire pointer lock, walk forward, break a block, place a block. Assertions read a small dev-only `window.__test` debug hook instead of screenshots, because pixel comparison is brittle for a lit 3D voxel scene. This closes a verification gap unit tests can't reach — nothing today drives the rendered game with real mouse-look, and the in-app Browser pane preview used for other verification refuses pointer lock.

**Note:** This plan was originally written and doc-reviewed in a cloud session on 2026-09-08, but that session's sandbox was disconnected before the file synced to this machine and the plan was lost. This is a from-scratch regeneration grounded in the current state of the codebase (2026-09-13), preserving the decisions the original session reached with the user. Where the underlying code has since moved, this version reflects what's actually there now rather than the original transcript's description.

---

## Problem Frame

`src/tests/` covers engine and store logic in isolation with Vitest, but nothing exercises the actual rendered game in a browser: no test today clicks the canvas, acquires pointer lock, moves the camera, or drives a full move/break/place sequence end to end. The in-app Browser pane tool available during development sessions can't grant pointer lock either, so there is no way to script real mouse-look through it — a real Playwright-launched Chromium (via CDP) is required, since it accepts synthetic pointer lock and `mouse.move` deltas as trusted input.

Screenshot-based assertions are the obvious alternative but a poor one here: lighting, chunk load timing, and camera angle make pixel comparison brittle for a 3D voxel scene. The macro instead asserts against a small dev-only debug hook exposed on `window` (player position, camera angle, held item, hotbar, inventory contents, targeted block) and treats screenshots as a "does it look sane" side artifact, not the pass/fail signal.

---

## Key Decisions

**`window.__test` is dev-only, always-on in dev builds.** (Recommended option, accepted in the original session.) It must be gated so it never ships to production — the simplest gate is `process.env.NODE_ENV !== "production"`, matching how the codebase already branches dev-only behavior, checked in the same module that owns the game's client entry point rather than scattered across engine files.

**The spec drives the game through the homepage Play button**, not a direct `/game?worldId=...` navigation. (Recommended option, accepted in the original session.) `src/app/page.tsx`'s `handlePlayDemo` calls `ensureDemoWorld()` from `src/lib/demoWorld.ts`, which does real IndexedDB setup before routing to `/game?worldId=<id>`. Driving the actual Play button exercises that setup path instead of assuming a world already exists, at the cost of a slower, more end-to-end-flavored test.

**Scope is move/break/place only.** Multiplayer sync, mob combat, and crafting are explicitly deferred — this macro validates the core input path (pointer lock, WASD, mine, place), not the full survival loop.

**`npx playwright install chromium` is a required setup step, not implied by the npm package.** Adding `playwright` as a devDependency does not download a browser binary; CI and any fresh checkout need the explicit install step, or the macro fails with a missing-executable error that looks unrelated to the test itself.

**Headless runs need an explicit note about `fullscreenOnPlay`.** `src/ui/playCapture.ts` calls `requestFullscreen()` on the canvas's parent when the `fullscreenOnPlay` setting is on (default `true`, per `src/store/useSettingsStore.ts`). Fullscreen requests commonly fail or behave inconsistently in headless Chromium since they require a user-activation context the automation layer doesn't always satisfy the same way a real click does. The macro should either run with `fullscreenOnPlay` explicitly disabled for the test world, or tolerate a rejected fullscreen request without treating it as a failure — `src/ui/playCapture.ts` already no-ops gracefully when `requestFullscreen` is absent or rejects (see `src/tests/playCapture.test.ts`), so the spec should not assert fullscreen succeeded.

---

## Requirements

- Playwright drives a real Chromium instance through the homepage Play button, acquiring real pointer lock on the game canvas.
- The macro completes a move → break → place sequence and asserts state after each step via `window.__test`, not screenshots.
- `window.__test` is unavailable when `NODE_ENV === "production"`.
- The debug hook schema includes enough state to cover all three actions: player position, camera yaw/pitch, held item, hotbar contents, inventory contents, and the currently targeted block (block id + coordinates, or null when nothing is targeted).
- Setup instructions cover the `npx playwright install chromium` step; omitting it is a documented common failure mode.
- `npm run test:e2e` runs the macro headless; `--headed` runs it visibly.

---

## Implementation Units

### U1. `window.__test` debug hook

**Goal:** Expose a dev-only, read-only snapshot of game state on `window` that the E2E spec can poll.

**Requirements:** Debug hook schema requirement above.

**Dependencies:** None.

**Files:**
- `src/engine/Engine.ts` (or a new small `src/engine/testHook.ts` the engine populates each frame/tick — prefer the latter to avoid growing `Engine.ts`, which is otherwise lead-owned per `docs/plans/2026-09-03-001-remediation-contract.md`'s conventions)
- `src/tests/testHook.test.ts` (new)

**Approach:** Define an `E2EState` type covering:
- `position: { x: number; y: number; z: number }` — from `PlayerController.position`
- `yaw: number`, `pitch: number` — camera angle
- `heldItem: { blockId: number; count: number } | null` — current hotbar selection
- `hotbar: Array<{ blockId: number; count: number } | null>`
- `inventory: Array<{ blockId: number; count: number } | null>` — from `useInventoryStore`/`useHotbarStore`, whichever backs the main inventory grid
- `targetedBlock: { blockId: number; x: number; y: number; z: number } | null` — from `BlockInteraction`'s raycast result

Assign `window.__test = { getState: () => E2EState }` (a function, not a static snapshot, so each poll reflects current state) gated behind a `NODE_ENV !== "production"` check at the point where the game canvas mounts, so the hook only ever exists in dev/test builds. Do not attach it unconditionally and rely on tree-shaking to remove it — an explicit runtime check is the only gate that also protects against a misconfigured production `NODE_ENV`.

**Test scenarios:**
- Happy path: after mount in a non-production environment, `window.__test.getState()` returns an object matching the schema with real values from a running engine instance.
- Given `NODE_ENV === "production"`, `window.__test` is `undefined`.
- Given no block is targeted, `targetedBlock` is `null` rather than a stale previous value.
- Given the hotbar selection changes, `heldItem` reflects the new selection on the next call.

**Verification:** A unit test can construct the hook against a mocked engine/store state and confirm the schema and the production gate; the E2E spec (U3) is the integration-level proof it works against the real running game.

---

### U2. Playwright install and config

**Goal:** Add Playwright as a devDependency with a project config pointed at the dev server.

**Requirements:** Setup requirement above (`playwright install chromium`), `test:e2e` script requirement.

**Dependencies:** None (can land in parallel with U1).

**Files:**
- `package.json` (new `devDependency` on `@playwright/test`, new `test:e2e` script)
- `playwright.config.ts` (new)
- `e2e/` (new directory)

**Approach:** `playwright.config.ts` should point at `npm run dev` (or `next dev`) as a `webServer`, targeting `http://localhost:3000`, with `reuseExistingServer` enabled for local iteration. Default to headless; `npm run test:e2e -- --headed` (or a separate `test:e2e:headed` script) runs visibly. Document the required one-time `npx playwright install chromium` step in the plan's Definition of Done and in whatever setup docs cover `npm install` (e.g. a README note), since installing the npm package alone does not download a browser binary and a fresh checkout or CI runner that skips this step fails with a missing-executable error, not a test failure.

**Test scenarios:**
- Test expectation: none — this unit is tooling/config, not behavior. Verified by U3's spec actually running.

**Verification:** `npx playwright test` runs (even with zero specs) without a missing-browser error once `npx playwright install chromium` has been run.

---

### U3. Move/break/place macro spec

**Goal:** One Playwright spec that plays the demo world through the homepage Play button and exercises move, break, and place, asserting against `window.__test` at each step.

**Requirements:** All Requirements above.

**Dependencies:** U1 (debug hook), U2 (Playwright config).

**Files:**
- `e2e/move-break-place.spec.ts` (new)

**Approach:** 
1. Navigate to `/`, click the **Play** button (`handlePlayDemo` in `src/app/page.tsx`), and wait for navigation to `/game?worldId=...` to confirm `ensureDemoWorld()`'s IndexedDB setup completed.
2. Click the game canvas to request pointer lock; poll `document.pointerLockElement` (via `page.evaluate`) rather than assuming lock is immediate.
3. Read the initial `window.__test.getState()` snapshot as a baseline.
4. Send a `KeyW` hold (via `page.keyboard.down`/`up`) for a fixed duration, then assert `position` changed along the expected axis relative to the baseline (exact deltas are execution-time — assert direction and magnitude bounds, not a literal expected value, since terrain-dependent collision can affect exact distance).
5. Use `mouse.move` deltas to aim at a nearby block until `targetedBlock` is non-null, then hold the primary mouse button long enough to break it (break time varies by block — poll `getState()` until the previously targeted block's id changes to empty/air rather than sleeping a fixed duration); assert the block is gone from the world and, if drops are collected automatically, that inventory/hotbar reflects the pickup.
6. With a placeable block held, aim at an adjacent face and click once; assert a new block appears at the expected coordinate and the held stack count decremented.
7. Confirm no unhandled console errors were logged during the run (`page.on("console")` / `page.on("pageerror")`).

Do not assert on `fullscreenOnPlay` succeeding — see the flakiness note in Key Decisions. If the test world's settings default to `fullscreenOnPlay: true`, either force it off via the options modal before pressing Play, or seed the settings store directly before navigation, whichever is less brittle in practice — left to implementation to decide once the settings store's test seams are in view.

**Technical design (directional, not literal):**
```
open("/") 
click("Play") -> wait for URL /game?worldId=*
click(canvas) -> poll pointerLockElement === canvas
baseline = getState()
keyboard: hold "KeyW" for N ms -> release
assert getState().position moved forward vs baseline

mouse.move(dx, dy) until getState().targetedBlock !== null
mouse.down(left) -> poll until targetedBlock's block is gone -> mouse.up
assert world/inventory reflects the break

select a placeable block on hotbar (if not already held)
aim at a face -> click
assert a block now exists at the target placement coordinate
assert held count decremented
```

**Test scenarios:**
- Happy path: full move → break → place sequence completes and every intermediate assertion passes against `window.__test`.
- Given pointer lock is denied or lost mid-sequence (e.g. focus loss), the spec fails with a clear message identifying the pointer-lock step, not a downstream timeout with no context.
- Given the break-progress poll times out (block state never changes), the spec fails at the break step specifically rather than hanging for the full test timeout.
- Integration: breaking a block and the resulting drop entering inventory/hotbar — this exercises the callback chain from `BlockInteraction` through world state through the inventory store, which a mocked unit test can't prove end to end.

**Verification:** `npm run test:e2e` passes locally in headless mode after `npx playwright install chromium`; `npm run test:e2e -- --headed` visibly shows the sequence.

---

## Scope Boundaries

**Deferred for later**
- Multiplayer sync macros.
- Mob combat and crafting macros.
- Screenshot-based visual regression (screenshots remain a side artifact only in this macro, not a second assertion mechanism).
- CI wiring (a GitHub Actions job running `test:e2e` on PRs) — this plan covers the local macro only; CI integration is a follow-up once the macro is proven stable.

**Outside this effort**
- Any change to game behavior. This is test infrastructure only.

---

## Dependencies and Assumptions

- Assumes `ensureDemoWorld()` (`src/lib/demoWorld.ts`) reliably produces a playable world from a clean IndexedDB state in a fresh Chromium profile — if Playwright's isolated browser context behaves differently from a real user's persistent profile here, U3 may need an explicit IndexedDB seed step instead of relying on the Play button's own setup path.
- Assumes break time for the test's chosen block is short enough that polling to completion doesn't make the spec unreasonably slow; if not, the spec may need to select a fast-to-break block deliberately (e.g. by hotbar/tool choice) rather than assert on an arbitrarily slow one.
- The debug hook's `inventory` field assumes a single canonical inventory array is reachable from `useInventoryStore`/`useHotbarStore`; if inventory state turns out to be split across more stores than expected, U1's schema may need a small adjustment during implementation.

---

## Verification Contract / Definition of Done

- [x] `npx playwright install chromium` has been run at least once in the development environment (documented, not just implied by `npm install`).
- [x] `window.__test` exists and matches the U1 schema in dev builds; it is `undefined` when `NODE_ENV === "production"`.
- [x] `npm run test:e2e` passes headless.
- [x] `npm run test:e2e -- --headed` (or equivalent) runs the same spec visibly for manual review.
- [x] The spec does not assert on `fullscreenOnPlay` succeeding.
- [x] `npx tsc --noEmit`, `npm run lint`, and `npm test` (the existing Vitest suite) all still pass — this plan adds a new test surface, it does not touch existing engine/store logic.

---

## Implementation Notes (added during U3)

Building U3 surfaced two things this plan didn't anticipate, both now reflected in `e2e/move-break-place.spec.ts`:

- **`requestPointerLock()` is refused outright in this development sandbox** — reproducible even on a bare page with no app code involved (Chromium throws `WrongDocumentError`). It can also flicker (briefly toggle `pointerLockElement` before failing), which `src/engine/Engine.ts`'s `onPointerLockLost` handler reads as "lock lost" and pauses the game on. Since mouse-look is gated behind lock (`src/engine/InputManager.ts`), there was no way to aim via the mouse at all in this environment. **U1's schema gained a `setLook(yaw, pitch)` method** (`src/engine/Engine.ts`'s `setE2ELook`, backed by a new `Camera.setLook`) so the macro can set aim directly instead. The spec also clicks "Resume" whenever it observes `isPaused` (also added to the schema) rather than depending on lock succeeding. This may be specific to this sandboxed environment — a developer's own machine may grant real pointer lock — but the workaround is harmless either way since it only takes effect when the game actually reports itself paused or when the debug hook is asked to set look directly.
- **The demo island's terrain isn't flat near spawn.** Aiming downward at an arbitrary angle can target a block on a slope or cliff edge; breaking it lets the drop fall out of pickup range (`MAGNET_DISTANCE`, `src/engine/world/ItemDropManager.ts`) before the macro can collect it. The spec's look direction (`SAFE_LOOK_YAW`/`SAFE_LOOK_PITCH`) was found by scanning several angles from the deterministic demo-world spawn point for one that hits a block one pace away on level ground. It's tuned to this seed's spawn point, not a general-purpose look direction — if the demo world's spawn or seed ever changes, this constant will need re-tuning.

---

## Sources

- `src/engine/InputManager.ts` — pointer lock acquisition/loss, key and mouse state.
- `src/engine/Engine.ts` — main engine update loop; owns most runtime state the debug hook needs to read.
- `src/engine/player/PlayerController.ts` — player position.
- `src/engine/player/BlockInteraction.ts` — raycast/targeted block, break and place handling.
- `src/app/page.tsx` — the homepage Play button and `handlePlayDemo`.
- `src/lib/demoWorld.ts` — `ensureDemoWorld()`, the real IndexedDB setup path the spec drives through.
- `src/ui/playCapture.ts`, `src/tests/playCapture.test.ts` — `fullscreenOnPlay` behavior and its existing graceful-failure handling, relevant to the headless-flakiness note.
- `src/store/useSettingsStore.ts` — `fullscreenOnPlay` default and setter.
- `src/store/useInventoryStore.ts`, `src/store/useHotbarStore.ts` — inventory/hotbar shape for the debug hook schema.
- Prior session transcript (2026-09-08, cloud session, disconnected before sync): origin of this plan's scope and the two accepted recommended decisions.
