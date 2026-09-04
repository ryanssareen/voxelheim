# Remediation contract — 2026-09-03

Read this before touching code. It is the shared contract between the lead and
every workstream agent. Sections marked **(triage appends)** are filled in by
the Phase 1 triage agents; everything else is lead-owned.

## Standing rules

- Read `CLAUDE.md`, `AGENTS.md`, `CONCEPTS.md`, `.ai-codex/`, `docs/solutions/`
  before coding. `AGENTS.md` warns this Next.js diverges from training data:
  check `node_modules/next/dist/docs/` before anything framework-level.
- One agent per git worktree and branch. Never two agents in one checkout.
- Gate before any handback: `npx tsc --noEmit && npm run lint && npm test`.
  Baseline at the foundation commit: tsc clean, lint 0 errors / 11 warnings,
  247 tests passing. Do not add lint errors; do not reduce the test count.
- No new dependencies without asking the lead.
- Opening braces on the same line as the statement (K&R).
- Verify before fixing. "Already works, here is the evidence" is a valid
  deliverable.
- Fixes are data-driven. A `switch` on block ids or container names to get
  behaviour is a review rejection.
- `src/engine/Engine.ts` is shared. Nobody edits it. Submit a patch
  description (exact hunk, file:line, rationale) and the lead applies it.

## File ownership — one owner per path

| Path | Owner |
|---|---|
| `src/systems/crafting/**` | A |
| `src/engine/player/BlockInteraction.ts`, `src/data/blocks.ts` (minTier values only) | B |
| `src/engine/world/**` (except ItemDropManager.ts), `src/engine/renderer/ChunkMeshBuilder.ts` | C |
| `src/engine/generation/**`, `src/systems/simulation/**` | D |
| `src/engine/entities/**` | E |
| `src/engine/world/ItemDropManager.ts`, `src/engine/renderer/TextureAtlas.ts`, `scripts/buildAtlas.ts` | F |
| `src/store/useInventoryStore.ts`, `src/systems/inventory/**`, `src/ui/*Inventory*`, `src/ui/CraftingTableUI.tsx`, `src/ui/FurnaceUI.tsx`, `src/ui/useSlotInteractions.ts`, `src/ui/ItemIcon.tsx` (InventorySlot only) | G |
| `src/engine/player/PlayerController.ts`, `src/ui/HUD.tsx`, `src/ui/GameCanvas.tsx` | H |
| `src/engine/renderer/BlockBreakOverlay.ts` | I |
| `src/engine/Engine.ts` | lead (patches only) |
| `src/data/items.ts`, `src/store/useSettingsStore.ts`, `src/store/useHotbarStore.ts` | lead (frozen after Phase 0; request changes) |

Tests: each workstream owns `src/tests/<topic>.test.ts` files it creates.
Do not edit another workstream's test file.

## Phase 0 — foundation (done in this commit)

1. `src/data/items.ts`: `ToolDef.tier`, `TOOL_TIER`, `NO_TOOL_TIER`.
2. `src/data/blocks.ts`: `BlockDefinition.minTier?`, `eatTimeSeconds?`,
   `DEFAULT_EAT_TIME_SECONDS = 1.6`, `getEatTimeSeconds()`. `minTier` set on
   IRON_ORE (2), DIAMOND_ORE (3), CRYSTAL (3).
3. `src/systems/inventory/transfer.ts`: transfer contract, `quickMove` throws.
4. `src/store/useSettingsStore.ts`: `autoJump` (default true),
   `fullscreenOnPlay` (default true), persisted. No behaviour yet.
5. Stack caps unified: `MAX_STACK` from `useHotbarStore` is the only cap. The
   literal 99/64 in `CraftingTableUI.tsx` and the 99s in `FurnaceUI.tsx` are
   gone.

## Tier table

| Tool material | tier |
|---|---|
| (empty hand / non-tool) | 0 (`NO_TOOL_TIER`) |
| wood | 1 |
| stone | 2 |
| iron | 3 |
| diamond | 4 |

| Block | requiresTool | minTier | Drops with |
|---|---|---|---|
| STONE | pickaxe | unset | any pickaxe |
| FURNACE | pickaxe | unset | any pickaxe |
| IRON_ORE | pickaxe | 2 | stone pickaxe or better |
| DIAMOND_ORE | pickaxe | 3 | iron pickaxe or better |
| CRYSTAL | pickaxe | 3 | iron pickaxe or better |
| LEAVES | axe | unset | any axe |
| everything else | unset | unset | anything |

