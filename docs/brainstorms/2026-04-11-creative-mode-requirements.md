---
date: 2026-04-11
topic: creative-mode
---

# Creative Mode

## Problem Frame

Voxelheim only has survival gameplay. Builders who want to experiment with designs, explore terrain, or play casually have no way to avoid combat, hunger, and fall damage. The world-creation UI already has a disabled Creative/Survival toggle — this feature wires it up.

## Requirements

**Game Mode Lifecycle**

- R1. World creation page enables the existing Creative/Survival toggle (currently disabled). The selected mode persists in `WorldMeta` and loads in the Engine.
- R2. Creative mode is set at world creation and cannot be changed mid-game. Multiplayer sessions inherit the host's mode.

**Invulnerability**

- R3. In creative mode, health and hunger bars are hidden. The player takes zero damage from all sources (combat, fall, void, starvation, creeper explosions). Death is impossible.
- R4. Mobs still exist in the world but ignore the creative-mode player (no aggro, no attacks).

**Flight**

- R5. Double-tap Space to toggle flight on/off. While flying: Space = ascend, Shift = descend (Ctrl stays crouch for building), WASD = horizontal movement at walk speed.
- R6. Flight disables gravity, fall damage tracking, and auto-jump. Landing (touching ground while flying) does not disable flight — only a second double-tap does.
- R7. When flight is toggled off mid-air, normal gravity resumes.

**Creative Inventory**

- R8. Opening inventory (E) shows a creative inventory grid containing every placeable block type with infinite stacks (count displays as infinity symbol). Placing blocks never depletes the stack.
- R9. The creative inventory replaces the normal survival inventory and crafting grid. No crafting is needed.
- R10. Blocks broken in creative mode do not drop items.

**Instant Break**

- R11. Left-click instantly breaks any block (break time = 0, no tool required, no mining progress bar). No drops spawn.

**Multiplayer**

- R12. Creative mode works in multiplayer. The `isFlying` state syncs to other players so remote avatars render correctly (floating vs. walking animation).

## Success Criteria

- A player can create a creative world, fly around, place/break blocks instantly, and never die
- A second player can join via session code and both are in creative mode
- Switching to a survival world keeps all existing survival mechanics unchanged

## Scope Boundaries

- No spectator mode (camera-only, no interaction)
- No mid-game mode switching
- No creative-mode-exclusive blocks (same block set as survival)
- No command system or chat
- No gamemode per-player in multiplayer — all players share the host's mode

## Key Decisions

- **Minecraft-style flight controls**: Double-tap Space is the universally recognized pattern for creative flight. Ctrl stays as crouch for precise edge-building.
- **Infinite stacks, not one-of-each**: Matches player expectations from Minecraft. Simplifies inventory UI — no quantity management.
- **Mode is per-world, not per-player**: Keeps multiplayer simple. Everyone plays the same rules.

## Deferred to Planning

- [Affects R8][Technical] How to implement the creative inventory UI — separate component or mode flag on existing InventoryUI
- [Affects R5][Technical] Double-tap detection timing window (likely 300-400ms)
- [Affects R12][Technical] Whether `isFlying` needs a new field in `MultiplayerPlayerState` or reuses an existing one

## Next Steps

→ `/ce:plan` for structured implementation planning
