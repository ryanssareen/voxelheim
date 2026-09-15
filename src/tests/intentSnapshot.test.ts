import { describe, expect, it } from "vitest";
import { IntentState } from "@engine/input/snapshot";
import { clampMoveVector } from "@engine/input/intents";

/**
 * Pins the contract twelve implementation units depend on. The cursor
 * behaviour is the part worth the most scrutiny: a regression there starves a
 * consumer silently rather than throwing.
 */

describe("held intents", () => {
  it("reads true across consecutive frames without re-press", () => {
    const s = new IntentState();
    s.setHeld("moveForward", true);

    expect(s.isHeld("moveForward")).toBe(true);
    expect(s.isHeld("moveForward")).toBe(true);

    s.setHeld("moveForward", false);
    expect(s.isHeld("moveForward")).toBe(false);
  });

  it("keeps primary and secondary independent", () => {
    const s = new IntentState();
    s.setHeld("primary", true);

    expect(s.isHeld("primary")).toBe(true);
    expect(s.isHeld("secondary")).toBe(false);
  });
});

describe("edge intents", () => {
  it("is consumed once and absent on the next read", () => {
    const s = new IntentState();
    s.pushEdge("secondary", 100);

    expect(s.takeEdges("engine").map((e) => e.intent)).toEqual(["secondary"]);
    expect(s.takeEdges("engine")).toEqual([]);
  });

  it("gives every consumer the same edge exactly once", () => {
    const s = new IntentState();
    s.pushEdge("openChat", 100);

    expect(s.tookEdge("engine", "openChat")).toBe(true);
    // A second consumer must still see it — this is the starvation case.
    expect(s.tookEdge("chatUI", "openChat")).toBe(true);
    // ...but neither sees it twice.
    expect(s.tookEdge("engine", "openChat")).toBe(false);
    expect(s.tookEdge("chatUI", "openChat")).toBe(false);
  });

  it("delivers edges pushed after a consumer's last read", () => {
    const s = new IntentState();
    s.pushEdge("secondary", 100);
    s.takeEdges("engine");

    s.pushEdge("secondary", 120);
    expect(s.takeEdges("engine").map((e) => e.at)).toEqual([120]);
  });

  it("does not replay history to a consumer registering late", () => {
    const s = new IntentState();
    s.pushEdge("secondary", 100);
    s.takeEdges("engine");
    s.pushEdge("pause", 150);

    // A consumer that has never read starts from the current queue, not from
    // the beginning of time.
    expect(s.takeEdges("newcomer").map((e) => e.intent)).toEqual(["secondary", "pause"]);
  });

  it("carries distinct timestamps for two presses inside a double-tap window", () => {
    const s = new IntentState();
    s.pushEdge("jump", 1000);
    s.pushEdge("jump", 1180);

    const seen = s.takeEdges("player").filter((e) => e.intent === "jump");
    expect(seen.map((e) => e.at)).toEqual([1000, 1180]);
    expect(seen[1].at - seen[0].at).toBeLessThan(300);
  });

  it("leaves the double-tap decision to the consumer for presses outside the window", () => {
    const s = new IntentState();
    s.pushEdge("jump", 1000);
    s.pushEdge("jump", 1400);

    const gaps = s.takeEdges("player").map((e) => e.at);
    expect(gaps[1] - gaps[0]).toBeGreaterThan(300);
  });

  it("drops edges older than the retention window", () => {
    const s = new IntentState();
    s.pushEdge("secondary", 0);
    s.pushEdge("secondary", 5000);

    expect(s.takeEdges("engine").map((e) => e.at)).toEqual([5000]);
  });
});

describe("draining", () => {
  it("clears queued edges and leaves held state untouched", () => {
    const s = new IntentState();
    s.setHeld("primary", true);
    s.pushEdge("secondary", 100);

    s.drain();

    expect(s.takeEdges("engine")).toEqual([]);
    expect(s.isHeld("primary")).toBe(true);
  });

  it("discards accumulated look deltas as well as edges", () => {
    const s = new IntentState();
    s.addDelta("look", 40, -12);

    s.drain();

    // The camera-snap case: movement accumulated while a panel was open must
    // not flush into the camera on the frame it closes.
    expect(s.delta("look")).toEqual({ x: 0, y: 0 });
  });

  it("does not deliver drained edges to a consumer that never read them", () => {
    const s = new IntentState();
    s.pushEdge("secondary", 100);

    s.drain();

    expect(s.takeEdges("latecomer")).toEqual([]);
  });
});

describe("suppression", () => {
  it("reports no movement or action intents while exposing the reason", () => {
    const s = new IntentState();
    s.setHeld("moveForward", true);
    s.setHeld("primary", true);
    s.addDelta("look", 10, 10);
    s.pushEdge("secondary", 100);

    s.setSuppression("paused");

    expect(s.isHeld("moveForward")).toBe(false);
    expect(s.isHeld("primary")).toBe(false);
    expect(s.delta("look")).toEqual({ x: 0, y: 0 });
    expect(s.takeEdges("engine")).toEqual([]);
    expect(s.suppressedBy).toBe("paused");
  });

  it("restores intents when suppression lifts", () => {
    const s = new IntentState();
    s.setHeld("moveForward", true);
    s.setSuppression("chatComposing");
    expect(s.isHeld("moveForward")).toBe(false);

    s.setSuppression(null);
    expect(s.isHeld("moveForward")).toBe(true);
  });

  it("is distinguishable from simply having nothing held", () => {
    const s = new IntentState();
    expect(s.isHeld("moveForward")).toBe(false);
    expect(s.suppressedBy).toBeNull();
  });
});

describe("continuous deltas", () => {
  it("accumulates within a frame and clears between frames", () => {
    const s = new IntentState();
    s.addDelta("look", 5, 2);
    s.addDelta("look", 3, -1);

    expect(s.delta("look")).toEqual({ x: 8, y: 1 });

    s.clearDeltas();
    expect(s.delta("look")).toEqual({ x: 0, y: 0 });
  });

  it("clamps an analog move vector to unit length", () => {
    const s = new IntentState();
    s.setDelta("move", { x: 3, y: 4 });

    const v = s.delta("move");
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(1, 10);
  });

  it("leaves a sub-unit move vector untouched so walking speed is analog", () => {
    const s = new IntentState();
    s.setDelta("move", { x: 0.3, y: 0.4 });

    expect(s.delta("move")).toEqual({ x: 0.3, y: 0.4 });
  });

  it("does not clamp look deltas", () => {
    const s = new IntentState();
    s.setDelta("look", { x: 120, y: 40 });

    expect(s.delta("look")).toEqual({ x: 120, y: 40 });
  });
});

describe("clampMoveVector", () => {
  it("preserves direction when clamping", () => {
    const v = clampMoveVector({ x: 10, y: 0 });
    expect(v).toEqual({ x: 1, y: 0 });
  });

  it("passes through a zero vector without dividing by zero", () => {
    expect(clampMoveVector({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
  });
});

describe("source", () => {
  it("defaults to keyboard and mouse and switches at runtime", () => {
    const s = new IntentState();
    expect(s.source).toBe("keyboardMouse");

    s.setSource("touch");
    expect(s.source).toBe("touch");
  });
});

describe("releaseAll", () => {
  it("clears held controls and deltas, e.g. on focus loss", () => {
    const s = new IntentState();
    s.setHeld("moveForward", true);
    s.addDelta("look", 9, 9);

    s.releaseAll();

    expect(s.isHeld("moveForward")).toBe(false);
    expect(s.delta("look")).toEqual({ x: 0, y: 0 });
  });
});
