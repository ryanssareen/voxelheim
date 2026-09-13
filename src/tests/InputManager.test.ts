import { describe, it, expect, beforeEach, vi } from "vitest";
import { InputManager } from "@engine/InputManager";

/**
 * There is no DOM in this test environment (vitest.config.ts uses
 * `environment: "node"`), so we hand-stub the minimal window/document/canvas
 * surface InputManager touches: addEventListener/removeEventListener/
 * dispatchEvent (via the real global EventTarget, available in Node),
 * plus the handful of extra properties/methods (pointerLockElement,
 * requestPointerLock, exitPointerLock) InputManager reads or calls directly.
 */

class FakeCanvas extends EventTarget {
  requestPointerLock = vi.fn();
}

class FakeDocument extends EventTarget {
  pointerLockElement: EventTarget | null = null;
  exitPointerLock = vi.fn();
}

function makeKeyEvent(type: string, code: string, target?: EventTarget) {
  const e = new Event(type) as Event & { code: string };
  e.code = code;
  if (target !== undefined) {
    Object.defineProperty(e, "target", { value: target, configurable: true });
  }
  return e;
}

function makeMouseEvent(
  type: string,
  opts: { button?: number; movementX?: number; movementY?: number } = {},
) {
  const e = new Event(type) as Event & { button: number; movementX: number; movementY: number };
  e.button = opts.button ?? 0;
  e.movementX = opts.movementX ?? 0;
  e.movementY = opts.movementY ?? 0;
  return e;
}

/** A fake DOM element (e.g. a chat <input>) used as an event target for the "typing" guard. */
class FakeElement extends EventTarget {
  constructor(public tagName: string, public isContentEditable = false) {
    super();
  }
}

let win: FakeCanvas; // window only needs to be an EventTarget; reuse the same minimal stub
let doc: FakeDocument;
let canvas: FakeCanvas;
let input: InputManager;
/**
 * Press-timestamp clock handed to InputManager, advanced by hand in the tests
 * that care. Real time would make the double-tap window flaky.
 */
let clock: number;

beforeEach(() => {
  win = new FakeCanvas();
  doc = new FakeDocument();
  canvas = new FakeCanvas();

  vi.stubGlobal("window", win);
  vi.stubGlobal("document", doc);

  clock = 1000;
  input = new InputManager(() => clock);
  input.init(canvas as unknown as HTMLCanvasElement);
});

describe("InputManager keyboard", () => {
  it("reports a key not yet pressed as not down", () => {
    expect(input.isKeyDown("KeyW")).toBe(false);
  });

  it("tracks a key as down after keydown, and not down after keyup", () => {
    win.dispatchEvent(makeKeyEvent("keydown", "KeyW"));
    expect(input.isKeyDown("KeyW")).toBe(true);

    win.dispatchEvent(makeKeyEvent("keyup", "KeyW"));
    expect(input.isKeyDown("KeyW")).toBe(false);
  });

  it("stays down across a repeated keydown for the same key", () => {
    win.dispatchEvent(makeKeyEvent("keydown", "KeyW"));
    win.dispatchEvent(makeKeyEvent("keydown", "KeyW"));
    expect(input.isKeyDown("KeyW")).toBe(true);
  });

  it("keyup for a key that was never pressed is a no-op, not an error", () => {
    expect(() => win.dispatchEvent(makeKeyEvent("keyup", "KeyQ"))).not.toThrow();
    expect(input.isKeyDown("KeyQ")).toBe(false);
  });

  it("ignores keydown while the event target is an INPUT element", () => {
    const chatInput = new FakeElement("INPUT");
    win.dispatchEvent(makeKeyEvent("keydown", "KeyW", chatInput));
    expect(input.isKeyDown("KeyW")).toBe(false);
  });

  it("ignores keydown while the event target is a TEXTAREA element", () => {
    const textarea = new FakeElement("TEXTAREA");
    win.dispatchEvent(makeKeyEvent("keydown", "KeyW", textarea));
    expect(input.isKeyDown("KeyW")).toBe(false);
  });

  it("ignores keydown while the event target is contentEditable", () => {
    const editable = new FakeElement("DIV", true);
    win.dispatchEvent(makeKeyEvent("keydown", "KeyW", editable));
    expect(input.isKeyDown("KeyW")).toBe(false);
  });

  it("does not ignore keydown for a plain (non-typing) target", () => {
    const div = new FakeElement("DIV");
    win.dispatchEvent(makeKeyEvent("keydown", "KeyW", div));
    expect(input.isKeyDown("KeyW")).toBe(true);
  });
});

