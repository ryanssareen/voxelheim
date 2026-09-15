# Concepts

Shared domain vocabulary for this project — entities, named processes, and status concepts with project-specific meaning. Seeded with core domain vocabulary, then accretes as ce-compound and ce-compound-refresh process learnings; direct edits are fine. Glossary only, not a spec or catch-all.

This file was seeded from a learning in the collision/physics area, so that area is covered first. Other areas of the project are not yet represented.

## World

### Block
The unit cell of the world lattice: a one-unit cube addressed by integer coordinates. Every point in the world falls inside exactly one block, and terrain, building, and collision are all expressed in block terms rather than as continuous geometry.

### Solid
The property that decides whether a Block participates in collision. Solidity belongs to the block *type*, not to the individual placed block. A non-solid block still occupies its cell and may still be rendered — entities simply pass through it.

## Entity Physics

### Hitbox
The axis-aligned box an entity occupies for collision purposes, sized independently of the model drawn for it. Every entity — player and mob alike — resolves movement one axis at a time against the Blocks its hitbox overlaps.

A hitbox is **half-open on its maximum edges**: when a max edge lands exactly on a block boundary, the Block beyond that edge is *not* overlapped. This is load-bearing rather than pedantic, because collision resolution parks entities flush against block faces — an edge sitting exactly on a boundary is the normal resting state, not a rare case. The minimum edges are closed: a min edge exactly on a boundary is inside the block it touches.

### Sub-stepping
Splitting one frame's displacement into bounded increments and resolving collision after each, so a fast-moving entity cannot pass through a Block that a single large step would have jumped over. The player moves this way; mobs resolve one step per axis and rely on a lower speed cap instead.

### Void Kill
The rule that an entity which falls below the bottom of the world is destroyed rather than left falling forever. Players and mobs use different depth thresholds, and a mob's is the shallower of the two — a mob displaced below the terrain surface dies quickly, while a player has more margin to recover.

### Knockback Impulse
A decaying horizontal push kept in its own channel, separate from the velocity that AI or player input assigns every tick. It is added to displacement at move time, decays exponentially, and is zeroed on a wall hit. Writing knockback into velocity does not work because the next tick overwrites it.

## Progression

### Tool Tier
The harvest level of a tool (wood 1, stone 2, iron 3, diamond 4; empty hand 0). A block may declare a minimum tier. Below-tier mining still breaks the block but drops nothing, does not count toward the objective, and is slower. The tool type gate (`requiresTool`) and the tier gate are separate checks and both must pass.

### Objective Block
A block whose definition carries `special: "crystal_shard"`. Breaking one with a sufficient tool advances the win condition. No recipe may output one and it cannot be placed, so the world-generated count is the only supply.

## Wood

### Wood Species
One of oak, birch or spruce, carried on a block definition's `wood` field together with its part (log, planks, leaves). Species picks the art and the drop; ids are append-only and the oak ids 5, 6 and 11 are permanent because chunk data stores raw ids. A tree's species is a pure function of seed, position and biome, so the same world always grows the same trees.

### Ingredient Group
A recipe cell that names a wood block means "any species of that part". Recipes stay plain id grids using the oak id as the canonical marker; the matcher compares wood cells by part and resolves the result to the ingredients' species when they agree, or to oak when they are mixed. Non-wood cells still match by exact id.

## Economy

### Value Potential
An abstract per-block value such that every recipe's output is worth no more than its inputs. Because total inventory value can never rise, no crafting loop can create items. The table lives with the economy test; a recipe that violates it is a bug in the recipe, not the table.

## Inventory

### Slot Region
A contiguous range of a screen's flat slot space with a role, an `accepts` predicate that reads item data, and a destination priority. Quick-move resolves purely against declared regions, so adding a container means declaring its regions and nothing else. Output regions are take-only; negative priority means never a destination.

### Quick-Move
Shift-click transfer of a stack into the best accepting region: partial stacks of the same item first, then empty slots, whole stack or as much as fits, remainder left at the source. Conservation is the acceptance test: the multiset of items across every slot and the cursor never changes.

## Input

### Intent
A named thing the player wants to do — move, look, jump, mine-or-attack, place-or-use — as distinct from the key or button that asked for it. Gameplay code consumes intents; only an Input Source knows about devices. This is what lets a finger and a mouse drive identical behaviour without either being privileged.

### Input Source
A producer of Intents from one kind of device. Exactly one is driving at a time, and which one is a runtime property rather than a build or a device class: it changes the moment a different device is used, so a machine with both a keyboard and a touchscreen works without choosing between them.

### Intent Snapshot
The single per-frame view of every Intent, shared by the frame loop, the player controller and the UI. It expresses three temporal shapes, because collapsing them loses behaviour: **held** state that stays true while a control is down, **edges** that carry the moment of each press, and continuous **deltas**.

Edges carry their timestamp because some behaviour is defined by the gap between two presses rather than by either one. Each consumer reads edges through its own cursor and sees every edge exactly once; a shared consume-on-read queue would let whichever consumer ran first silently starve the rest.

### Suppression
The explicit state meaning *gameplay input is being ignored right now*, naming its reason. Deliberately not the same as no controls being held: the game still runs physics while paused or while a panel is open, so the two conditions must be distinguishable.

Lifting suppression discards whatever accumulated during it — buffered edges and accumulated look deltas alike. Keeping either would fire a stale action or snap the camera on the frame play resumes.

### Touch Resolution
The answer to "how does a finger do this?" for one action the keyboard binds — a **gesture** (an unlabelled movement on a surface showing no control), a **control** (something on screen a player can find by looking), or an explicit **deferral** with its reason. Every keyboard action has exactly one, recorded as data, because the failure it guards against is silent: an action with no touch route does not error, it simply never happens, which is indistinguishable from a player who never tried it.

### Device Profile
The render and simulation distance a device starts at, chosen from which Input Source is driving. It is a *starting point*, not a setting: the moment a player picks a distance themselves that choice is pinned and no later profile may overwrite it, in either direction. The pin has to be recorded separately from the value, because a saved number cannot say whether anyone chose it.

## Simulation

### Random Tick
A budgeted per-frame pass that samples a few cells in each loaded chunk and applies data-declared rules (grass spreads to lit dirt, grass under an opaque block decays). Edits carry the change source `"simulation"`, are client-local, and re-mesh through the normal `setBlock` path.
