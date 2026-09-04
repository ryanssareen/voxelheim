import { describe, it, expect, vi, beforeEach } from "vitest";
import { BLOCK_ID, BLOCK_DEFINITIONS, type BlockDefinition } from "@data/blocks";
import { TOOL_DEFS, getToolDef, NO_TOOL_TIER, type ToolDef, type ToolMaterial } from "@data/items";
import { canHarvest, harvestSpeedMultiplier } from "@engine/player/harvest";
import { BlockInteraction } from "@engine/player/BlockInteraction";
import { BlockRegistry } from "@engine/world/BlockRegistry";
import type { ChunkManager } from "@engine/world/ChunkManager";
import type { ItemDropManager } from "@engine/world/ItemDropManager";
import { useHotbarStore } from "@store/useHotbarStore";
import { useGameStore } from "@store/useGameStore";
import { RECIPES, RECIPES_3x3 } from "@systems/crafting/recipes";
import { SMELTING_RECIPES, isFuel } from "@systems/crafting/smelting";

const BLOCK_BY_ID = new Map<number, BlockDefinition>(BLOCK_DEFINITIONS.map((d) => [d.id, d]));
const block = (id: number): BlockDefinition => BLOCK_BY_ID.get(id)!;

const ALL_TOOLS: ToolDef[] = Object.values(TOOL_DEFS);
const toolsOfMaterial = (material: ToolMaterial): ToolDef[] => ALL_TOOLS.filter((t) => t.material === material);
const toolLabel = (t: ToolDef | null): string => (t ? `${t.material} ${t.toolType}` : "empty hand");

beforeEach(() => {
  useGameStore.getState().resetObjective();
  useHotbarStore.getState().resetSlots();
});

// ─────────────────────────── (a) canHarvest — pure matrix ───────────────────────────

describe("canHarvest — pure matrix over every gated block", () => {
  const gated = BLOCK_DEFINITIONS.filter((b) => b.requiresTool !== undefined || b.minTier !== undefined);
  const candidates: (ToolDef | null)[] = [null, ...ALL_TOOLS];

  for (const b of gated) {
    for (const t of candidates) {
      it(`${b.name} x ${toolLabel(t)}`, () => {
        const expected =
          (!b.requiresTool || t?.toolType === b.requiresTool) &&
          (t?.tier ?? NO_TOOL_TIER) >= (b.minTier ?? NO_TOOL_TIER);
        expect(canHarvest(b, t)).toBe(expected);
      });
    }
  }
});

describe("canHarvest — explicit contract rows", () => {
  it("STONE and FURNACE drop with every pickaxe and with nothing else", () => {
    const pickaxes = ALL_TOOLS.filter((t) => t.toolType === "pickaxe");
    const nonPickaxes = ALL_TOOLS.filter((t) => t.toolType !== "pickaxe");
    for (const id of [BLOCK_ID.STONE, BLOCK_ID.FURNACE]) {
      const def = block(id);
      for (const t of pickaxes) expect(canHarvest(def, t)).toBe(true);
      for (const t of nonPickaxes) expect(canHarvest(def, t)).toBe(false);
      expect(canHarvest(def, null)).toBe(false);
    }
  });

  it("IRON_ORE drops with a stone pickaxe or better only", () => {
    const def = block(BLOCK_ID.IRON_ORE);
    expect(canHarvest(def, TOOL_DEFS[BLOCK_ID.WOODEN_PICKAXE])).toBe(false);
    expect(canHarvest(def, TOOL_DEFS[BLOCK_ID.STONE_PICKAXE])).toBe(true);
    expect(canHarvest(def, TOOL_DEFS[BLOCK_ID.IRON_PICKAXE])).toBe(true);
    expect(canHarvest(def, TOOL_DEFS[BLOCK_ID.DIAMOND_PICKAXE])).toBe(true);
    expect(canHarvest(def, null)).toBe(false);
  });

  it("DIAMOND_ORE and CRYSTAL drop with an iron pickaxe or better only", () => {
    for (const id of [BLOCK_ID.DIAMOND_ORE, BLOCK_ID.CRYSTAL]) {
      const def = block(id);
      expect(canHarvest(def, TOOL_DEFS[BLOCK_ID.WOODEN_PICKAXE])).toBe(false);
      expect(canHarvest(def, TOOL_DEFS[BLOCK_ID.STONE_PICKAXE])).toBe(false);
      expect(canHarvest(def, TOOL_DEFS[BLOCK_ID.IRON_PICKAXE])).toBe(true);
      expect(canHarvest(def, TOOL_DEFS[BLOCK_ID.DIAMOND_PICKAXE])).toBe(true);
      expect(canHarvest(def, null)).toBe(false);
    }
  });

  it("LEAVES drops with any axe only", () => {
    const def = block(BLOCK_ID.LEAVES);
    const axes = ALL_TOOLS.filter((t) => t.toolType === "axe");
    const nonAxes = ALL_TOOLS.filter((t) => t.toolType !== "axe");
    for (const t of axes) expect(canHarvest(def, t)).toBe(true);
    for (const t of nonAxes) expect(canHarvest(def, t)).toBe(false);
    expect(canHarvest(def, null)).toBe(false);
  });

  it("DIRT drops with everything, including an empty hand", () => {
    const def = block(BLOCK_ID.DIRT);
    for (const t of ALL_TOOLS) expect(canHarvest(def, t)).toBe(true);
    expect(canHarvest(def, null)).toBe(true);
  });
});

