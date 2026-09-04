# Wood variants contract — 2026-09-04

Follow-up to the remediation pass. Same working model: lead-only Phase 0
foundation on main, parallel triage (no code), lead review, implementation in
per-agent worktrees on Sonnet, gate before handback, lead integrates.

## Standing rules

Unchanged from `2026-09-03-001-remediation-contract.md`: read `CLAUDE.md`,
`AGENTS.md`, `CONCEPTS.md`, `.ai-codex/`, `docs/solutions/` first; one agent
per worktree and branch; gate `npx tsc --noEmit && npm run lint && npm test`
before handback (baseline after Phase 0: tsc clean, lint 0 errors / 10
warnings, see the completion record below for the test count); no new
dependencies; K&R braces; data-driven (no switch on block ids); verify before
fixing; `src/engine/Engine.ts` is lead-owned (patch descriptions only).

## Scope

Three tree species, oak / birch / spruce, each with a log, leaves and planks
block. Trees pick a species from biome data through a seeded field so groves
form. Every recipe that consumed a log or planks accepts any species; planks
output follows the input species. Art comes from the generated atlas with
per-species palettes. Saves stay compatible because ids are append-only.

Out of scope: species-specific tree shapes beyond a data table for trunk
height, stripped logs, slabs/stairs, sapling items, a per-world "variants"
flag (see Save impact).

## File ownership — one owner per path

| Path | Owner |
|---|---|
| `src/systems/crafting/**`, `src/tests/economy.test.ts`, `src/tests/craft.test.ts`, `src/tests/recipeBook.test.ts`, new `src/tests/recipeGroups.test.ts` | A |
| `src/engine/generation/**`, `src/tests/TerrainGenerator.test.ts`, `src/tests/treeClusters.test.ts`, new `src/tests/treeSpecies.test.ts` | D |
| `scripts/buildAtlas.ts`, `public/textures/**`, `src/data/atlasUVs.ts`, `src/tests/drops.test.ts` | F |
| `src/ui/ItemIcon.tsx` (BlockSVG / cubeFaces only), `src/ui/MinimapUI.tsx`, `src/engine/player/PlayerModel.ts`, new `src/data/woodPalette.ts`, new `src/tests/woodPalette.test.ts` | U |
| `src/data/blocks.ts`, `src/data/items.ts`, `src/engine/Engine.ts`, `src/systems/persistence/**`, docs | lead |

Everything else is frozen for this pass. `useHotbarStore.takeItems` is
frozen; A works around it inside `recipeBook.ts`.

## Phase 0 — foundation (landed by the lead)

- `src/data/blocks.ts`: `WoodSpecies`, `WoodPart`, `WOOD_SPECIES`;
  `BlockDefinition.wood?: { species, part }` and `burnable?: boolean`; oak
  LOG/LEAVES/PLANKS tagged; STICK burnable; six new definitions appended at
  ids 50-55 (BIRCH_LOG, BIRCH_LEAVES, BIRCH_PLANKS, SPRUCE_LOG, SPRUCE_LEAVES,
  SPRUCE_PLANKS) with texture names `<species>_log_side`, `<species>_log_top`,
  `<species>_leaves`, `<species>_planks`; helpers `getWoodBlockId(species,
  part)`, `woodBlockIds(part?)`, `isBurnable(id)`.
- `src/data/items.ts`: axes are effective against every wood block via
  `woodBlockIds()`; names ("Oak Log", "Birch Planks", ...), hex and CSS colours
  for the six ids.
- `scripts/buildAtlas.ts`: the eight new tile names registered with the oak
  painters as placeholders; atlas regenerated (28 tiles, 7 rows).
- `src/tests/economy.test.ts`: value rows for the six ids (log 1, planks 0.25,
  leaves 0.05, same as oak). `src/tests/drops.test.ts`: tile-rect assertion
  derives the row count from the sheet instead of assuming 5 rows.

## Id table

| Id | Name | Species | Part | Texture names |
|---|---|---|---|---|
| 5 | Oak Log | oak | log | `log_side`, `log_top` |
| 6 | Oak Leaves | oak | leaves | `leaves` |
| 11 | Oak Planks | oak | planks | `planks` |
| 50 | Birch Log | birch | log | `birch_log_side`, `birch_log_top` |
| 51 | Birch Leaves | birch | leaves | `birch_leaves` |
| 52 | Birch Planks | birch | planks | `birch_planks` |
| 53 | Spruce Log | spruce | log | `spruce_log_side`, `spruce_log_top` |
| 54 | Spruce Leaves | spruce | leaves | `spruce_leaves` |
| 55 | Spruce Planks | spruce | planks | `spruce_planks` |