describe("InputManager mouse buttons: edge (getMouseButton) vs held (isMouseButtonDown)", () => {
  it("both report false before any mouse activity", () => {
    expect(input.isMouseButtonDown(0)).toBe(false);
    expect(input.getMouseButton()).toEqual({ left: false, right: false });
  });

  it("isMouseButtonDown is a level read: stays true across repeated reads while held", () => {
    canvas.dispatchEvent(makeMouseEvent("mousedown", { button: 0 }));
    expect(input.isMouseButtonDown(0)).toBe(true);
    expect(input.isMouseButtonDown(0)).toBe(true); // reading does not consume it
  });

  it("getMouseButton is consume-on-read: a second immediate call returns false even though the button is still physically held", () => {
    canvas.dispatchEvent(makeMouseEvent("mousedown", { button: 0 }));

    expect(input.getMouseButton()).toEqual({ left: true, right: false });
    // BUG-PRONE ASYMMETRY: the click edge was consumed, but the button is
    // still physically down per isMouseButtonDown — getMouseButton has no
    // way to report that anymore.
    expect(input.getMouseButton()).toEqual({ left: false, right: false });
    expect(input.isMouseButtonDown(0)).toBe(true);
  });

  it("right mousedown sets right edge and held state independently of left", () => {
    canvas.dispatchEvent(makeMouseEvent("mousedown", { button: 2 }));
    expect(input.getMouseButton()).toEqual({ left: false, right: true });
    expect(input.isMouseButtonDown(2)).toBe(true);
    expect(input.isMouseButtonDown(0)).toBe(false);
  });

  it("mouseup on window clears the held state for that button but does not touch the edge flag retroactively", () => {
    canvas.dispatchEvent(makeMouseEvent("mousedown", { button: 0 }));
    win.dispatchEvent(makeMouseEvent("mouseup", { button: 0 }));
    expect(input.isMouseButtonDown(0)).toBe(false);
    // The edge flag was set by mousedown and mouseup does not clear it —
    // it is only cleared by reading it via getMouseButton().
    expect(input.getMouseButton()).toEqual({ left: true, right: false });
  });

  it("mousedown+mouseup+getMouseButton then a second getMouseButton call both report false", () => {
    canvas.dispatchEvent(makeMouseEvent("mousedown", { button: 0 }));
    win.dispatchEvent(makeMouseEvent("mouseup", { button: 0 }));
    expect(input.getMouseButton()).toEqual({ left: true, right: false });
    expect(input.getMouseButton()).toEqual({ left: false, right: false });
  });

  it("an unrecognized button index (not 0 or 2) affects neither left nor right state", () => {
    canvas.dispatchEvent(makeMouseEvent("mousedown", { button: 1 }));
    expect(input.getMouseButton()).toEqual({ left: false, right: false });
    expect(input.isMouseButtonDown(0)).toBe(false);
    expect(input.isMouseButtonDown(2)).toBe(false);
  });
});