// ───────────────────── (c) harvestSpeedMultiplier — exact values ─────────────────────

describe("harvestSpeedMultiplier — exact values", () => {
  it("matches the contract's worked examples", () => {
    expect(harvestSpeedMultiplier(block(BLOCK_ID.IRON_ORE), null)).toBeCloseTo(0.25);
    expect(harvestSpeedMultiplier(block(BLOCK_ID.IRON_ORE), TOOL_DEFS[BLOCK_ID.WOODEN_PICKAXE])).toBeCloseTo(0.5);
    expect(harvestSpeedMultiplier(block(BLOCK_ID.DIAMOND_ORE), TOOL_DEFS[BLOCK_ID.STONE_PICKAXE])).toBeCloseTo(2 / 3);
    expect(harvestSpeedMultiplier(block(BLOCK_ID.IRON_ORE), TOOL_DEFS[BLOCK_ID.IRON_PICKAXE])).toBe(6);
    expect(harvestSpeedMultiplier(block(BLOCK_ID.DIAMOND_ORE), TOOL_DEFS[BLOCK_ID.IRON_PICKAXE])).toBe(6);
    expect(harvestSpeedMultiplier(block(BLOCK_ID.STONE), TOOL_DEFS[BLOCK_ID.WOODEN_PICKAXE])).toBe(2);
    expect(harvestSpeedMultiplier(block(BLOCK_ID.DIRT), null)).toBe(1);
  });

  it("clamps the tier factor to [0.25, 1] independent of any real block/tool data", () => {
    const gated = { id: 999, minTier: 4 };
    expect(harvestSpeedMultiplier(gated, null)).toBe(0.25); // 0/4 floored
    expect(harvestSpeedMultiplier(gated, { tier: 1, miningSpeedMultiplier: 1, effectiveAgainst: [] })).toBe(0.25); // 1/4 = 0.25 exactly
    expect(harvestSpeedMultiplier(gated, { tier: 40, miningSpeedMultiplier: 1, effectiveAgainst: [] })).toBe(1); // way over-tier, capped
  });
});

// ───────────────────── (b)/(c)/(d)/(e) BlockInteraction integration ─────────────────────

const DT = 0.05;
const MAX_TICKS = 5000;
const TARGET = { x: 0, y: 2, z: 0 };
const PLAYER_POS = { x: 0.5, y: 0, z: 0.5 };
const LOOK_UP = { x: 0, y: 1, z: 0 };

/** Equips `toolId` (or an empty hand, for null) in hotbar slot 0 and selects it. */
function equipTool(toolId: number | null): void {
  useHotbarStore.getState().resetSlots();
  if (toolId === null) return;
  const slots = [...useHotbarStore.getState().slots];
  slots[0] = { blockId: toolId, count: 1, durability: getToolDef(toolId)?.durability };
  useHotbarStore.setState({ slots, selectedIndex: 0 });
}

interface MineResult {
  setBlock: ReturnType<typeof vi.fn>;
  spawnDrop: ReturnType<typeof vi.fn>;
  ticks: number;
}

/** Builds a BlockInteraction over duck-typed ChunkManager/ItemDropManager stubs and mines the
 * single block at TARGET (held left-click) until it breaks, returning the recorded calls. */
function mine(blockId: number, toolId: number | null, creative = false): MineResult {
  equipTool(toolId);
  const setBlock = vi.fn(() => true);
  const spawnDrop = vi.fn();
  const getBlock = (x: number, y: number, z: number): number =>
    x === TARGET.x && y === TARGET.y && z === TARGET.z ? blockId : BLOCK_ID.AIR;
  const chunkManager = { getBlock, setBlock } as unknown as ChunkManager;
  const itemDrops = { spawnDrop } as unknown as ItemDropManager;
  const interaction = new BlockInteraction(chunkManager, BlockRegistry.getInstance(), itemDrops);

  let ticks = 0;
  while (setBlock.mock.calls.length === 0 && ticks < MAX_TICKS) {
    interaction.update(PLAYER_POS, LOOK_UP, true, false, 0, DT, creative);
    ticks++;
  }
  return { setBlock, spawnDrop, ticks };
}

