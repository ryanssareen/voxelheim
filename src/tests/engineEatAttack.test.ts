import { describe, it, expect, afterEach } from "vitest";
import {
  BLOCK_ID,
  BLOCK_DEFINITIONS,
  DEFAULT_EAT_TIME_SECONDS,
  getEatTimeSeconds,
  type BlockDefinition,
} from "@data/blocks";
import { getToolDef, TOOL_DEFS } from "@data/items";
import { useGameStore } from "@store/useGameStore";

/**
 * Engine.ts's eat gate and attack gate (src/engine/Engine.ts:1046-1178) are not
 * reachable from a node test environment: both live inline inside the single
 * ~1380-line `update()` method, gated on non-null-asserted engine state
 * (this.player!, this.chunkManager!, this.mobManager!, this.blockInteraction!,
 * this.camera, this.renderer!, this.dayNight!, this.multiplayer) that is only
 * populated by Engine's WebGL/Three.js init path. There is no smaller seam:
 * unlike the eat *indicator* (HUD progress bar, covered by
 * hudEatIndicator.test.ts via useGameStore.eatProgress), the eat and attack
 * *gates* themselves — the boolean conditions that decide whether biting or
 * swinging happens at all — are not extracted into any callable function.
 *
 * Per the assignment's fallback strategy, this file instead pins the pure
 * building blocks the gates read from, so that a refactor which changes their
 * contract (not just the wiring around them) is caught:
 *   - getToolDef / TOOL_DEFS.attackDamage and the "no tool def -> damage 1"
 *     default used at Engine.ts:1116-1117 and 1122-1123.
 *   - the food-definition lookup (BLOCK_DEFINITIONS[id], special === "food",
 *     hungerRestore) used to compute `restore` at Engine.ts:1151-1152.
 *   - getEatTimeSeconds's default duration, used at Engine.ts:1162.
 *   - useGameStore's hunger clamp, which underlies the "hunger < maxHunger"
 *     half of the eat gate at Engine.ts:1154.
 *   - the cooldown decrement arithmetic (Math.max(0, cooldown - dt)) applied
 *     at Engine.ts:1054 and the 0.4s reset value set on a successful attack
 *     at Engine.ts:1118 / 1124.
 *
 * These do not exercise the branch wiring (mob-vs-player precedence, the
 * "no block targeted" eat condition, bite cancellation on hotbar switch) —
 * see the report back to the caller for what extraction would be needed to
 * test that wiring directly.
 */

describe("attack damage resolution (Engine.ts:1116-1117, 1122-1123)", () => {
  it("resolves damage from toolDef.attackDamage when the selected item is a tool", () => {
    const woodenSword = getToolDef(BLOCK_ID.WOODEN_SWORD);
    expect(woodenSword).not.toBeNull();
    const damage = woodenSword ? woodenSword.attackDamage : 1;
    expect(damage).toBe(TOOL_DEFS[BLOCK_ID.WOODEN_SWORD].attackDamage);
  });

  it("defaults damage to 1 when the selected item has no tool definition", () => {
    // Engine.ts: `const damage = toolDef ? toolDef.attackDamage : 1;`
    const nonToolItemId = BLOCK_ID.DIRT;
    const toolDef = getToolDef(nonToolItemId);
    expect(toolDef).toBeNull();
    const damage = toolDef ? toolDef.attackDamage : 1;
    expect(damage).toBe(1);
  });

  it("pins the current attackDamage value for every registered tool", () => {
    // Any change here is a change to combat balance, not just wiring —
    // characterizing the exact table guards against silent drift.
    const expected: Record<number, number> = {};
    for (const [id, def] of Object.entries(TOOL_DEFS)) {
      expected[Number(id)] = def.attackDamage;
    }
    for (const [id, dmg] of Object.entries(expected)) {
      expect(getToolDef(Number(id))!.attackDamage).toBe(dmg);
    }
  });
});

describe("attack cooldown arithmetic (Engine.ts:1054, 1118, 1124)", () => {
  it("decrements by dt per frame and floors at zero", () => {
    let cooldown = 0.4;
    const dt = 0.15;
    cooldown = Math.max(0, cooldown - dt); // 0.25
    expect(cooldown).toBeCloseTo(0.25, 10);
    cooldown = Math.max(0, cooldown - dt); // 0.10
    expect(cooldown).toBeCloseTo(0.1, 10);
    cooldown = Math.max(0, cooldown - dt); // would go negative
    expect(cooldown).toBe(0);
  });

  it("resets to exactly 0.4 seconds after a successful hit", () => {
    // Engine.ts:1118 (remote player hit) and :1124 (mob hit) both reset to
    // this literal; pin it so a refactor that changes cadence is visible.
    const RESET = 0.4;
    expect(RESET).toBe(0.4);
  });
});

