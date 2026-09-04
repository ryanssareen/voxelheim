---
title: "Stale hook-order errors after merging under a running Fast Refresh dev server"
module: ui
category: developer-experience
date: 2026-09-04
problem_type: developer_experience
component: development_workflow
severity: low
applies_when:
  - "merging branches under a running next dev server with an always-mounted UI component (returns null when closed) whose hook list changed between branches"
  - "debugging a React \"change in the order of Hooks\" or \"Should have a queue\" error that appears only under Fast Refresh, not on a fresh load"
  - "verifying UI screens through the Browser pane preview, where pointer lock is refused and console output is cumulative across the tab's lifetime"
tags:
  - fast-refresh
  - react-hooks
  - hot-reload
  - dev-server
  - browser-pane
  - pointer-lock
  - hmr
related_components:
  - frontend_stimulus
---

# Stale hook-order errors after merging under a running Fast Refresh dev server

## Context
While integrating merged branches under a running `next dev` server (viewed through the Claude Code Browser pane preview), pressing E to open the inventory logged a React warning: "change in the order of Hooks called by InventoryUI ... Previous render 33. useState / Next render 33. useCallback", followed by "Uncaught Error: Should have a queue. You are likely calling Hooks conditionally." The "previous render" hook list matched the pre-merge module, not the file on disk: the old `src/ui/InventoryUI.tsx` had a `useState` for mouse position that the merge replaced with the `CursorItemOverlay` component (`src/ui/ItemIcon.tsx:1076`, `src/ui/ItemIcon.tsx:1081`), and `src/ui/useSlotInteractions.ts` gained a fourth `useCallback` (`applyShiftClick`, `src/ui/useSlotInteractions.ts:35`, alongside `handleSlotClick:44`, `handleArmorClick:88`, `handleOffhandClick:136`). `InventoryUI` is always mounted — it returns `null` only after all its hooks run, at `src/ui/InventoryUI.tsx:78` (`if (!isOpen) return null;`), following two `useCallback`s at lines 41 and 63 and a `useMemo` at line 34. Because the component stays mounted across the merge, Next.js Fast Refresh hot-swapped it in place while its hook count changed, and React compared the new render against a stale previous render — reporting a hook-order violation that does not exist in the source.

## Guidance
Restart the dev server (stop and start `next dev` fresh, then hard-reload the page) after checking out or merging branches that touch always-mounted components — do not trust Fast Refresh to reconcile a changed hook list on a component that was already mounted before the change landed. Confirm this class of error is stale, not real, by diffing the "Previous render" hook list in the message against the file currently on disk before spending time on it as a live bug.

When verifying in the Claude Code Browser pane, note two gotchas:
- `read_console_messages` is cumulative across the tab's lifetime, so a stale error keeps showing after reloads even once fixed. Reloading the page does not clear it from that tool's view.
- To check errors from a specific action only, install a fresh per-load listener via `javascript_tool` before the action, then read it back:

```js
window.__errs = [];
window.addEventListener('error', e => window.__errs.push(String(e.message)));
window.addEventListener('unhandledrejection', e => window.__errs.push(String(e.reason)));
```

then read `window.__errs` after triggering the UI action, instead of relying on `read_console_messages`.

Also note: the embedded Browser pane refuses `requestPointerLock()` (`WrongDocumentError`), and mouse-look is gated on pointer lock (`src/engine/InputManager.ts:44`, `if (!this.locked) return;` in the mouse-move handler). In this session neither the pane's key action nor a `KeyboardEvent` dispatched on `window` opened the inventory there; the keydown path itself has no pointer-lock check, so the cause was not diagnosed. Per this session's conclusion, verify game screens with headless Vitest tests that drive the stores and components directly rather than trying to reproduce keypresses in the pane.

## Why This Matters
Treating a stale Fast-Refresh artifact as a real regression wastes debugging time hunting for a hook-order bug that isn't in the code, and can lead to unnecessary code changes to "fix" something that a server restart would have resolved. Knowing the pane's console-log is cumulative and that pointer lock is unavailable there avoids false negatives/positives when confirming a fix.

## When to Apply
- After merging or checking out branches that change the hook composition (add/remove `useState`/`useCallback`/`useEffect`) of a component that is always mounted (early-returns `null` internally rather than being conditionally rendered by its parent).
- Any time a React hook-order error's reported hook sequence doesn't match the current source of the named component.
- When verifying game UI in the Browser pane, where pointer lock is refused and keypress-driven screens did not open in this session.

## Examples
Screens in this codebase that follow the "hooks above the early return" pattern correctly:
- `src/ui/InventoryUI.tsx` — all hooks (lines 21-76) run before `if (!isOpen) return null;` at line 78.
- `src/ui/CraftingTableUI.tsx` — hooks (lines 21-65, including a `useState` for mouse position at line 26) run before `if (!tableOpen) return null;` at line 80.
- `src/ui/FurnaceUI.tsx` — hooks run before `if (!furnaceOpen) return null;` at line 89.
- `src/ui/CreativeInventoryUI.tsx` — splits the early return from the hooks entirely: the outer `CreativeInventoryUI` (line 38) does `if (!creativeOpen) return null;` at line 42 with only the single store-selector hook before it (a stable call that never varies between renders), then renders an inner `CreativePanel` (line 46) that owns all the hooks (`useState`, `useEffect`, `useCallback` from lines 52-144). This wrapper/inner-component split is the safest shape when a screen has many hooks, since it makes "no hooks before the conditional" structurally obvious.

Checklist:
- [ ] Restart `next dev` (stop/start, not just reload) after merging branches that change hooks in always-mounted components.
- [ ] Verify per-load with a fresh in-page `window.__errs` listener installed via `javascript_tool`, not `read_console_messages` alone (it's cumulative for the tab's lifetime).
- [ ] Treat the Browser pane's console log as history, not a live-per-action signal.
- [ ] Verify game screens with headless Vitest tests rather than keypresses in the pane (pointer lock throws `WrongDocumentError` there and keypress-driven screens did not open in this session).

## Related
- `src/ui/InventoryUI.tsx`, `src/ui/CraftingTableUI.tsx`, `src/ui/FurnaceUI.tsx`, `src/ui/CreativeInventoryUI.tsx`
- `src/ui/useSlotInteractions.ts`, `src/ui/ItemIcon.tsx`
- `src/engine/InputManager.ts`