Semantics (Workstream B implements):

- `requiresTool` is the type gate, `minTier` is the level gate. A block drops
  only if both pass. Below-tier mining still breaks the block, drops nothing,
  and does not call `collectShard()`.
- Below-tier mining is slower: fold `toolDef.tier / minTier` (clamped to
  `[0.25, 1]`) into `speedMul`. No tool at all against a `minTier` block uses
  `NO_TOOL_TIER` and the floor.
- **Lead decision:** under-tier use does NOT cost extra durability. One
  durability point per broken block, as today.

## Transfer contract (Workstream G implements)

Source of truth: `src/systems/inventory/transfer.ts`. Summary:

- Flat slot space: `[0, 9)` hotbar, `[9, 36)` storage (both from
  `useHotbarStore.slots`), then container slots appended by the open screen.
  Armor and offhand live in separate arrays on the hotbar store; G maps them
  into the flat space after the container slots and keeps the mapping in one
  place.
- `Region { role, range: [start, end), accepts(item), priority }`.
- `quickMove(item, fromRegion, regions, ctx) -> TransferPlan { moves, remainder }`.
- Destination order: accepting regions other than the source, descending
  priority, declaration order on ties. `output` regions and `priority < 0`
  regions are never destinations.
- Merge into partial stacks first, then empty slots, ascending index. Move the
  whole stack or as much as fits; the rest is `remainder`.
- `accepts` predicates read data, never container names: furnace input
  accepts `findSmeltingRecipe(id) !== null`; furnace fuel accepts `isFuel(id)`;
  armor accepts `getArmorDef(id)?.slot` matching the slot; craft input accepts
  anything placeable.
- Suggested priorities: `furnaceInput 30`, `furnaceFuel 20`, `armor 25`,
  `craftInput 10`, `hotbar 5`, `storage 4`, `offhand -1`, `output` n/a. From a
  player region with no container region accepting, hotbar and storage swap
  roles (hotbar -> storage, storage -> hotbar), Minecraft-style.
- Tools and armor are unstackable (`ctx.stackable` false), so they only go to
  empty slots.
- The resolver is pure and tested headless with no React.