describe("BlockInteraction.update — survival mining integration", () => {
  const blocks = [
    BLOCK_ID.STONE,
    BLOCK_ID.FURNACE,
    BLOCK_ID.IRON_ORE,
    BLOCK_ID.DIAMOND_ORE,
    BLOCK_ID.CRYSTAL,
    BLOCK_ID.LEAVES,
    BLOCK_ID.DIRT,
  ];
  const toolIds: (number | null)[] = [
    null,
    BLOCK_ID.WOODEN_PICKAXE,
    BLOCK_ID.STONE_PICKAXE,
    BLOCK_ID.IRON_PICKAXE,
    BLOCK_ID.DIAMOND_PICKAXE,
    BLOCK_ID.WOODEN_AXE,
  ];

  for (const blockId of blocks) {
    for (const toolId of toolIds) {
      const blockDef = block(blockId);
      const toolDef = toolId === null ? null : TOOL_DEFS[toolId];
      const expectedDrop = canHarvest(blockDef, toolDef);

      it(`${blockDef.name} x ${toolLabel(toolDef)}: breaks, drops iff canHarvest, tool loses exactly 1 durability`, () => {
        const before = toolId === null ? undefined : getToolDef(toolId)!.durability;
        const { setBlock, spawnDrop } = mine(blockId, toolId);

        // The block always breaks, regardless of tool.
        expect(setBlock).toHaveBeenCalledTimes(1);
        expect(setBlock).toHaveBeenCalledWith(TARGET.x, TARGET.y, TARGET.z, BLOCK_ID.AIR);

        // A drop is spawned iff canHarvest passed.
        expect(spawnDrop).toHaveBeenCalledTimes(expectedDrop ? 1 : 0);

        // The shard objective only ever moves for CRYSTAL, and only when harvestable.
        expect(useGameStore.getState().shardsCollected).toBe(
          blockDef.special === "crystal_shard" && expectedDrop ? 1 : 0
        );

        // Durability is spent whenever a tool was held — including wrong-type and under-tier swings.
        if (toolId !== null) {
          expect(useHotbarStore.getState().slots[0].durability).toBe(before! - 1);
        }
      });
    }
  }
});

describe("BlockInteraction.update — under-tier mining is slower than at-tier", () => {
  it("DIAMOND_ORE: a stone pickaxe (under-tier) takes longer than an iron pickaxe (at-tier)", () => {
    const under = mine(BLOCK_ID.DIAMOND_ORE, BLOCK_ID.STONE_PICKAXE);
    const atTier = mine(BLOCK_ID.DIAMOND_ORE, BLOCK_ID.IRON_PICKAXE);
    expect(under.ticks).toBeGreaterThan(atTier.ticks);
  });

  it("IRON_ORE: a wooden pickaxe (under-tier) takes longer than a stone pickaxe (at-tier)", () => {
    const under = mine(BLOCK_ID.IRON_ORE, BLOCK_ID.WOODEN_PICKAXE);
    const atTier = mine(BLOCK_ID.IRON_ORE, BLOCK_ID.STONE_PICKAXE);
    expect(under.ticks).toBeGreaterThan(atTier.ticks);
  });
});

describe("BlockInteraction.update — creative CRYSTAL with an empty hand (lead decision: creative stays ungated)", () => {
  it("breaks the block and awards the shard, but never spawns a drop", () => {
    const { setBlock, spawnDrop } = mine(BLOCK_ID.CRYSTAL, null, true);
    expect(setBlock).toHaveBeenCalledTimes(1);
    expect(setBlock).toHaveBeenCalledWith(TARGET.x, TARGET.y, TARGET.z, BLOCK_ID.AIR);
    expect(spawnDrop).not.toHaveBeenCalled();
    expect(useGameStore.getState().shardsCollected).toBe(1);
  });
});

describe("BlockInteraction.update — placing a crystal shard is refused (A9)", () => {
  it("leaves the world and the hotbar untouched", () => {
    useHotbarStore.getState().resetSlots();
    const slots = [...useHotbarStore.getState().slots];
    slots[0] = { blockId: BLOCK_ID.CRYSTAL, count: 1 };
    useHotbarStore.setState({ slots, selectedIndex: 0 });

    const setBlock = vi.fn(() => true);
    const spawnDrop = vi.fn();
    // A solid, ungated block to aim at — the player is placing against its face.
    const getBlock = (x: number, y: number, z: number): number =>
      x === TARGET.x && y === TARGET.y && z === TARGET.z ? BLOCK_ID.STONE : BLOCK_ID.AIR;
    const chunkManager = { getBlock, setBlock } as unknown as ChunkManager;
    const itemDrops = { spawnDrop } as unknown as ItemDropManager;
    const interaction = new BlockInteraction(chunkManager, BlockRegistry.getInstance(), itemDrops);

    interaction.update(PLAYER_POS, LOOK_UP, false, true, 0, DT, false);

    expect(setBlock).not.toHaveBeenCalled();
    expect(useHotbarStore.getState().slots[0]).toEqual({ blockId: BLOCK_ID.CRYSTAL, count: 1 });
  });
});

