---
title: Inventory/tool system crash and silent data loss from old saves and missing type fields
date: "2026-04-08"
category: runtime-errors
module: inventory-tool-system
problem_type: runtime_error
component: frontend_stimulus
symptoms:
  - "Game freezes for several seconds when picking up dropped item, then teleports player"
  - "Tool durability silently lost when moving tools via cursor between slots"
  - "Tools incorrectly stackable and placeable in armor slots"
root_cause: missing_validation
resolution_type: code_fix
severity: critical
related_components:
  - useInventoryStore
  - useHotbarStore
  - CraftingTableUI
  - InventoryUI
  - ItemIcon
  - Engine
  - ItemDropManager
  - HandRenderer
  - OffhandRenderer
tags:
  - inventory
  - tool-durability
  - save-migration
  - slot-padding
  - cursor-item
  - stacking-exploit
---

# Inventory/tool system crash and silent data loss from old saves and missing type fields

## Problem

Multiple related bugs in the inventory and tool system caused a critical game freeze on item pickup (old saves with fewer slots than current TOTAL_SLOTS), silent tool durability loss through cursor operations (missing `durability` field on cursor type), and a tool stacking exploit. Secondary issues included triplicated color maps and duplicated UI components.

## Symptoms

- Game freezes for several seconds when walking over a dropped item, then teleports the player without collecting the item (old saves only)
- Moving a partially-used tool to another inventory slot silently resets it to full durability
- Crafting a tool and moving it via cursor loses the initial durability value
- Tools can be stacked with identical tools and placed in armor slots
- No visible error messages for the durability or stacking issues

## What Didn't Work

- Checked ItemDropManager pickup logic — looked correct
- Checked Engine game loop for blocking calls — none found
- Checked ChunkManager for heavy chunk operations — not the cause
- Checked PlayerController physics — clean
- Checked autosave timing for coincidental freezes — timing didn't match
- Checked Clock dt capping — already capped at 0.05s, ruling out frame spikes

## Solution

### 1. Save slot padding (critical fix)

In `src/engine/Engine.ts` (~line 192), pad loaded hotbar slots to the expected length:

```typescript
// Before (crashes on old saves with fewer slots):
if (savedMeta.hotbarSlots) {
  useHotbarStore.setState({ slots: savedMeta.hotbarSlots });
}

// After (pads short arrays to TOTAL_SLOTS length):
if (savedMeta.hotbarSlots) {
  const saved = savedMeta.hotbarSlots as Array<{ blockId: number; count: number; durability?: number }>;
  const padded = Array.from({ length: 36 }, (_, i) =>
    saved[i] ?? { blockId: 0, count: 0 }
  );
  useHotbarStore.setState({ slots: padded });
}
```

### 2. Durability preservation through cursor operations

In `src/store/useInventoryStore.ts`, added `durability?: number` to `cursorItem` and `craftingGrid` types, and threaded it through `setCursorItem`:

```typescript
cursorItem: { blockId: number; count: number; durability?: number };
setCursorItem: (blockId: number, count: number, durability?: number) => void;
```

In `src/ui/InventoryUI.tsx` and `src/ui/CraftingTableUI.tsx`, updated every `setCursorItem` call and slot-creation literal to pass durability:

```typescript
// Before (durability dropped):
setCursorItem(slot.blockId, slot.count);

// After (durability preserved):
setCursorItem(slot.blockId, slot.count, slot.durability);
```

For craft results, initial durability comes from the tool definition:

```typescript
const craftDur = getToolDef(recipe.result)?.durability;
setCursorItem(recipe.result, recipe.count, craftDur);
```

### 3. Tool stacking guards

Added `!getToolDef(cursor.blockId)` guards before same-item stacking logic in both UIs and before armor slot placement:

```typescript
if (cursor.blockId === slot.blockId && !getToolDef(cursor.blockId)) {
  // ... stacking logic (tools excluded)
}
```

### 4. Centralized color constants

Created `BLOCK_HEX_COLORS` in `src/data/items.ts` as single source of truth. `HandRenderer.ts`, `OffhandRenderer.ts`, and `ItemDropManager.ts` all import from there instead of maintaining local copies.

### 5. Shared InventorySlot component

Extracted `InventorySlot` in `src/ui/ItemIcon.tsx` with full props (`item, onClick?, size?, highlight?, label?`). Both `InventoryUI` and `CraftingTableUI` import the shared component.

## Why This Works

**Save crash:** Old saves stored 9 hotbar slots. Current code defines `TOTAL_SLOTS = 36`. When `addItem()` iterated `for (let i = 0; i < TOTAL_SLOTS; i++)` and accessed `slots[i].blockId`, indices 9-35 were `undefined`, causing an unhandled exception that froze the game loop. The accumulated dt caused the teleport effect on recovery. Padding the array on load ensures every index has a valid slot object.

**Durability loss:** The `cursorItem` type and `setCursorItem` function were the chokepoint through which every inventory drag operation passed. Without `durability` in the type or function signature, the field was stripped on every pickup. Adding it to the type, the setter, and every call site ensures durability flows through the entire cursor lifecycle.

**Tool stacking:** Tools have individual durability state, so stacking would merge items with different durability into one stack, losing data. The `getToolDef()` guard prevents the stack-merge path for tools.

## Prevention

- **Save schema migrations:** When expanding array-based schemas, always write a padding step at the deserialization boundary:
  ```typescript
  const padded = Array.from({ length: EXPECTED_LENGTH }, (_, i) => loaded[i] ?? DEFAULT_VALUE);
  ```
- **Type field propagation:** When adding a field to an item/slot type, grep for all functions that create or copy that type:
  ```bash
  grep -rn "blockId:.*count:" src/ui/ src/store/
  ```
- **Spread over enumeration:** Use `{ ...slot }` instead of manual field listing so new fields propagate automatically.
- **Centralize validation:** Define `maxStackSize` on item definitions so stacking logic checks one property rather than scattering `getToolDef()` guards across UI code.
- **Single source of truth:** When a constant is needed by more than one file, extract to a shared data module immediately.

## Related Issues

- `docs/plans/2026-04-05-005-feat-player-controller-interaction-plan.md` — Original 8-slot hotbar design that the system evolved beyond
- `docs/solutions/logic-errors/checkerboard-rendering-missing-atlas-uvs-2026-04-06.md` — Shares the meta-pattern of "data silently wrong through correct structure"