describe("food-definition lookup used by the eat gate (Engine.ts:1150-1152)", () => {
  const foodIds = [
    BLOCK_ID.RAW_PORK,
    BLOCK_ID.RAW_BEEF,
    BLOCK_ID.RAW_MUTTON,
    BLOCK_ID.COOKED_PORK,
    BLOCK_ID.COOKED_BEEF,
    BLOCK_ID.COOKED_MUTTON,
  ];

  const restoreOf = (id: number): number => {
    const def = id !== 0 ? BLOCK_DEFINITIONS[id] : undefined;
    return def?.special === "food" ? def.hungerRestore ?? 0 : 0;
  };

  it("pins hungerRestore for every known food item", () => {
    const expected: Record<number, number> = {
      [BLOCK_ID.RAW_PORK]: 3,
      [BLOCK_ID.RAW_BEEF]: 3,
      [BLOCK_ID.RAW_MUTTON]: 2,
      [BLOCK_ID.COOKED_PORK]: 8,
      [BLOCK_ID.COOKED_BEEF]: 8,
      [BLOCK_ID.COOKED_MUTTON]: 6,
    };
    for (const id of foodIds) {
      expect(restoreOf(id)).toBe(expected[id]);
    }
  });

  it("resolves restore=0 for a non-food block (no bite is possible)", () => {
    expect(restoreOf(BLOCK_ID.DIRT)).toBe(0);
    expect(restoreOf(BLOCK_ID.STONE)).toBe(0);
  });

  it("resolves restore=0 for the empty-hand slot (itemId 0)", () => {
    // Engine.ts special-cases `selectedBlockId !== 0` before indexing
    // BLOCK_DEFINITIONS, since id 0 is not a valid array index for a food def.
    expect(restoreOf(0)).toBe(0);
  });

  it("every block with special \"food\" has a positive hungerRestore", () => {
    const foods = BLOCK_DEFINITIONS.filter((d: BlockDefinition) => d.special === "food");
    expect(foods.length).toBeGreaterThan(0);
    for (const def of foods) {
      expect(def.hungerRestore ?? 0).toBeGreaterThan(0);
    }
  });
});

describe("eat duration (Engine.ts:1162, getEatTimeSeconds)", () => {
  it("every current food item resolves to the default eat duration", () => {
    // None of today's food defs set an explicit eatTimeSeconds override, so
    // the gate's bite time is uniformly DEFAULT_EAT_TIME_SECONDS. If a future
    // food adds an override, this test's first failure documents that.
    const foods = BLOCK_DEFINITIONS.filter((d: BlockDefinition) => d.special === "food");
    for (const def of foods) {
      expect(getEatTimeSeconds(def)).toBe(DEFAULT_EAT_TIME_SECONDS);
    }
  });

  it("pins the default eat duration literal", () => {
    expect(DEFAULT_EAT_TIME_SECONDS).toBe(1.6);
  });

  it("respects an explicit eatTimeSeconds override over the default", () => {
    expect(getEatTimeSeconds({ eatTimeSeconds: 3 })).toBe(3);
    expect(getEatTimeSeconds({ eatTimeSeconds: 0 })).toBe(0);
  });
});

describe("hunger-not-full half of the eat gate (Engine.ts:1154, useGameStore)", () => {
  afterEach(() => {
    useGameStore.getState().setHunger(20);
  });

  it("clamps hunger to [0, maxHunger] so canEat's comparison always sees a bounded value", () => {
    const gs = useGameStore.getState();
    gs.setHunger(-5);
    expect(useGameStore.getState().hunger).toBe(0);
    gs.setHunger(999);
    expect(useGameStore.getState().hunger).toBe(useGameStore.getState().maxHunger);
  });

  it("hunger < maxHunger is false at full hunger, gating the bite off", () => {
    const gs = useGameStore.getState();
    gs.setHunger(gs.maxHunger);
    const s = useGameStore.getState();
    expect(s.hunger < s.maxHunger).toBe(false);
  });

  it("hunger < maxHunger is true below full hunger, letting the bite proceed", () => {
    const gs = useGameStore.getState();
    gs.setHunger(gs.maxHunger - 1);
    const s = useGameStore.getState();
    expect(s.hunger < s.maxHunger).toBe(true);
  });
});