Conservation invariant (G's acceptance test): for every screen, the multiset
of `(blockId, count)` summed across hotbar, storage, armor, offhand, cursor
and container slots is unchanged by any `quickMove`, `open*`, `close*`.

## Economy value table (Workstream A's test uses this)

Values are abstract "effort units". The invariant is: for every recipe in
`RECIPES`, `RECIPES_3x3`, and `SMELTING_RECIPES`,
`sum(value(input) * count) >= value(output) * count`. Smelting edges count
the input item plus the cheapest fuel in `FUEL_ITEMS`. A recipe that violates
this must be repriced or removed. The test must also detect cycles over block
ids where the product of `(outputCount / inputCount)` exceeds 1.

| Block | value | Rationale |
|---|---|---|
| AIR, LAVA, WATER | 0 | not obtainable |
| LEAVES | 0.05 | falls off every tree |
| DIRT, GRASS, SAND, STONE, SNOW, ICE | 0.5 | abundant terrain |
| LOG | 1 | one axe swing per log |
| PLANKS | 0.25 | 1 log -> 4 |
| STICK | 0.125 | 2 planks -> 4 |
| CRAFTING_TABLE | 1 | 4 planks |
| FURNACE | 4 | 8 stone |
| WOODEN_PICKAXE, WOODEN_AXE | 1 | 3 planks + 2 sticks |
| WOODEN_SHOVEL | 0.5 | 1 plank + 2 sticks |
| WOODEN_SWORD | 0.625 | 2 planks + 1 stick |
| STONE_PICKAXE, STONE_AXE | 1.75 | 3 stone + 2 sticks |
| STONE_SHOVEL | 0.75 | 1 stone + 2 sticks |
| STONE_SWORD | 1.125 | 2 stone + 1 stick |
| IRON_ORE, IRON_INGOT | 4 | tier 2 mining, smelted 1:1 |
| DIAMOND_ORE, DIAMOND | 16 | tier 3 mining |
| IRON_PICKAXE, IRON_AXE | 12 | 3 ingots + 2 sticks |
| IRON_SHOVEL | 4.25 | 1 ingot + 2 sticks |
| IRON_SWORD | 8.125 | 2 ingots + 1 stick |
| DIAMOND_PICKAXE, DIAMOND_AXE | 48 | 3 diamonds + 2 sticks |
| DIAMOND_SHOVEL | 16.25 | 1 diamond + 2 sticks |
| DIAMOND_SWORD | 32.125 | 2 diamonds + 1 stick |
| IRON_HELMET / CHEST / LEGS / BOOTS | 20 / 32 / 28 / 16 | 5 / 8 / 7 / 4 ingots |
| DIAMOND_HELMET / CHEST / LEGS / BOOTS | 80 / 128 / 112 / 64 | 5 / 8 / 7 / 4 diamonds |
| CRYSTAL | 8 | tier 3 mining, feeds `collectShard()` |
| RAW_PORK, RAW_BEEF | 2 | mob drop |
| RAW_MUTTON | 1.5 | mob drop |
| COOKED_PORK, COOKED_BEEF | 2 | raw + fuel |
| COOKED_MUTTON | 1.5 | raw + fuel |

Known violators at the foundation commit (A must resolve each; expected
resolution in brackets):

- `Planks (Efficient)` 3 planks -> 6 planks [remove]
- `Log` 4 leaves -> 1 log, `Log (Bulk)` 9 leaves -> 3 logs [remove]
- `Crystal (Rare Find)` 2 stone -> 1 crystal [remove]
- `Crystal Synthesis` 2 sand + 2 crystal -> 3 crystal [remove]
- `Crystal (Polishing)` 1 crystal + 3 stone -> 2 crystal [remove]
- `Crystal (Compression)` 9 stone -> 4 crystal [remove]
- `Crystal Matrix` 4 crystal + 5 stone -> 8 crystal [remove]
- `Crafting Tables (Bulk)` 4 planks + 1 log -> 4 tables [reprice to 2]

Gap noticed while pricing: `DIAMOND_ORE` drops itself and there is no
smelting recipe to `DIAMOND`, so diamond tools are unreachable in survival.
A owns `smelting.ts` and should add `DIAMOND_ORE -> DIAMOND` (value-neutral).
B's progression test should then assert wood -> stone -> iron -> diamond is
reachable and cannot be short-circuited.

## Workstreams

The brief for A through G is authoritative. H and I were cut off in the brief;
the lead's reading is below and the triage agent confirms or corrects it.

- **A** Economy integrity (P0). Value-graph test, recipe fixes, atomic
  craft-result fix supplied to G.
- **B** Tool tiers using the Phase 0 fields.
- **C** World border and invisible geometry (long pole; re-mesh, not culling).
- **D** Worldgen balance, cluster-noise trees, grass spread random tick.
- **E** Mobs: knockback impulse, creeper swell, skeleton model.
- **F** Drops render with atlas texture or icon billboard; atlas art; wood
  variants blast-radius report only.
- **G** Generic quick-move resolver, open* item loss, side effect out of the
  zustand updater, A's atomic fix applied.
- **H** Player feel and settings wiring: `autoJump` in `PlayerController.ts`
  (step up one-block ledges while walking, off when the setting is false),
  `fullscreenOnPlay` in `GameCanvas.tsx` (request fullscreen alongside pointer
  lock, respect the setting), and timed eating driven by `eatTimeSeconds` with
  an eat progress indicator in `HUD.tsx`. Eating currently lives in
  `Engine.ts` (instant, right-click), so the timed version is an Engine patch
  through the lead.
- **I** Block break overlay: triage what is wrong with the crack overlay in
  play (alignment, visibility, stage progression, transparent blocks) and fix
  in `BlockBreakOverlay.ts` only.

## Phase 1 triage — results and lead review

Full triage reports (per workstream, structured JSON with file:line evidence,
root cause, proposed fix, blast radius, test strategy) were produced by the
triage agents and reviewed by the lead. Summary of classifications:

| WS | CONFIRMED | DIFFERENT | NOT-A-BUG | MISSING-SYSTEM |
|---|---|---|---|---|
| A | A1 planks doubler, A2 leaves->log, A4 tables bulk, A6 no diamond smelt, A7 non-atomic craft, A9 place-and-remine shard | A3 crystal recipes (Matrix is 5C+4S), A5 value table shovel/sword rows wrong | | A8 economy test |
| B | B1 minTier never read, B2 under-tier not slower, B3 under-tier crystal counts shard | | B4 durability already -1, B5 creative no drops, B6 no other drop sites | B7 progression test blocked on A |
| D | D1 forest ~48-50% / plains ~10%, D2 uniform tree roll (forest 24.5/chunk, plains 4.5) | D4 terrain worker is dead code, generation is main-thread | | D3 grass spread |
| E | E1 knockback overwritten by AI, E5 idle breathing integrates (0.6 block drift), E6 sword-killed creeper still explodes | E3 skeleton proportions, E4 all mobs authored facing +X but move along -Z (walk broadside) | | E2 creeper swell/hiss/abort |
| F | F1 all drops identical colour cubes, F3 leaves tile fully opaque (pipeline already supports cutout) | | F4 atlas -> mesh builder works | F2 item icon sheet, F5 wood variants (report only) |
| G | G3 addItem inside updater, G4 non-atomic craft/smelt grant, G5 grid setters strip durability (free repair), G6 duplicated click handlers lack armor guard | G2 open* wipe is latent; reachable loss is close* with a full inventory | | G1 quick-move |
| H | | | | H1 autoJump, H2 fullscreenOnPlay, H3 timed eating, H4 no settings UI |
| C, I | triage in progress (see addendum below) | | | |

### Lead decisions (binding for implementation)

Landed on main by the lead before Phase 2 (so every branch starts from them):

- `useGameStore`: `eatProgress` + `setEatProgress`.
- `ChunkManager`: `forEachLoadedChunk(visit)` and `"simulation"` added to
  `BlockChangeSource` (D's cross-needs from C).
- `Engine.ts`: H3's hold-to-eat patch applied verbatim (timer, cancel rules,
  `setEatProgress` every frame).
- `items.ts`: FURNACE added to every pickaxe's `effectiveAgainst`.
- Home page Options modal: Auto-Jump and Fullscreen toggles (H4).
- Contract value table: shovel/sword rows corrected to their input sums (A5).

**A.** Remove: Planks (Efficient), Log, Log (Bulk), Crystal Synthesis,
Crystal (Rare Find), Crystal (Polishing), Crystal (Compression), Crystal
Matrix. Reprice Crafting Tables (Bulk) to 2. Add smelting DIAMOND_ORE ->
DIAMOND. Also remove the tool-free stone sources that let a player skip the
wooden pickaxe: "Stone" (4 sand -> 1 stone, 2x2), "Stone (Bulk Smelt)" (9 sand
-> 4 stone) and "Stonework" (8 planks -> 4 stone); keep SAND -> STONE smelting
(a furnace already costs 8 stone) and 4 stone -> 4 sand. Value table lives in
the test file. Objective-output assertion (no recipe outputs a block with
`special === "crystal_shard"`) approved. A7: the result click is a no-op when
the cursor cannot take the result (Minecraft); `resolveCraft` in
`src/systems/crafting/craft.ts` plus `findRecipeForCells` in recipes.ts, G
applies the handlers. The STONE -> SAND -> STONE product-1.0 loop is fine.
Remove the now-unused single-letter consts so lint stays clean.

**B.** Helpers `canHarvest` and `harvestSpeedMultiplier` live in a new B-owned
file `src/engine/player/harvest.ts` (pure, no engine imports).
`BlockInteraction` uses them at both sites. Approve the data-driven tidy
(`blockDef.special === "crystal_shard"` instead of the id compare). Creative
stays ungated. Close A9: refuse placement of blocks whose definition has
`special === "crystal_shard"`. Progression test lands after A (Phase 2 runs A
first).

**D.** Accept regenerated terrain for existing infinite/flat saves (dev-stage
local saves; island and demo worlds unaffected); document it in the code
comment and the solutions doc. Biome split: the one-line change (plains ~29%,
forest ~30%). Cluster noise per D2 with the data table, scale 32. Write DIRT
under trunks in `decorateChunk` only (not `placeTrees`). Random tick is
client-local (source `"simulation"`, not broadcast). Light predicate: transparent
above, as the brief says. Do not gate mountain trees on surface block; do not
touch the island tree path.

**E.** Ship E4 (facing) with E3. Knockback constants as proposed (speed 3,
decay 6, stagger 0.35 s bumping attackCooldown). Creeper `fuseSeconds` /
`fuseAbortRange` as MobConfig data, abort range 3.5, keeps chasing. `MobSfx.ts`
with its own lazily created AudioContext, gated by musicEnabled and scaled by
musicVolume (no new settings). Compensate the name tag / health bar sprites
against the swell. `fuseDetonated` replaces the four-term explosion predicate.

**F.** Spinning DoubleSide quad for item drops (Lambert, lit). Item sheet load
failure degrades to the colour-box fallback. Keep generating tiles; allow
per-tile PNG overrides from `public/textures/blocks/<name>.png`. Generated
`atlasUVs.ts`, `atlas.png`, `items.png` are F's outputs. No npm script (no new
dependency); keep `npx tsx scripts/buildAtlas.ts` in the script header.
Regenerate the atlas last before handback. Wood variants: not scheduled.

