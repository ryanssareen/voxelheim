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
