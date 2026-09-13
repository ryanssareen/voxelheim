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

beforeEach(() => {
  win = new FakeCanvas();
  doc = new FakeDocument();
  canvas = new FakeCanvas();

  vi.stubGlobal("window", win);
  vi.stubGlobal("document", doc);

  input = new InputManager();
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
});