**G.** `craftInput` priority is -1 (never a quick-move destination). Leftovers
on close are parked in the container/cursor, not dropped. One craft per
shift-click on an output slot. Delete `toggle` (no callers). Add `reset()` to
the inventory store for tests. Container slot setters gain an optional 4th
`durability` param. Plain click on an output uses A's `resolveCraft`;
shift-click on an output quick-moves the result into hotbar/storage and
consumes only if it all fits. The furnace result uses the same path with a
finder over [input, fuel] (`isFuel` + `findSmeltingRecipe`), fixing the
fixed-one-unit grant.

**H.** New H-owned file `src/ui/playCapture.ts` exporting `enterPlayCapture`.
PlayerController reads the settings store directly. `AUTO_JUMP_VELOCITY = 7`.
Fullscreen target is the container div. Eat gate unchanged. Also H5: give the
player the same decaying knockback impulse channel E1 gives mobs
(`applyKnockback` is currently overwritten by input every frame).
PauseMenu re-lock sites switch to `enterPlayCapture` (lead applies at
integration).

### C and I (triage addendum, verified by skeptics)

| WS | CONFIRMED | DIFFERENT | NOT-A-BUG | MISSING-SYSTEM |
|---|---|---|---|---|
| C | C1 `unloadColumn` never re-queues surviving neighbours for remesh (the invisible wall: stale culled faces over real, minable block data), C3 terrain worker is dead code | C4 `getBlock` surface fallback for generated-but-unmeshed chunks (skeptic: matches the code; intentional, left as is) | C2 neighbour-arrives-late remesh already works | C5 island worlds have no border, C6 loaded-chunk enumeration (landed by lead as `forEachLoadedChunk`) |
| I | I-1 overlay freezes visible on pause/chat/inventory/death frames (Engine call sites), I-2 highlight pass adds light-independent white | | I-3 alignment, I-4 z-fighting, I-5 transparent blocks, I-6 stage progression / tool speed / six faces | |

