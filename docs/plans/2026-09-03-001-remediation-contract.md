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
| WOODEN_* tools | 1 | 3 planks + 2 sticks |
| STONE_* tools | 1.75 | 3 stone + 2 sticks |
| IRON_ORE, IRON_INGOT | 4 | tier 2 mining, smelted 1:1 |
| DIAMOND_ORE, DIAMOND | 16 | tier 3 mining |
| IRON_* tools | 12 | 3 ingots + 2 sticks |
| DIAMOND_* tools | 48 | 3 diamonds + 2 sticks |
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

## Phase 1 triage — sections below are appended by triage agents

Each section: bugs reproduced, classification (CONFIRMED / NOT-A-BUG /
DIFFERENT-THAN-DESCRIBED) with file:line evidence, root cause, proposed fix,
blast radius, test strategy.
