---
title: "feat: Add UI layer and game page"
type: feat
status: completed
date: 2026-04-05
---

# feat: Add UI layer and game page

## Overview

Build the React UI layer (HUD, hotbar, pause menu, loading screen) and wire the engine into Next.js App Router at `/game`. Update the landing page with a play button. After this phase, the game runs in the browser.

## Problem Frame

The engine is fully functional (terrain, rendering, physics, interaction) but has no browser entry point and no UI overlay. Players need: a canvas to render into, a HUD showing crosshair and shard count, a hotbar for block selection, a pause menu, a loading screen, and a landing page to start the game.

## Requirements Trace

- R1. GameCanvas renders a full-viewport canvas, creates Engine on click, disposes on unmount
- R2. useEngine hook manages Engine lifecycle with loading/ready/error states
- R3. HUD shows crosshair (centered +), shard counter (top-right), completion overlay, and F3 debug panel
- R4. HotbarUI shows 8 color-coded slots with selection indicator and block name
- R5. PauseMenu shows on ESC/pointer lock exit with Resume and Quit options
- R6. LoadingScreen shows while engine initializes with animated text
- R7. Game page at `/game` renders GameCanvas full-viewport
- R8. Landing page updated with title, subtitle, and Play button linking to `/game`
- R9. All components use `'use client'` directive — no SSR of Three.js code
- R10. `npm run build` succeeds (SSR compatibility verified)

## Scope Boundaries

- No settings menu or keybinding configuration
- No mobile/touch controls
- No responsive breakpoints — desktop viewport only
- No sound UI or volume controls
- No save/load UI

## Context & Research

### Relevant Code and Patterns

- `src/engine/Engine.ts` — `init()`, `dispose()`, constructor takes HTMLCanvasElement
- `src/store/useGameStore.ts` — `shardsCollected`, `shardsTotal`, `isComplete`, `isPaused`, `setPaused()`
- `src/store/useHotbarStore.ts` — `selectedIndex`, `slots`, `select()`, `scrollUp()`, `scrollDown()`, `getSelectedBlockId()`
- `src/engine/renderer/Renderer.ts` — `resize(w, h)`, `getCamera()`
- `src/data/blocks.ts` — `BLOCK_ID` for block name mapping in hotbar
- `src/app/layout.tsx` — existing Next.js App Router layout
- `src/app/page.tsx` — existing default Next.js page (will be replaced)

### Institutional Learnings

- COOP/COEP headers configured for `/game(.*)` routes via vercel.json regex (see `docs/solutions/best-practices/vercel-headers-nested-route-matching-2026-04-05.md`)

## Key Technical Decisions

- **Dynamic import for Engine**: Use `next/dynamic` or lazy `import()` inside useEffect to prevent Three.js from being imported during SSR. The `'use client'` directive alone is not sufficient — Three.js accesses `window` at module load time.
- **Zustand selectors for UI components**: Use `useGameStore(state => state.shardsCollected)` pattern for granular re-renders — prevents full HUD re-render on every state change.
- **Pointer-events: none on overlays**: HUD, hotbar, and loading screen don't intercept canvas mouse events. Pause menu does (it has buttons).
- **CSS animations over JS animations**: Pulse on shard collection, fade-in on completion, pulsing dots on loading — all pure CSS for zero runtime overhead.
- **Pause via pointer lock exit**: When pointer lock is lost (ESC), set `isPaused = true`. Resume button re-requests pointer lock. Engine game loop skips updates when paused (already implemented).

## Open Questions

### Resolved During Planning

- **How does pause state sync with pointer lock?** InputManager already tracks pointer lock state. Engine needs to call `useGameStore.getState().setPaused(true)` when pointer lock exits. This requires a small addition to InputManager or Engine.
- **How does the completion overlay dismiss?** After 4 seconds, show "Press ESC to continue" text. ESC exits pointer lock → shows pause menu where "Quit to Menu" navigates to `/`.
- **Block colors for hotbar?** Hardcoded in HotbarUI to match atlas colors: grass=#4CAF50, dirt=#8D6E63, stone=#9E9E9E, sand=#FDD835, log=#5D4037, leaves=#2E7D32, crystal=#00E5FF, air=transparent.

### Deferred to Implementation

- **Exact Tailwind classes**: Implementation chooses specific utility classes for layout/spacing.
- **F3 debug panel data source**: Engine needs to expose FPS, player position, chunk count. Exact interface deferred — may use a simple callback or expose values on Engine.
- **Dynamic import syntax**: May need `import('three')` gated behind `typeof window !== 'undefined'` check, or the entire Engine import wrapped in dynamic. Implementation tests what works with the project's Next.js/Turbopack version.

