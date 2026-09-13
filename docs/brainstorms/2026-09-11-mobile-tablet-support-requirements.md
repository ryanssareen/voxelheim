---
date: 2026-09-11
topic: mobile-tablet-support
---

# Mobile and Tablet Support

## Summary

Make touch a first-class input path for Voxelheim so a phone or tablet player gets the whole game — walking, mining, building, crafting, chat, multiplayer, creative mode — rather than a reduced version. The control scheme follows the convention touch voxel players already know, and on-screen real estate is spent in proportion to how often an action is used.

---

## Problem Frame

Voxelheim assumes a keyboard, a mouse, and pointer lock. `src/engine/player/PlayerController.ts` asks `input.isKeyDown("KeyW")` directly; `src/engine/Engine.ts` reads mouse buttons for mining, attacking, placing, and eating. None of that is reachable with a finger.

The people this game is actually for are on phones and tablets. For most of them the current build is not "hard to play" — it is unplayable, because the first action the game requires is one their device cannot perform. There is no partial experience to fall back to.

Three deeper gaps sit behind the obvious one. Pointer lock is load-bearing in ways that have nothing to do with aiming: mouse-look reads `movementX/movementY`, which effectively only exists under lock, and pausing is implemented as the pointer-lock-lost callback at `src/engine/Engine.ts:224`. A device that never acquires pointer lock therefore has no way to pause. Inventory is built on mouse semantics with no finger equivalent — shift-click for quick-move, plus a cursor item that tracks a `mousemove` listener; note that no stack-splitting behavior exists on any input path today. And the panel sizing in `src/ui/usePanelMetrics.ts` already floors slots at 20px, roughly half a comfortable touch target, with a comment acknowledging the panel scrolls rather than shrink further.

There is also no seam to add touch at. `src/engine/InputManager.ts` exposes raw device state and most engine consumers read it directly, while several UI components bypass it entirely with their own `window` keydown listeners — chat in `src/ui/GameCanvas.tsx`, debug info in `src/ui/HUD.tsx`, and the minimap toggle in `src/ui/MinimapUI.tsx`. `src/data/keybinds.ts` is display-only: keys are not rebindable today because nothing maps a key to a meaning.

---

## Key Decisions

**Introduce an intent layer before building any touch control.** Gameplay code consumes named intents — move, look, jump, sneak, primary-held, secondary-edge — instead of key codes and mouse buttons. The alternative, synthesizing fake key and button state so `InputManager` looks unchanged, is faster to a playable build but means writing touch handling twice and leaves the eat-gating logic gating a fabricated button. The intent layer also makes rebindable keys and gamepad support cheap afterward, neither of which is possible today.

**Preserve desktop semantics; do not invent a separate touch game.** Where a touch gesture can carry the existing behavior, it does. Eating stays hold-while-not-targeting rather than moving to a hotbar tap, and inventory gestures map onto the existing click and shift-click meanings. Divergence is a cost paid only where touch genuinely cannot express the desktop action.

**Frequency decides on-screen placement.** Mining and placing are the most frequent actions in the game and get no buttons at all — the play surface is the control. Jump and crouch, frequent but discrete, get thumb-sized buttons in the bottom-right corner. Inventory and the recipe book dock into the ends of the hotbar strip, where they cost no play area. Chat, map, and pause are small corner icons. Nothing floats over the play area except the two thumbs.

**No crosshair in touch mode.** The targeted block's outline is the aim indicator. A crosshair is a small mark near the center of a small screen, frequently under the player's own thumb, and it duplicates information the block highlight carries better.

**Touch mode is a runtime state, not a build or a device class.** It arms on the first touch event rather than on user-agent inspection, so touchscreen laptops, hybrids, and tablets with keyboards attached all behave correctly without a detection list to maintain.

---

## Requirements

**Input foundation**

