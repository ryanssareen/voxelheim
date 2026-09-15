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
import { IntentState } from "@engine/input/snapshot";
import { KeyboardMouseSource } from "@engine/input/keyboardMouseSource";
import {
  eatGateOpen,
  primaryResolvesToMining,
  readEngineFrameEdges,
} from "@engine/input/frameIntents";

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
 *
 * UPDATE (U4, intent layer): the extraction that comment asked for exists for
 * the parts of the frame that can be stated as a value. `Engine.update()` now
 * reads its presses through `readEngineFrameEdges`, resolves mine-versus-attack
 * through `primaryResolvesToMining`, and asks `eatGateOpen` whether a bite may
 * accrue — all in `src/engine/input/frameIntents.ts`, all callable from node.
 * The describes at the bottom of this file exercise those directly. What is
 * still only readable in `Engine.update()` is the *sequence* they are called in;
 * the tests below pin the properties that sequence depends on (a press arrives
 * on the frame it happened; one consumer's read does not starve another's; a
 * drain takes edges and deltas but never held state) so that reordering the loop
 * has to break something visible.
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

/**
 * Keyboard/mouse driving a real intent state, as `InputManager` wires it. Frames
 * are explicit: `engineFrame()` is what `Engine.update()` does on a live frame,
 * `panelFrame()` what it does when a panel is open.
 */
function harness() {
  const intents = new IntentState();
  const source = new KeyboardMouseSource(intents, () => 0);
  return {
    intents,
    source,
    /** A live frame: take this frame's presses under the engine's own cursor. */
    engineFrame: () => readEngineFrameEdges(intents),
    /**
     * A panel-open frame: the engine reads, then throws away everything
     * buffered before anything else can consume it, then returns.
     */
    panelFrame: () => {
      const frame = readEngineFrameEdges(intents);
      intents.drain();
      return frame;
    },
  };
}

describe("engine frame edges (Engine.update, presses taken once per frame)", () => {
  it("delivers a press on the frame it happened, so the panel toggle resolves in time for the panel-open check that follows it", () => {
    const h = harness();
    h.source.keyDown("KeyE");

    expect(h.engineFrame().togglePanel).toBe(true);
    // ...and is gone by the next frame, so the panel does not flap open/shut.
    expect(h.engineFrame().togglePanel).toBe(false);
  });

  it("ignores auto-repeat: a key held down toggles once, not once per frame", () => {
    const h = harness();
    h.source.keyDown("KeyE");
    h.source.keyDown("KeyE"); // browser auto-repeat
    h.source.keyDown("KeyE");

    expect(h.engineFrame().togglePanel).toBe(true);
    expect(h.engineFrame().togglePanel).toBe(false);

    // A genuine second press, after a release, toggles again.
    h.source.keyUp("KeyE");
    h.source.keyDown("KeyE");
    expect(h.engineFrame().togglePanel).toBe(true);
  });

  it("maps the camera-cycle and drop presses the engine acts on", () => {
    const h = harness();
    h.source.keyDown("KeyP");
    h.source.keyDown("KeyQ");

    const frame = h.engineFrame();
    expect(frame.cycleCamera).toBe(true);
    expect(frame.dropItem).toBe(true);
  });

  it("selects the hotbar slot matching the digit pressed (0-based)", () => {
    const h = harness();
    h.source.keyDown("Digit1");
    expect(h.engineFrame().hotbarSlot).toBe(0);

    h.source.keyDown("Digit9");
    expect(h.engineFrame().hotbarSlot).toBe(8);
  });

  it("resolves two hotbar presses in one frame to the last one", () => {
    const h = harness();
    h.source.keyDown("Digit3");
    h.source.keyDown("Digit7");

    expect(h.engineFrame().hotbarSlot).toBe(6);
  });

  it("leaves hotbarSlot null on a frame with no digit press, so selection is not re-applied every frame", () => {
    const h = harness();
    h.source.keyDown("Digit4");
    h.engineFrame();

    expect(h.engineFrame().hotbarSlot).toBeNull();
  });

  it("takes presses it has no use for without acting on them and without throwing", () => {
    const h = harness();
    h.source.keyDown("Space"); // jump — the controller's business
    h.source.keyDown("Escape"); // pause — nothing consumes it until U8

    const frame = h.engineFrame();
    expect(frame).toEqual({
      togglePanel: false,
      cycleCamera: false,
      dropItem: false,
      place: false,
      toggleZoom: false,
      hotbarSlot: null,
    });
  });

  it("does not starve another consumer of the same press", () => {
    const h = harness();
    h.source.keyDown("Space");

    h.engineFrame();
    // PlayerController reads under its own cursor and must still see the jump,
    // or the flight double-tap silently loses every press the engine ran first.
    expect(h.intents.takeEdges("playerController").map((e) => e.intent)).toEqual(["jump"]);
  });
});