## Implementation Units

- [ ] **Unit 1: useEngine hook**

  **Goal:** Manage Engine lifecycle with loading/ready/error states, SSR-safe

  **Requirements:** R2, R9

  **Dependencies:** None

  **Files:**
  - Create: `src/hooks/useEngine.ts`

  **Approach:**
  - Accept a canvas RefObject, return `{ isLoading, isReady, error }`
  - Use `useEffect` with dynamic `import()` of Engine class to avoid SSR
  - Create Engine, call `init()`, track state transitions
  - Dispose on unmount via cleanup function
  - Handle init errors gracefully (set error state)

  **Patterns to follow:**
  - Standard React hook pattern with useEffect + useRef

  **Test expectation:** None — requires DOM/WebGL. Verified through GameCanvas integration.

  **Verification:**
  - `npx tsc --noEmit` passes
  - No Three.js imports at module level (only inside dynamic import)

- [ ] **Unit 2: GameCanvas + LoadingScreen**

  **Goal:** Render the game canvas with click-to-start flow and loading state

  **Requirements:** R1, R6

  **Dependencies:** Unit 1

  **Files:**
  - Create: `src/ui/GameCanvas.tsx`
  - Create: `src/ui/LoadingScreen.tsx`

  **Approach:**
  - GameCanvas: full-viewport canvas with "Click to Play" overlay. On click, trigger engine init via useEngine. Show LoadingScreen while loading. Render HUD and HotbarUI once ready.
  - LoadingScreen: "Generating Island..." with CSS pulsing dots animation. Visible while `isLoading`. Fade out transition.
  - Handle window resize via ResizeObserver or `resize` event → call engine renderer resize.

  **Patterns to follow:**
  - Standard `'use client'` Next.js component with refs and effects

  **Test expectation:** None — visual component. Verified through browser testing.

  **Verification:**
  - `npx tsc --noEmit` passes
  - Canvas renders at full viewport

- [ ] **Unit 3: HUD (crosshair, shards, completion, debug)**

  **Goal:** Overlay showing game state information without intercepting input

  **Requirements:** R3

  **Dependencies:** None (reads Zustand stores)

  **Files:**
  - Create: `src/ui/HUD.tsx`

  **Approach:**
  - Crosshair: centered `+` via absolute-positioned pseudo-elements or simple divs. White, 1px, 20px, `mix-blend-mode: difference`.
  - Shard counter: top-right, "Shards: X/5" with cyan CSS diamond (45° rotated square). Pulse animation on count change via CSS keyframes triggered by key prop.
  - Completion overlay: conditional render when `isComplete`. Dark semi-transparent bg, "ISLAND CLEARED" with cyan text-shadow glow, fade-in. After 4s (setTimeout), show "Press ESC to continue".
  - Debug panel: top-left, toggled by F3 key. Shows FPS, player position, chunk count. Data exposed via a simple global or Zustand slice.
  - All with `pointer-events: none`.

  **Patterns to follow:**
  - Zustand selector pattern: `useGameStore(s => s.shardsCollected)`

  **Test expectation:** None — visual component. Verified through browser testing.

  **Verification:**
  - `npx tsc --noEmit` passes
  - Crosshair visible and centered

- [ ] **Unit 4: HotbarUI**

  **Goal:** 8-slot block selection bar at bottom of screen

  **Requirements:** R4

  **Dependencies:** None (reads Zustand stores)

  **Files:**
  - Create: `src/ui/HotbarUI.tsx`

  **Approach:**
  - 8 slots horizontally centered at bottom via flexbox
  - Each slot: 48x48px div with block color background, slot number (1-8) in corner
  - Selected slot: white 2px border. Unselected: gray 1px border.
  - Block name label above selected slot
  - Color map hardcoded as a const object mapping block IDs to hex colors
  - `pointer-events: none`

  **Patterns to follow:**
  - Zustand selector: `useHotbarStore(s => s.selectedIndex)`

  **Test expectation:** None — visual component. Verified through browser testing.

  **Verification:**
  - `npx tsc --noEmit` passes
  - 8 slots render with correct colors