**C.** C1: add `markNeighborColumnsForRemesh(ccx, ccz)` at the end of
`unloadColumn` after the column's chunks are deleted. Permanent regression
tests for both directions (neighbour unloads, neighbour arrives late) with a
stub renderer. C5: visible barrier. A 1-block STONE perimeter ring on the
outermost block row/column of the island grid, from y = 1 up to SEA_LEVEL + 6,
generated as ordinary chunk data inside `generateFiniteWorld` so it is meshed
and collidable through the normal pipeline. The ring must never overwrite a
crystal (test: CRYSTAL count after generation still equals
`CRYSTAL_SHARD_COUNT`). Existing island saves: generated (unmodified) edge
chunks gain the ring; player-modified edge chunks keep their stored data, so
the ring can have gaps there. Document that. C4: leave as is. C3: leave the
dead worker files; out of scope. C6: already landed as `forEachLoadedChunk`;
do not add a second enumerator.

**I.** I-1: the four `breakOverlay.update(null, 0)` insertions were applied
to Engine.ts by the lead. I-2: darken-only highlight via an exported
`CRACK_HIGHLIGHT_RGBA` constant plus the regression assertion. I's brief
reading was wrong about where the defect lived; the overlay class itself is
correct.

### Phase 2 order

1. A alone (P0; B and G depend on its data and `craft.ts`).
2. B, C, D, E, F, G, H, I in parallel from the merged main.
3. Lead applies Engine patches (D random ticker, F atlas arg) and PauseMenu
   change, runs the gate, merges.

## Phase 2 — completion record (2026-09-04)