- R1. An intent layer sits between device events and gameplay code. `PlayerController`, `Engine`, and `BlockInteraction` consume named intents rather than key codes or mouse buttons, and so do the React-side keyboard listeners in `GameCanvas` (chat), `HUD` (debug info), `MinimapUI` (minimap toggle), and `KeybindsPopup`.
- R2. Keyboard/mouse and touch are two sources producing the same intent shape. Neither source is privileged, and adding a third later requires no gameplay changes.
- R3. The intent layer expresses the three temporal models the engine already uses: held state (mine, attack, eat), edge events (place, open container), and continuous deltas (look). Mining and attacking share one primary-held intent, resolved by what is targeted.
- R4. Mouse-look no longer depends on pointer lock being held. Look deltas are produced by the active input source.
- R5. Before gameplay call sites are migrated, a desktop input regression suite is recorded against current behavior, mapping key and mouse sequences to resulting intents and player state. That suite passing is the definition of behavior-preserving.

**Touch control scheme**

- R6. Movement uses a joystick that anchors where the player's thumb first lands in the left region of the screen.
- R7. Looking is a drag on the play surface.
- R8. Mining is a hold on the play surface and placing is a tap. Neither has a dedicated on-screen button.
- R9. Jump and crouch are stacked buttons in the bottom-right, sized and placed for a thumb that is simultaneously dragging to look.
- R10. No crosshair renders in touch mode. The block currently targeted renders an outline that is legible against both light and dark block faces.
- R11. Break progress is visible without being obscured by the finger performing the break.
- R12. Moving, looking, and pressing a button work simultaneously as independent touches.
- R13. A first touch session surfaces a one-time dismissible hint for the three unlabeled play-surface gestures: drag to look, hold to mine, tap to place.

**Touch-adapted UI**

- R14. Inventory and the recipe book open from controls docked at the ends of the hotbar strip rather than floating over the play area.
- R15. Hotbar slots are selectable by tap, replacing the `Digit1`–`Digit9` keys.
- R16. Interactive targets in touch mode meet a minimum touch size. The current 20px slot floor is below it.
- R17. Panels respect safe-area insets and are laid out for landscape orientation.
- R18. Portrait has an explicit entry state: a rotate-device prompt shows until landscape is detected, rather than a squeezed landscape layout.
- R19. Inventory item manipulation uses tap to pick up and place, long-press to split a stack, and double-tap to quick-move. Tap and double-tap map onto the existing click and shift-click meanings; long-press-to-split is new behavior that also needs a desktop trigger.
- R20. Inventory touch surfaces suppress native double-tap-zoom and long-press callout behavior so R19's gestures are not intercepted by the browser.
- R21. Slot interaction accepts pointer events rather than mouse events, and the cursor item follows the active touch rather than a `mousemove` listener.

**Parity gaps**

- R22. A pause control exists in touch mode and does not depend on pointer lock.
- R23. Every action currently reachable only by keyboard has a touch affordance or is explicitly listed as deferred. This covers sprint, sneak, creative fly toggle, drop, zoom, minimap toggle, chat, and debug info.
- R24. The first-run controls popup and the walkthrough are input-source aware: the popup presents touch affordances in touch mode, and the walkthrough's step detection observes intents rather than raw `keydown` events.
- R25. Chat opens from a touch control and stays usable while the soft keyboard is shown.
- R26. Eating keeps its desktop trigger — held while not targeting a block — with a longer hold threshold than mining and a visible indicator, so an accidental trigger is apparent and cancellable.

**Device profile**

- R27. Touch mode arms on the first touch event rather than on user-agent inspection.
- R28. The input source can change at runtime without a reload.
- R29. Devices in touch mode resolve their own default render and simulation distance rather than inheriting the current desktop defaults of 8 and 6.

---

## Key Flows

- F1. Mining or attacking
  - **Trigger:** Player holds a finger on the play surface.
  - **Steps:** Hold threshold passes. With a block outlined, break progress accrues against the block's break time and renders in view. With a mob or remote player targeted, the same held intent lands an attack on the existing cooldown. If the finger drags past the look threshold, the gesture converts to a look and progress resets.
  - **Outcome:** Block breaks and drops, damage lands, or progress resets if the target changes or the finger lifts.
  - **Covered by:** R3, R8, R10, R11