- [ ] **Unit 5: PauseMenu**

  **Goal:** Overlay pause menu with Resume and Quit actions

  **Requirements:** R5

  **Dependencies:** None (reads Zustand stores)

  **Files:**
  - Create: `src/ui/PauseMenu.tsx`

  **Approach:**
  - Render only when `isPaused` is true
  - Dark overlay with centered panel (Tailwind)
  - "PAUSED" title
  - "Resume" button: re-requests pointer lock on the canvas element, sets isPaused false
  - "Quit to Menu" button: navigates to `/` via `next/navigation` router
  - This component DOES have `pointer-events: auto` (unlike HUD/hotbar)
  - Resume needs a canvas ref — pass via prop or find via document query

  **Patterns to follow:**
  - Next.js App Router navigation via `useRouter().push('/')`

  **Test expectation:** None — visual component. Verified through browser testing.

  **Verification:**
  - `npx tsc --noEmit` passes
  - Pause/resume flow works

- [ ] **Unit 6: Game page and landing page**

  **Goal:** Wire the game into Next.js routing at `/game` and update the landing page

  **Requirements:** R7, R8, R10

  **Dependencies:** Units 1-5

  **Files:**
  - Create: `src/app/game/page.tsx`
  - Modify: `src/app/page.tsx`

  **Approach:**
  - Game page: `'use client'`, full viewport (h-screen, overflow-hidden, bg-black), renders `<GameCanvas />`
  - Landing page: dark bg (#111), centered content, "VOXELHEIM" large title (font-mono), "A Voxel Island Challenge" subtitle, "Play" button as a Next.js Link to `/game`
  - Both pages are minimal — GameCanvas handles all game UI

  **Patterns to follow:**
  - `src/app/layout.tsx` — existing Next.js App Router layout structure

  **Test expectation:** None — page routing. Verified by `npm run build` succeeding.

  **Verification:**
  - `npm run build` succeeds (confirms SSR compatibility)
  - `/game` route renders the game canvas
  - `/` route shows landing page with Play button

- [ ] **Unit 7: Pause integration in Engine**

  **Goal:** Connect pointer lock exit to pause state

  **Requirements:** R5

  **Dependencies:** Unit 5

  **Files:**
  - Modify: `src/engine/Engine.ts`
  - Modify: `src/engine/InputManager.ts` (add onPointerLockLost callback)

  **Approach:**
  - InputManager: add an `onPointerLockLost` callback that fires when pointer lock exits (not on initial state)
  - Engine: set callback to `useGameStore.getState().setPaused(true)` when pointer lock is lost
  - Engine game loop already skips updates when isPaused — no change needed there

  **Patterns to follow:**
  - Callback pattern already used in InputManager's event listeners

  **Test expectation:** None — requires DOM. Verified through browser play testing.

  **Verification:**
  - Pressing ESC exits pointer lock and shows pause menu
  - Resuming re-enters pointer lock

## System-Wide Impact

- **Interaction graph:** GameCanvas → useEngine → Engine. HUD/HotbarUI/PauseMenu subscribe to Zustand stores. Engine.gameLoop writes to stores. PauseMenu triggers pointer lock and navigation.
- **Error propagation:** useEngine catches Engine.init() errors and exposes them via error state. GameCanvas can show an error message.
- **State lifecycle risks:** Engine must be disposed on unmount to prevent WebGL context leaks. Zustand stores persist across navigations — game state should reset when entering `/game` (Engine.init already calls resetObjective).
- **Unchanged invariants:** All engine code (Phases 1-5) is unchanged except small additions to Engine.ts and InputManager.ts for pause integration.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Three.js SSR crash (accesses `window` at import time) | Dynamic import inside useEffect. Never import Engine or Three.js at module level in a component. |
| WebGL context not available (e.g., SSR, headless) | useEngine catches errors and exposes error state. GameCanvas shows fallback. |
| Pointer lock browser differences | Standard API, well-supported. PauseMenu shows when lock exits regardless of cause. |
| `npm run build` fails due to server-side import of client code | All game components use `'use client'`. Game page itself is `'use client'`. Engine is dynamically imported. |
| Zustand store state persists across navigation | Engine.init calls resetObjective. Landing page does not interact with game stores. |

## Sources & References

- Related code: `src/engine/Engine.ts`, `src/store/useGameStore.ts`, `src/store/useHotbarStore.ts`
- Prior plans: `docs/plans/2026-04-05-005-feat-player-controller-interaction-plan.md`
- Institutional: `docs/solutions/best-practices/vercel-headers-nested-route-matching-2026-04-05.md` (COOP/COEP for `/game(.*)`)