describe("InputManager mouse movement and pointer lock gating", () => {
  it("drops mousemove deltas while not pointer-locked", () => {
    doc.dispatchEvent(makeMouseEvent("mousemove", { movementX: 10, movementY: 5 }));
    expect(input.getMouseDelta()).toEqual({ dx: 0, dy: 0 });
  });

  function lockPointer() {
    doc.pointerLockElement = canvas;
    doc.dispatchEvent(new Event("pointerlockchange"));
  }

  it("accumulates mousemove deltas once pointer-locked", () => {
    lockPointer();
    expect(input.isPointerLocked()).toBe(true);

    doc.dispatchEvent(makeMouseEvent("mousemove", { movementX: 3, movementY: -2 }));
    doc.dispatchEvent(makeMouseEvent("mousemove", { movementX: 4, movementY: 1 }));

    expect(input.getMouseDelta()).toEqual({ dx: 7, dy: -1 });
  });

  it("resets the accumulator to zero after getMouseDelta is read", () => {
    lockPointer();
    doc.dispatchEvent(makeMouseEvent("mousemove", { movementX: 5, movementY: 5 }));
    expect(input.getMouseDelta()).toEqual({ dx: 5, dy: 5 });
    expect(input.getMouseDelta()).toEqual({ dx: 0, dy: 0 });
  });

  it("stops accumulating deltas again once pointer lock is lost", () => {
    lockPointer();
    doc.dispatchEvent(makeMouseEvent("mousemove", { movementX: 1, movementY: 1 }));
    input.getMouseDelta(); // drain

    // Lose the lock.
    doc.pointerLockElement = null;
    doc.dispatchEvent(new Event("pointerlockchange"));
    expect(input.isPointerLocked()).toBe(false);

    doc.dispatchEvent(makeMouseEvent("mousemove", { movementX: 99, movementY: 99 }));
    expect(input.getMouseDelta()).toEqual({ dx: 0, dy: 0 });
  });
});

describe("InputManager onPointerLockLost", () => {
  it("fires only on the locked -> unlocked transition, not on acquiring the lock", () => {
    const onLost = vi.fn();
    input.onPointerLockLost = onLost;

    doc.pointerLockElement = canvas;
    doc.dispatchEvent(new Event("pointerlockchange"));
    expect(onLost).not.toHaveBeenCalled();

    doc.pointerLockElement = null;
    doc.dispatchEvent(new Event("pointerlockchange"));
    expect(onLost).toHaveBeenCalledTimes(1);
  });

  it("does not fire if it was never locked in the first place", () => {
    const onLost = vi.fn();
    input.onPointerLockLost = onLost;

    doc.pointerLockElement = null;
    doc.dispatchEvent(new Event("pointerlockchange"));
    expect(onLost).not.toHaveBeenCalled();
  });

  it("does not throw when onPointerLockLost is null on a lock-loss transition", () => {
    doc.pointerLockElement = canvas;
    doc.dispatchEvent(new Event("pointerlockchange"));
    doc.pointerLockElement = null;
    expect(() => doc.dispatchEvent(new Event("pointerlockchange"))).not.toThrow();
  });
});

describe("InputManager dispose", () => {
  it("removes listeners so further keyboard events no longer update state", () => {
    input.dispose();
    win.dispatchEvent(makeKeyEvent("keydown", "KeyW"));
    expect(input.isKeyDown("KeyW")).toBe(false);
  });

  it("removes listeners so further mouse events no longer update state", () => {
    input.dispose();
    canvas.dispatchEvent(makeMouseEvent("mousedown", { button: 0 }));
    expect(input.isMouseButtonDown(0)).toBe(false);
    expect(input.getMouseButton()).toEqual({ left: false, right: false });
  });

  it("removes the pointerlockchange listener so onPointerLockLost no longer fires", () => {
    const onLost = vi.fn();
    input.onPointerLockLost = onLost;

    doc.pointerLockElement = canvas;
    doc.dispatchEvent(new Event("pointerlockchange"));

    input.dispose();

    doc.pointerLockElement = null;
    doc.dispatchEvent(new Event("pointerlockchange"));
    expect(onLost).not.toHaveBeenCalled();
  });

  it("calls document.exitPointerLock when disposed while locked", () => {
    doc.pointerLockElement = canvas;
    doc.dispatchEvent(new Event("pointerlockchange"));
    expect(input.isPointerLocked()).toBe(true);

    input.dispose();
    expect(doc.exitPointerLock).toHaveBeenCalledTimes(1);
  });

  it("does not call document.exitPointerLock when disposed while not locked", () => {
    input.dispose();
    expect(doc.exitPointerLock).not.toHaveBeenCalled();
  });

  it("removes listeners so further events no longer produce intents", () => {
    input.dispose();

    win.dispatchEvent(makeKeyEvent("keydown", "KeyW"));
    canvas.dispatchEvent(makeMouseEvent("mousedown", { button: 2 }));
    doc.dispatchEvent(makeMouseEvent("mousemove", { movementX: 9, movementY: 9 }));

    expect(input.intents.isHeld("moveForward")).toBe(false);
    expect(input.intents.isHeld("secondary")).toBe(false);
    expect(input.intents.takeEdges("disposed")).toEqual([]);
    expect(input.intents.delta("look")).toEqual({ x: 0, y: 0 });
  });
});