// ───────────────────────── (f) B7 progression fixpoint ─────────────────────────

describe("progression fixpoint (B7) — no engine, no stores; real recipe/harvest data only", () => {
  const isMineableBlock = (d: BlockDefinition): boolean => d.solid && d.breakTime > 0;

  /** Block drop ids obtainable by mining with an empty hand or anything in `kit`. */
  function harvestable(kit: ToolDef[]): Set<number> {
    const drops = new Set<number>();
    for (const def of BLOCK_DEFINITIONS) {
      if (!isMineableBlock(def)) continue;
      if (canHarvest(def, null) || kit.some((t) => canHarvest(def, t))) {
        drops.add(def.dropId);
      }
    }
    return drops;
  }

  /** Fixpoint closure of `seed` under every 2x2, 3x3 and smelting recipe. */
  function closure(seed: Iterable<number>): Set<number> {
    const items = new Set(seed);
    let changed = true;
    while (changed) {
      changed = false;
      for (const r of RECIPES) {
        if (items.has(r.result)) continue;
        if (r.grid.filter((id) => id !== 0).every((id) => items.has(id))) {
          items.add(r.result);
          changed = true;
        }
      }
      for (const r of RECIPES_3x3) {
        if (items.has(r.result)) continue;
        if (r.grid.filter((id) => id !== 0).every((id) => items.has(id))) {
          items.add(r.result);
          changed = true;
        }
      }
      for (const r of SMELTING_RECIPES) {
        if (items.has(r.result)) continue;
        // Smelting also needs a furnace to smelt in — without this gate, SAND -[smelt]-> STONE
        // fires for free off LOG alone (a legitimate no-tool-required fuel), letting a kit=[]
        // player reach STONE_PICKAXE without ever mining stone. FURNACE itself costs 8 STONE
        // (RECIPES_3x3), so this closes the same loop the real game closes.
        if (items.has(BLOCK_ID.FURNACE) && items.has(r.input) && [...items].some((id) => isFuel(id))) {
          items.add(r.result);
          changed = true;
        }
      }
    }
    return items;
  }

  const NO_KIT: ToolDef[] = [];
  const WOOD_KIT = toolsOfMaterial("wood");
  const STONE_KIT = toolsOfMaterial("stone");
  const IRON_KIT = toolsOfMaterial("iron");

  it("an empty hand reaches WOODEN_PICKAXE and nothing further up the tool chain", () => {
    const items = closure(harvestable(NO_KIT));
    expect(items.has(BLOCK_ID.WOODEN_PICKAXE)).toBe(true);
    for (const id of [
      BLOCK_ID.STONE_PICKAXE,
      BLOCK_ID.IRON_ORE,
      BLOCK_ID.DIAMOND_ORE,
      BLOCK_ID.CRYSTAL,
      BLOCK_ID.IRON_INGOT,
      BLOCK_ID.DIAMOND,
    ]) {
      expect(items.has(id)).toBe(false);
    }
  });

  it("a wood kit reaches STONE_PICKAXE and nothing at or above iron", () => {
    const items = closure(harvestable(WOOD_KIT));
    expect(items.has(BLOCK_ID.STONE_PICKAXE)).toBe(true);
    for (const id of [BLOCK_ID.IRON_ORE, BLOCK_ID.IRON_PICKAXE, BLOCK_ID.DIAMOND_ORE, BLOCK_ID.CRYSTAL]) {
      expect(items.has(id)).toBe(false);
    }
  });

  it("a stone kit reaches iron ore/ingot/pickaxe and nothing at or above diamond", () => {
    const items = closure(harvestable(STONE_KIT));
    for (const id of [BLOCK_ID.IRON_ORE, BLOCK_ID.IRON_INGOT, BLOCK_ID.IRON_PICKAXE]) {
      expect(items.has(id)).toBe(true);
    }
    for (const id of [BLOCK_ID.DIAMOND_ORE, BLOCK_ID.CRYSTAL, BLOCK_ID.DIAMOND, BLOCK_ID.DIAMOND_PICKAXE]) {
      expect(items.has(id)).toBe(false);
    }
  });

  it("an iron kit reaches diamond ore/diamond/diamond pickaxe and the crystal objective", () => {
    const items = closure(harvestable(IRON_KIT));
    for (const id of [BLOCK_ID.DIAMOND_ORE, BLOCK_ID.DIAMOND, BLOCK_ID.DIAMOND_PICKAXE, BLOCK_ID.CRYSTAL]) {
      expect(items.has(id)).toBe(true);
    }
  });
});