- F2. Placing a block
  - **Trigger:** Player taps the play surface without dragging.
  - **Steps:** Tap is classified as a tap rather than a drag; the block adjacent to the targeted face is resolved; the held hotbar item is consumed.
  - **Outcome:** Block is placed, or the tap is rejected when the resulting block would intersect the player.
  - **Covered by:** R8, R10

- F3. Eating
  - **Trigger:** Player holds on the play surface while no block is targeted and the selected item is food.
  - **Steps:** A longer threshold than mining passes; an eating indicator appears; the hold continues to completion.
  - **Outcome:** Food is consumed, or the action cancels when the finger lifts or a block enters the target before completion.
  - **Covered by:** R3, R26

- F4. Moving an item in the inventory
  - **Trigger:** Player opens inventory from the dock control and touches a slot.
  - **Steps:** Tap picks up the stack onto the cursor; a second tap places it. Long-press splits the stack; double-tap quick-moves it to the paired container.
  - **Outcome:** Item ends in the intended slot with the same conservation guarantees as the desktop path.
  - **Covered by:** R14, R19, R20, R21

---

## Acceptance Examples

- AE1. **Covers R8.** Given a block is outlined, when the player touches the play surface and lifts within the tap threshold without moving, then a block is placed and no break progress accrues.
- AE2. **Covers R7, R8.** Given the player is holding to break a block, when the finger moves past the look threshold, then break progress resets and the gesture becomes a look.
- AE3. **Covers R26.** Given the player is holding to break and their aim drifts off the block, when no block is targeted, then mining stops and eating does not begin until the longer eat threshold has passed with food selected.
- AE4. **Covers R26.** Given the eating indicator is showing, when the player lifts their finger before completion, then no food is consumed.
- AE5. **Covers R12.** Given the player is moving with the left thumb and looking with the right, when they press jump, then movement and look both continue uninterrupted.
- AE6. **Covers R27, R28.** Given a laptop with a touchscreen running the game with keyboard and mouse, when the player touches the screen, then touch controls appear without a reload, and the keyboard continues to work.
- AE7. **Covers R22.** Given the game is running in touch mode, when the player taps pause, then the game pauses without requiring pointer lock to have ever been acquired.
- AE8. **Covers R13, R24.** Given a first-time player on a phone with no prior exposure to the game, when they start a world, then they can walk, mine a block, place it, and open their inventory without external instruction, and the walkthrough's movement step completes from a joystick drag.

---

## Success Criteria

- A player who has never used a keyboard on this game can start, walk somewhere, mine a block, place it on the ground, and open their inventory without instruction.
- Every system reachable on desktop is reachable on touch: survival loop, crafting, furnace, chat, multiplayer, creative mode.
- The game holds at least 30 fps on the reference mid-range phone named by the pre-planning measurement.
- Desktop play is unchanged, demonstrated by the R5 regression suite passing after the intent layer lands.

---

## Scope Boundaries

**Deferred for later**

- Gamepad support. The intent layer makes it cheap afterward, but no gamepad source ships here.
- A key-rebinding UI. Same reasoning — `src/data/keybinds.ts` becomes rebindable in principle once intents exist, but the UI is separate work.
- Portrait gameplay. Landscape only; R18 covers the entry state, not a portrait layout.
- Touch-specific multiplayer features.

**Outside this effort**

- A native app wrapper or app-store distribution. This is a browser game and stays one.
- Redesigning the game's visual identity for mobile. The existing pixel-art chrome is retained and re-laid-out, not replaced.

---

## Dependencies and Assumptions