/**
 * ---------------------------------------------------------------------------
 * Intent source (U2)
 * ---------------------------------------------------------------------------
 * InputManager keeps its direct accessors (asserted above, unchanged) AND
 * feeds the intent layer. The two faces are independent on purpose: consumers
 * migrate one at a time, so both have to be correct at once.
 */

describe("InputManager intent source: keyboard held intents", () => {
  it("maps each movement key and its arrow alias to the same held intent", () => {
    const cases: ReadonlyArray<[string, string, "moveForward" | "moveBack" | "moveLeft" | "moveRight"]> = [
      ["KeyW", "ArrowUp", "moveForward"],
      ["KeyS", "ArrowDown", "moveBack"],
      ["KeyA", "ArrowLeft", "moveLeft"],
      ["KeyD", "ArrowRight", "moveRight"],
    ];

    for (const [letter, arrow, intent] of cases) {
      win.dispatchEvent(makeKeyEvent("keydown", letter));
      expect(input.intents.isHeld(intent)).toBe(true);
      win.dispatchEvent(makeKeyEvent("keyup", letter));
      expect(input.intents.isHeld(intent)).toBe(false);

      win.dispatchEvent(makeKeyEvent("keydown", arrow));
      expect(input.intents.isHeld(intent)).toBe(true);
      win.dispatchEvent(makeKeyEvent("keyup", arrow));
      expect(input.intents.isHeld(intent)).toBe(false);
    }
  });

  it("reads held across consecutive frames without a re-press", () => {
    win.dispatchEvent(makeKeyEvent("keydown", "KeyW"));
    expect(input.intents.isHeld("moveForward")).toBe(true);
    expect(input.intents.isHeld("moveForward")).toBe(true);
    expect(input.intents.isHeld("moveForward")).toBe(true);
  });

  it("keeps sprint held while either Shift is still down", () => {
    win.dispatchEvent(makeKeyEvent("keydown", "ShiftLeft"));
    win.dispatchEvent(makeKeyEvent("keydown", "ShiftRight"));
    expect(input.intents.isHeld("sprint")).toBe(true);

    // Releasing one alias must not drop the intent the other still asserts —
    // isKeyDown() gets this for free by keying on the code, not the meaning.
    win.dispatchEvent(makeKeyEvent("keyup", "ShiftLeft"));
    expect(input.intents.isHeld("sprint")).toBe(true);

    win.dispatchEvent(makeKeyEvent("keyup", "ShiftRight"));
    expect(input.intents.isHeld("sprint")).toBe(false);
  });

  it("maps both Control keys and CapsLock to sneak, OR-ed the same way", () => {
    for (const code of ["ControlLeft", "ControlRight", "CapsLock"]) {
      win.dispatchEvent(makeKeyEvent("keydown", code));
      expect(input.intents.isHeld("sneak")).toBe(true);
      win.dispatchEvent(makeKeyEvent("keyup", code));
      expect(input.intents.isHeld("sneak")).toBe(false);
    }

    win.dispatchEvent(makeKeyEvent("keydown", "ControlLeft"));
    win.dispatchEvent(makeKeyEvent("keydown", "CapsLock"));
    win.dispatchEvent(makeKeyEvent("keyup", "ControlLeft"));
    expect(input.intents.isHeld("sneak")).toBe(true);
  });

  it("treats V as a level read, matching the engine's hold-to-zoom", () => {
    win.dispatchEvent(makeKeyEvent("keydown", "KeyV"));
    expect(input.intents.isHeld("zoom")).toBe(true);
    expect(input.intents.isHeld("zoom")).toBe(true);

    win.dispatchEvent(makeKeyEvent("keyup", "KeyV"));
    expect(input.intents.isHeld("zoom")).toBe(false);
  });

  it("produces no intent while the event target is a text field", () => {
    win.dispatchEvent(makeKeyEvent("keydown", "KeyW", new FakeElement("INPUT")));
    win.dispatchEvent(makeKeyEvent("keydown", "Space", new FakeElement("TEXTAREA")));
    win.dispatchEvent(makeKeyEvent("keydown", "KeyE", new FakeElement("DIV", true)));

    expect(input.intents.isHeld("moveForward")).toBe(false);
    expect(input.intents.isHeld("jump")).toBe(false);
    expect(input.intents.takeEdges("typing")).toEqual([]);
  });

  it("does not leave an intent stuck when a swallowed keydown is followed by a keyup", () => {
    // keyup has no typing guard, so it arrives for a press the guard dropped.
    win.dispatchEvent(makeKeyEvent("keydown", "KeyW", new FakeElement("INPUT")));
    win.dispatchEvent(makeKeyEvent("keyup", "KeyW"));
    expect(input.intents.isHeld("moveForward")).toBe(false);

    // ...and the key still works normally afterwards.
    win.dispatchEvent(makeKeyEvent("keydown", "KeyW"));
    expect(input.intents.isHeld("moveForward")).toBe(true);
  });

  it("an unmapped key produces neither a held intent nor an edge", () => {
    win.dispatchEvent(makeKeyEvent("keydown", "KeyZ"));
    expect(input.intents.takeEdges("unmapped")).toEqual([]);
    expect(input.isKeyDown("KeyZ")).toBe(true); // still tracked by the direct accessor
  });

  it("keyup for a key that was never pressed does not throw", () => {
    expect(() => win.dispatchEvent(makeKeyEvent("keyup", "ShiftLeft"))).not.toThrow();
    expect(input.intents.isHeld("sprint")).toBe(false);
  });
});

