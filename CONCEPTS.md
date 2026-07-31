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