- The intent layer refactor lands before touch controls are built. Nothing is visibly playable on touch until it does.
- The existing responsive math in `src/ui/useHudScale.ts` and `src/ui/usePanelMetrics.ts` is a foundation to extend, not replace. Both are already pure and tested; neither currently handles orientation, safe-area insets, or touch-target minimums.
- Pointer lock remains the desktop path. Removing the dependency means look and pause no longer *require* it, not that desktop stops using it.
- `getMouseButton()` is consume-on-read shared state, and the same physical right button also feeds the held eat gate. Reordering these reads behind an intent layer can silently drop or double-fire a place.
- Touch events on hybrid devices synthesize `mousedown`/`click`, which `InputManager` already listens for including the handler that requests pointer lock. R27 needs explicit suppression of compatibility mouse events in touch mode.
- Assumed but unverified: the current chunk generation and meshing budgets are tuned for desktop and will need separate values under touch mode. The budgets exist in `src/engine/world/constants.ts`; whether they are the binding constraint on a phone is what the pre-planning measurement settles.

---

## Outstanding Questions

**Resolve before planning**

- Measure the current build on a representative mid-range phone. Record frame rate at candidate render and simulation distances, and name both the reference device and the frame-rate floor the Success Criteria bullet means. If the binding constraint turns out to be meshing or GC rather than distance, R29 is the wrong lever and the scope changes.
- Validate the R19 inventory gesture grammar on a real device. The existing prototype validated control placement and thumb reachability only — it did not exercise long-press against panel scrolling, double-tap quick-move, or hold-versus-drag disambiguation under break progress.

**Deferred to planning**

- The exact minimum touch target size, and whether panels scroll or reflow when slots at that size no longer fit.
- Whether the recipe book needs its own dock control or lives as a tab inside the inventory screen.
- Soft-keyboard behavior for chat while the canvas is fullscreen in landscape.
- How the third-person camera cycle (`P`) surfaces on touch, if at all.
- Which of sprint, creative fly toggle, drop, zoom, minimap toggle, and debug info get a touch affordance, and which move to the deferred list. R23 promises one or the other for each, and none of them currently has either.
- Whether jump and crouch briefly interrupt the look-drag with the same thumb, or whether a genuine third contact point is expected. R12 and AE5 require three simultaneous touches, which sits against the two-thumb framing in Key Decisions.
- Whether desktop keeps pointer-lock-lost as an additional pause trigger once R22 decouples pause from lock, and what happens to desktop auto-pause on alt-tab.
- Whether to de-risk the sequencing with a throwaway spike that drives touch through existing key and mouse handling, validating the gesture grammar in the real engine before the intent-layer refactor begins.
- Whether to tier the requirements into a first-playable set and a follow-on set, so the core loop reaches real phone players before the remainder is built.
- Whether the pre-game screens (title, settings, world list, create world) are in scope. The settings sliders drive on `onMouseDown` plus a `window` `mousemove` listener, which a touch drag never emits.

---

## Sources

- `src/engine/InputManager.ts` — the raw device state surface most engine consumers read directly.
- `src/ui/GameCanvas.tsx`, `src/ui/HUD.tsx`, `src/ui/MinimapUI.tsx` — React components that bypass `InputManager` with their own `window` keydown listeners for chat, debug info, and the minimap toggle.
- `src/engine/player/PlayerController.ts`, `src/engine/Engine.ts` — key-code and mouse-button reads at the call site.
- `src/engine/player/BlockInteraction.ts` — break as held state and place as an edge.
- `src/engine/Engine.ts` — attack and eating, both implemented inline in the update loop rather than in `BlockInteraction`.
- `src/ui/useSlotInteractions.ts` — mouse-event slot handlers and shift-click quick-move.
- `src/ui/ItemIcon.tsx` — the cursor-item overlay and its `mousemove` listener, duplicated inline in `src/ui/CraftingTableUI.tsx` and `src/ui/FurnaceUI.tsx`.
- `src/ui/KeybindsPopup.tsx`, `src/ui/Walkthrough.tsx` — first-run onboarding, both keyboard-bound today.
- `src/ui/useHudScale.ts`, `src/ui/usePanelMetrics.ts` — existing viewport-responsive sizing and the 20px slot floor.
- `src/store/useSettingsStore.ts`, `src/engine/world/constants.ts` — render distance, simulation distance, and chunk budgets.
- Control-layout prototype used to validate placement and thumb reach in hand: https://claude.ai/code/artifact/f7314dcc-4824-4074-b12c-687094d1002b