describe("InputManager intent source: keyboard edges", () => {
  it("gives Space a held reading and exactly one press edge", () => {
    win.dispatchEvent(makeKeyEvent("keydown", "Space"));

    expect(input.intents.isHeld("jump")).toBe(true);
    expect(input.intents.takeEdges("player").map((e) => e.intent)).toEqual(["jump"]);
    // The edge is spent for this consumer; the hold is not.
    expect(input.intents.takeEdges("player")).toEqual([]);
    expect(input.intents.isHeld("jump")).toBe(true);
  });

  it("queues no second edge for auto-repeat keydown while the key is held", () => {
    win.dispatchEvent(makeKeyEvent("keydown", "Space"));
    win.dispatchEvent(makeKeyEvent("keydown", "Space"));
    win.dispatchEvent(makeKeyEvent("keydown", "Space"));

    expect(input.intents.takeEdges("player").filter((e) => e.intent === "jump")).toHaveLength(1);
    expect(input.intents.isHeld("jump")).toBe(true);
  });

  it("queues a second edge once the key has been released and pressed again", () => {
    win.dispatchEvent(makeKeyEvent("keydown", "Space"));
    win.dispatchEvent(makeKeyEvent("keyup", "Space"));
    clock += 180;
    win.dispatchEvent(makeKeyEvent("keydown", "Space"));

    const jumps = input.intents.takeEdges("player").filter((e) => e.intent === "jump");
    expect(jumps.map((e) => e.at)).toEqual([1000, 1180]);
  });

  it("carries timestamps a consumer can resolve a double tap from", () => {
    win.dispatchEvent(makeKeyEvent("keydown", "Space"));
    win.dispatchEvent(makeKeyEvent("keyup", "Space"));
    clock += 180;
    win.dispatchEvent(makeKeyEvent("keydown", "Space"));
    win.dispatchEvent(makeKeyEvent("keyup", "Space"));
    clock += 900;
    win.dispatchEvent(makeKeyEvent("keydown", "Space"));

    const at = input.intents.takeEdges("player").filter((e) => e.intent === "jump").map((e) => e.at);
    expect(at).toEqual([1000, 1180, 2080]);
    // Inside the 300 ms flight window, then well outside it. The layer reports
    // the timestamps; the controller decides.
    expect(at[1] - at[0]).toBeLessThan(300);
    expect(at[2] - at[1]).toBeGreaterThan(300);
  });

  it("maps each digit to its hotbar edge", () => {
    for (let i = 1; i <= 9; i++) {
      win.dispatchEvent(makeKeyEvent("keydown", `Digit${i}`));
      win.dispatchEvent(makeKeyEvent("keyup", `Digit${i}`));
    }

    expect(input.intents.takeEdges("hotbar").map((e) => e.intent)).toEqual([
      "hotbar1", "hotbar2", "hotbar3", "hotbar4", "hotbar5",
      "hotbar6", "hotbar7", "hotbar8", "hotbar9",
    ]);
  });

  it("maps the UI keys to their edges, in press order", () => {
    const expected: ReadonlyArray<[string, string]> = [
      ["KeyE", "openInventory"],
      ["KeyQ", "drop"],
      ["KeyP", "toggleCamera"],
      ["KeyT", "openChat"],
      ["KeyM", "toggleMinimap"],
      ["F3", "toggleDebug"],
      ["Escape", "pause"],
    ];

    for (const [code] of expected) {
      win.dispatchEvent(makeKeyEvent("keydown", code));
      win.dispatchEvent(makeKeyEvent("keyup", code));
    }

    expect(input.intents.takeEdges("ui").map((e) => e.intent)).toEqual(expected.map(([, i]) => i));
  });

  it("delivers every edge to each consumer exactly once", () => {
    win.dispatchEvent(makeKeyEvent("keydown", "KeyT"));

    // The frame loop reading first must not starve the chat listener.
    expect(input.intents.tookEdge("engine", "openChat")).toBe(true);
    expect(input.intents.tookEdge("chatUI", "openChat")).toBe(true);
    expect(input.intents.tookEdge("engine", "openChat")).toBe(false);
  });
});