All nine workstreams merged to main; every merge passed
`npx tsc --noEmit && npm run lint && npm test`. Test suite grew from 22 files
/ 247 tests to 37 files / 607 tests. Lint went from 11 warnings to 10 (an
unused recipe const removed); still 0 errors.

| WS | Branch merge | What landed | New tests |
|---|---|---|---|
| A | `a5a9b55` | 11 recipes removed (8 value-creating, 3 tool-free stone sources), Crafting Tables (Bulk) repriced to 2, DIAMOND_ORE -> DIAMOND smelting, `findRecipeForCells`, `systems/crafting/craft.ts` `resolveCraft` | `economy.test.ts` (value potential + cycle DFS + objective guard), `craft.test.ts` (conservation over every recipe) |
| B | `b497a56` (with G) | `engine/player/harvest.ts` `canHarvest` / `harvestSpeedMultiplier`; BlockInteraction uses both; `special === "crystal_shard"` replaces id compares; crystal_shard blocks cannot be placed (A9) | `toolTiers.test.ts` (full block x tool matrix, integration through `update`, progression fixpoint) |
| C | `eea1a96` | `unloadColumn` re-queues surviving neighbours for remesh (the invisible wall); island worlds get a STONE perimeter ring y=1..SEA_LEVEL+6 carved after decoration, never over a crystal | `ChunkManager.test.ts` (unload remesh, arrival remesh, border, enumeration) |
| D | `6124639` | plains cut at humidity < 0.1 (plains ~29% / forest ~30%), cluster-noise trees via `TREE_DENSITY` + `treeChance`, DIRT under trunks, `systems/simulation` RandomTicker + grass spread rule; Engine ticks it each frame | `biomeDistribution`, `treeClusters`, `randomTick` |
| E | `6124639` | decaying knockback impulse + stagger, model yaw offset (mobs face their travel direction), skeleton re-proportioned, breathing fixed, creeper swell/pulse/hiss/abort via `fuseSeconds`/`fuseAbortRange`, `fuseDetonated` explosion predicate, `MobSfx.ts` | `mobs.test.ts` |
| F | `6124639` | atlas-textured lit block drops, spinning icon quads for items from a generated `items.png`, cutout leaves (17.6% alpha holes), bark/rings/planks art, per-tile PNG override; Engine passes the atlas | `drops.test.ts` |
| G | `b497a56` | `quickMove` resolver, flat layout, data-driven regions, `returnToPlayer`, `craftOnce`; open* no longer wipe, close* park leftovers with one write per store, durability survives containers, shift-click everywhere, shared slot hook, furnace result through `resolveCraft` | `inventoryTransfer`, `inventoryConservation`, `inventoryCraft` |
| H | `6124639` | auto-jump (settings-gated, one-block ledges), player knockback impulse channel, `ui/playCapture.ts` pointer lock + fullscreen, eat progress bar; PauseMenu re-enters through `enterPlayCapture` | `autoJump`, `playCapture`, `hudEatIndicator` |
| I | `f979f52` | darken-only crack highlight (`CRACK_HIGHLIGHT_RGBA`); Engine hides the overlay on early-return frames (lead, `c0594ca`) | +1 in `blockBreakOverlay.test.ts` |

Lead commits: `3c39582` Phase 0, `89303cb` cross-needs, `c0594ca` overlay
fix, `6124639` Engine/PauseMenu wiring.

Browser smoke test (Chrome pane, demo island): home page and Options toggles
render, world loads with cutout leaves, both texture sheets fetched with their
new hashes, no console errors except pointer-lock rejections that the embedded
pane does not permit (pre-existing call, environment limitation).

### Follow-ups not done in this pass

- Wood variants (F5): report only; four-owner blast radius, needs append-only
  ids and a per-world flag for infinite saves.
- `HandRenderer` / `OffhandRenderer` still draw flat colour cubes for the held
  item; `TextureAtlas` now exposes everything needed to fix that.
- `systems/crafting/recipeBook.ts` still returns grid items through
  `addItem` one unit at a time (loses durability); `returnToPlayer` exists now.
- `src/engine/workers/**` is dead code (never instantiated).
- Existing infinite/flat saves regenerate unmodified chunks under the new
  biome split and tree clustering; stored chunks keep old terrain, so seams
  can appear at their faces. Island and demo worlds are unaffected except for
  the new border ring.
- `requestPointerLock` rejections are unhandled promises in `playCapture.ts`
  and `InputManager`; harmless, noisy in environments that deny pointer lock.