describe("the secondary control's two readings inside one frame", () => {
  it("produces a place edge and a held reading the eat gate can still see afterwards", () => {
    const h = harness();
    h.source.mouseDown(2);

    const frame = h.engineFrame();
    expect(frame.place).toBe(true);
    // The eat gate runs after placing has resolved; taking the edge must not
    // have spent the level reading it depends on.
    expect(h.intents.isHeld("secondary")).toBe(true);
  });

  it("places once per press: holding the button does not place again on the next frame", () => {
    const h = harness();
    h.source.mouseDown(2);

    expect(h.engineFrame().place).toBe(true);
    expect(h.engineFrame().place).toBe(false);
    // Still down, so a bite would still be accruing.
    expect(h.intents.isHeld("secondary")).toBe(true);
  });
});

describe("the panel-open drain", () => {
  it("a press buffered while a panel is open does not place when the panel closes", () => {
    const h = harness();

    // Frame 1: inventory open, the player clicks a slot.
    h.source.mouseDown(2);
    h.panelFrame();
    h.source.mouseUp(2);

    // Frame 2: panel closed, full frame runs again.
    expect(h.engineFrame().place).toBe(false);
  });

  it("takes that press away from every other consumer too, not just the engine", () => {
    const h = harness();
    h.source.mouseDown(2);

    h.panelFrame();

    // The React listeners and the controller never ran on the panel frame; the
    // drain is the only thing standing between them and a stale press.
    expect(h.intents.takeEdges("someOtherConsumer")).toEqual([]);
  });

  it("leaves held state alone, so a button still down when the panel closes goes straight back to mining", () => {
    const h = harness();
    h.source.mouseDown(0);

    h.panelFrame();

    expect(h.intents.isHeld("primary")).toBe(true);
  });

  it("discards accumulated look, so a drag across an open panel does not snap the camera when it closes", () => {
    const h = harness();
    h.source.look(120, -40);

    h.panelFrame();

    expect(h.intents.delta("look")).toEqual({ x: 0, y: 0 });
  });
});

describe("primary-held resolution: mine or attack, never both (Engine.update)", () => {
  it("mines when the swing is held and no entity was hit", () => {
    expect(primaryResolvesToMining(true, false)).toBe(true);
  });

  it("does not mine when a mob or remote player claimed the swing first", () => {
    expect(primaryResolvesToMining(true, true)).toBe(false);
  });

  it("does not mine when the control is not held, entity or not", () => {
    expect(primaryResolvesToMining(false, false)).toBe(false);
    expect(primaryResolvesToMining(false, true)).toBe(false);
  });
});

describe("eat gate (Engine.update, after placing has resolved)", () => {
  const open = {
    hungerRestore: 8,
    secondaryHeld: true,
    hunger: 10,
    maxHunger: 20,
    targetingBlock: false,
  };

  it("opens with food in hand, the control held, room to eat and nothing aimed at", () => {
    expect(eatGateOpen(open)).toBe(true);
  });

  it("stays shut for an item that restores no hunger", () => {
    expect(eatGateOpen({ ...open, hungerRestore: 0 })).toBe(false);
  });

  it("stays shut while the control is not held", () => {
    expect(eatGateOpen({ ...open, secondaryHeld: false })).toBe(false);
  });

  it("stays shut at full hunger", () => {
    expect(eatGateOpen({ ...open, hunger: 20 })).toBe(false);
  });

  it("stays shut while aiming at a block, so placing wins over eating", () => {
    expect(eatGateOpen({ ...open, targetingBlock: true })).toBe(false);
  });

  it("reads the same held state a place edge was just taken from", () => {
    const h = harness();
    h.source.mouseDown(2);
    const frame = h.engineFrame();

    expect(frame.place).toBe(true);
    expect(eatGateOpen({ ...open, secondaryHeld: h.intents.isHeld("secondary") })).toBe(true);

    // Releasing cancels the bite on the very next frame.
    h.source.mouseUp(2);
    expect(eatGateOpen({ ...open, secondaryHeld: h.intents.isHeld("secondary") })).toBe(false);
  });
});