describe("InputManager intent source: mouse buttons", () => {
  it("gives a right press exactly one secondary edge and a true level read in the same frame", () => {
    canvas.dispatchEvent(makeMouseEvent("mousedown", { button: 2 }));

    // Place reads the edge...
    expect(input.intents.tookEdge("engine", "secondary")).toBe(true);
    // ...and the eat gate, later in the same frame, still sees it held.
    expect(input.intents.isHeld("secondary")).toBe(true);
    // Only one edge, however many times the frame reads.
    expect(input.intents.tookEdge("engine", "secondary")).toBe(false);
    expect(input.intents.isHeld("secondary")).toBe(true);
  });

  it("reads left as a level every frame with no edge consumption involved", () => {
    canvas.dispatchEvent(makeMouseEvent("mousedown", { button: 0 }));

    for (let frame = 0; frame < 3; frame++) {
      input.intents.takeEdges("engine"); // the frame loop drains its cursor
      expect(input.intents.isHeld("primary")).toBe(true);
      input.endFrame();
    }

    win.dispatchEvent(makeMouseEvent("mouseup", { button: 0 }));
    expect(input.intents.isHeld("primary")).toBe(false);
  });

  it("keeps the two buttons independent", () => {
    canvas.dispatchEvent(makeMouseEvent("mousedown", { button: 0 }));
    expect(input.intents.isHeld("primary")).toBe(true);
    expect(input.intents.isHeld("secondary")).toBe(false);

    canvas.dispatchEvent(makeMouseEvent("mousedown", { button: 2 }));
    win.dispatchEvent(makeMouseEvent("mouseup", { button: 0 }));
    expect(input.intents.isHeld("primary")).toBe(false);
    expect(input.intents.isHeld("secondary")).toBe(true);
  });

  it("leaves a queued edge readable after the button has come back up", () => {
    canvas.dispatchEvent(makeMouseEvent("mousedown", { button: 2 }));
    win.dispatchEvent(makeMouseEvent("mouseup", { button: 2 }));

    expect(input.intents.isHeld("secondary")).toBe(false);
    expect(input.intents.tookEdge("engine", "secondary")).toBe(true);
  });

  it("ignores a button that is neither left nor right", () => {
    canvas.dispatchEvent(makeMouseEvent("mousedown", { button: 1 }));

    expect(input.intents.takeEdges("engine")).toEqual([]);
    expect(input.intents.isHeld("primary")).toBe(false);
    expect(input.intents.isHeld("secondary")).toBe(false);
  });

  it("queues no duplicate edge for a repeated mousedown without a mouseup", () => {
    canvas.dispatchEvent(makeMouseEvent("mousedown", { button: 2 }));
    canvas.dispatchEvent(makeMouseEvent("mousedown", { button: 2 }));

    expect(
      input.intents.takeEdges("engine").filter((e) => e.intent === "secondary"),
    ).toHaveLength(1);
  });

  it("carries a press timestamp", () => {
    clock = 4200;
    canvas.dispatchEvent(makeMouseEvent("mousedown", { button: 0 }));
    expect(input.intents.takeEdges("engine")).toEqual([{ intent: "primary", at: 4200 }]);
  });
});

