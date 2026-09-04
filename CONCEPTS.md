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

## Simulation

### Random Tick
A budgeted per-frame pass that samples a few cells in each loaded chunk and applies data-declared rules (grass spreads to lit dirt, grass under an opaque block decays). Edits carry the change source `"simulation"`, are client-local, and re-mesh through the normal `setBlock` path.