Ids are append-only. Chunk data is a `Uint8Array` of raw ids and hotbar slots
persist raw ids; there is no schema version. Never renumber 5, 6 or 11.

## Recipe contract (Workstream A implements)

- A recipe grid cell that holds a wood block matches any block whose
  `wood.part` is the same (any log, any planks). Every other cell matches by
  exact id, as today. Recipes keep their current shape (numbers in grids);
  the canonical oak ids in the data mean "this part, any species".
- Result species: when the recipe result is a wood block and every matched
  wood ingredient is a single species, the result is that species' variant
  (`getWoodBlockId(species, result.wood.part)`). Mixed species produce the
  canonical oak result. Non-wood results (sticks, tables, tools) are
  unaffected.
- `findRecipe` / `findRecipe3x3` / `findRecipeForCells` return the resolved
  result id for the given cells; `resolveCraft` therefore needs no change of
  its own beyond consuming the resolved result.
- Fuel: `isFuel(id)` is `isBurnable(id)`; `FUEL_ITEMS` becomes derived from
  block data (keep the export for the economy test's cheapest-fuel lookup).
- Recipe book fill: taking ingredients for a wood cell tries each species'
  id for that part (prefer the species already in the grid, then
  `WOOD_SPECIES` order) through the existing `takeItems(blockId, count)`.
- Economy: variants carry the same values as oak; the value invariant holds
  unchanged. Add a test that a birch log crafts into 4 birch planks and that
  mixed planks still make one crafting table.

## Species selection contract (Workstream D implements)

- Data table `BIOME_WOOD: Record<Biome, ReadonlyArray<{ species: WoodSpecies;
  weight: number }>>`: forest oak 0.7 / birch 0.3; plains oak 1; snowy spruce
  1; mountains spruce 0.6 / oak 0.4; desert unused.
- `treeSpecies(wx, wz, biome): WoodSpecies` is a pure function of (seed, wx,
  wz, biome): a `SeededNoise` field seeded from `seed + ":treespecies"` at a
  scale around 48 so birch groves form inside forests, thresholded by the
  cumulative weights. Shared by `placeTrees` (island/flat) and
  `decorateChunk` (infinite).
- Trunk and canopy write `getWoodBlockId(species, "log" | "leaves")`. An
  optional `WOOD_TREE_SHAPE` table may vary trunk height per species (spruce
  taller); keep it data, keep the existing canopy code.
- Tests: determinism (same seed, same species per tree), per-biome species
  distribution over many trees within bands, and the existing tree tests
  updated to count any log id (`woodBlockIds("log")`).

## Art contract (Workstream F implements)

Palettes: oak unchanged. Birch: pale cream bark with dark horizontal flecks,
pale planks. Spruce: dark brown bark, dark blue-green leaves, warm mid-brown
planks. Leaves keep the clumped alpha holes (15-35%). The per-tile PNG
override remains. Regenerate `atlas.png` and `atlasUVs.ts` last.

## UI contract (Workstream U implements)

- `src/data/woodPalette.ts`: `WOOD_PALETTE: Record<WoodSpecies, Record<WoodPart,
  { top: string; side: string; ... }>>` for the inventory icon cube faces and
  a `heldBlockColors(species, part)` for the third-person held block.
- `ItemIcon.cubeFaces` reads `BLOCK_DEFINITIONS[id].wood` and the palette
  instead of the `case BLOCK_ID.LOG` switch. `MinimapUI` categorises by
  `wood.part`. `PlayerModel` held-block shell/trim by species.

## Save impact (lead decision)

No per-world flag. Existing worlds regenerate unmodified chunks with species;
player-modified chunks keep their stored oak blocks. This matches the policy
taken for the biome and tree-cluster changes. Old multiplayer clients render
unknown ids as invisible, non-solid blocks; all clients must run the same
build.

## Phase 1 triage — lead review

Four triage agents, sixteen skeptic votes, none refuted.

| WS | CONFIRMED | NOT-A-BUG / corrections |
|---|---|---|
| A | A1 matcher is exact-id (birch log crafts nothing), A2 `FUEL_ITEMS` static oak-only, A3 recipe-book `canCraft` exact-id, A4 `fillGridFromRecipe` rewrites the taken species to oak | A5 progression closure unaffected, A6 economy unaffected, A7 `resolveCraft` and every inventory consumer unaffected |
| D | D3 four hardcoded LOG/LEAVES write sites, D4 tree tests hardcode LOG; D5-D8 are U's and A's items | D1 correction: only `placeTrees` (island) lacks a biome; flat worlds stream through `decorateChunk` with a real biome. D9-D13: recipe data, grass tick, mesh culling, cutout leaves, dirt-under-trunk all data-driven already |
| F | F-01 placeholders are byte-identical to oak, F-04 distinctness tests needed | F-02/03/05 drops, item sheet, other assertions unaffected |
| U | U1 `cubeFaces` id switch, U2 minimap id map, U3 `PlayerModel` colour table | U4-U6 tooltips, creative listing, hand/offhand/drops already data-driven |

### Lead decisions

- **A**: implement A1-A4 as proposed; recipe data stays numbers; species
  follows a single-species input; recipe-book fill prefers the species in the
  grid, then `WOOD_SPECIES` order. `RecipeBook.tsx` tooltip shortfall text is
  a cosmetic follow-up (frozen this pass).
- **D**: `ISLAND_WOOD` oak 0.85 / birch 0.15 for island worlds;
  `WOOD_TREE_SHAPE` with spruce trunks 5-8 approved; the dead `treeIndex`
  increment stays out of scope.
- **F**: birch bark uses a horizontal fleck axis as palette data; the two
  locked hex constants and the leaves cutout seed/threshold stay.
- **U**: U3 dropped. `PlayerModel`'s colour table is worn armour and
  unreachable for blocks, so no held-block palette. Minimap keeps two
  categories: log/planks are Wood, leaves keep the Leaves colour, resolved
  from `wood.part`.

All four workstreams are independent and were dispatched in parallel from
Phase 0 (`f784a72`).

## Phase 2 — completion record (2026-09-04)

All four branches merged to main at `6abadd4`; every merge passed the gate.
Tests went from 641 (after Phase 0) to 702 across 40 files; lint 0 errors /
10 warnings; tsc clean.

| WS | What landed | New tests |
|---|---|---|
| A | `cellMatches` / `woodSpeciesUsed` / `resolveResult` in recipes.ts; wood cells match by part, results follow a single-species input; `FUEL_ITEMS` and `isFuel` derived from `burnable`; recipe book `canCraft` sums across species and `fillGridFromRecipe` places the species it took | `recipeGroups.test.ts` (31), +1 in `craft.test.ts` |
| D | `BIOME_WOOD`, `ISLAND_WOOD`, `WOOD_TREE_SHAPE` tables; `treeSpecies(wx, wz, biome?)` on a seeded field at scale 48; all four trunk/canopy sites write `getWoodBlockId`; existing tree tests detect any log | `treeSpecies.test.ts` (7) |
| F | `WoodPalette`-parameterised painters; oak byte-identical; birch pale bark with horizontal flecks; spruce dark bark and blue-green leaves; atlas regenerated (`ATLAS_HASH c4ee2121`, item sheet unchanged) | +4 in `drops.test.ts` |
| U | `src/data/woodPalette.ts`; `ItemIcon.cubeFaces` branches on `wood` data before the id switch, oak icons byte-identical; minimap `blockCategory` by `wood.part` | `woodPalette.test.ts` (18) |

Lead commits: `f784a72` Phase 0, `f001a5c` triage review.

Measured species shares (seed voxelheim-mvp, infinite): forest oak 77% /
birch 23%; plains oak 100%; mountains spruce 64% / oak 36%; snowy spruce
100%. Demo island: oak 93% / birch 7%.

### Follow-ups not done in this pass

- `RecipeBook.tsx` "Missing: ..." tooltip counts only the canonical species
  (cosmetic; the enabled state is correct).
- `recipeBook.test.ts` documents a pre-existing overwrite of a non-recipe
  item stuck in a grid cell when the inventory is full.
- `decorateChunk` has a dead `treeIndex` increment (harmless).
- Existing saves: unmodified chunks regenerate with species; modified chunks
  keep oak. Old multiplayer clients render ids 50-55 as invisible.