describe("InputManager intent source: look deltas are not gated on pointer lock", () => {
  function lockPointer() {
    doc.pointerLockElement = canvas;
    doc.dispatchEvent(new Event("pointerlockchange"));
  }

  it("produces look deltas while unlocked, where getMouseDelta still does not (R4)", () => {
    expect(input.isPointerLocked()).toBe(false);
    doc.dispatchEvent(makeMouseEvent("mousemove", { movementX: 10, movementY: 5 }));

    expect(input.intents.delta("look")).toEqual({ x: 10, y: 5 });
    // The direct accessor keeps its gate: its consumers are written against it.
    expect(input.getMouseDelta()).toEqual({ dx: 0, dy: 0 });
  });

  it("produces look deltas while locked too, alongside the direct accessor", () => {
    lockPointer();
    doc.dispatchEvent(makeMouseEvent("mousemove", { movementX: 3, movementY: -2 }));

    expect(input.intents.delta("look")).toEqual({ x: 3, y: -2 });
    expect(input.getMouseDelta()).toEqual({ dx: 3, dy: -2 });
  });

  it("keeps producing look deltas after pointer lock is lost", () => {
    lockPointer();
    doc.pointerLockElement = null;
    doc.dispatchEvent(new Event("pointerlockchange"));

    doc.dispatchEvent(makeMouseEvent("mousemove", { movementX: 7, movementY: 7 }));
    expect(input.intents.delta("look")).toEqual({ x: 7, y: 7 });
  });

  it("accumulates several moves inside one frame and reads without consuming", () => {
    doc.dispatchEvent(makeMouseEvent("mousemove", { movementX: 3, movementY: -2 }));
    doc.dispatchEvent(makeMouseEvent("mousemove", { movementX: 4, movementY: 1 }));

    expect(input.intents.delta("look")).toEqual({ x: 7, y: -1 });
    expect(input.intents.delta("look")).toEqual({ x: 7, y: -1 });
  });

  it("endFrame clears the delta without touching held state or queued edges", () => {
    canvas.dispatchEvent(makeMouseEvent("mousedown", { button: 0 }));
    doc.dispatchEvent(makeMouseEvent("mousemove", { movementX: 5, movementY: 5 }));

    input.endFrame();

    expect(input.intents.delta("look")).toEqual({ x: 0, y: 0 });
    expect(input.intents.isHeld("primary")).toBe(true);
    expect(input.intents.tookEdge("engine", "primary")).toBe(true);
  });

  it("a zero-movement event leaves the delta alone", () => {
    doc.dispatchEvent(makeMouseEvent("mousemove", { movementX: 0, movementY: 0 }));
    expect(input.intents.delta("look")).toEqual({ x: 0, y: 0 });
  });
});
