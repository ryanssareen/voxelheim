import { describe, it, expect, beforeEach, vi } from "vitest";
import { InputManager } from "@engine/InputManager";
import { IntentState } from "@engine/input/snapshot";
import { TouchSource, type TouchPoint } from "@engine/input/touchSource";

/**
 * Touch input source (U6).
 *
 * Two levels, for two different reasons.
 *
 * The first half drives {@link TouchSource} directly against an
 * {@link IntentState}, because the gesture grammar is where the behaviour is:
 * which contact becomes the joystick, when a still finger becomes a mine, and
 * when a sliding one stops being one. Those are decisions, and a decision is
 * worth a test at the level it is made.
 *
 * The second half goes through {@link InputManager}, because the wiring has its
 * own failure modes that the grammar cannot see — the browser's compatibility
 * mouse burst arriving as a second, duplicate press, and the gesture-suppression
 * styles without which every tap waits ~300 ms for a double-tap that is not
 * coming.
 *
 * There is no DOM here (`vitest.config.ts` uses `environment: "node"`), so the
 * window/document/canvas surface is hand-stubbed exactly as in
 * `src/tests/InputManager.test.ts`, extended with the `style` and `clientWidth`
 * the touch path reads.
 */

const SURFACE_WIDTH = 1000;
/** With the default 0.4 left-region fraction, the joystick region is x < 400. */
const IN_LEFT_REGION = 100;
const ON_PLAY_SURFACE = 700;

// ---------------------------------------------------------------------------
// Gesture grammar
// ---------------------------------------------------------------------------

describe("TouchSource gestures", () => {
  let state: IntentState;
  let source: TouchSource;
  /** Hold-threshold clock, advanced by hand. Real time would make this flaky. */
  let clock: number;

  beforeEach(() => {
    state = new IntentState();
    clock = 1000;
    source = new TouchSource(state, () => clock);
    source.setSurfaceWidth(SURFACE_WIDTH);
  });

  const start = (id: number, x: number, y: number) => source.touchStart([{ id, x, y }]);
  const move = (id: number, x: number, y: number) => source.touchMove([{ id, x, y }]);
  const end = (id: number, x: number, y: number) => source.touchEnd([{ id, x, y }]);
  const edges = (consumer: string) => state.takeEdges(consumer).map((e) => e.intent);

  describe("play surface: tap places", () => {
    it("emits one place edge and no primary-held for a tap under both thresholds", () => {
      start(1, ON_PLAY_SURFACE, 300);
      clock += 50;
      end(1, ON_PLAY_SURFACE, 300);

      expect(edges("engine")).toEqual(["secondary"]);
      expect(state.isHeld("primary")).toBe(false);
    });

    it("still taps when the thumb rolls a few px, under the look threshold", () => {
      start(1, ON_PLAY_SURFACE, 300);
      clock += 40;
      move(1, ON_PLAY_SURFACE + 4, 303);
      clock += 40;
      end(1, ON_PLAY_SURFACE + 4, 303);

      expect(edges("engine")).toEqual(["secondary"]);
      // The slop is not looked with either — a tap must not nudge the camera.
      expect(state.delta("look")).toEqual({ x: 0, y: 0 });
    });

    it("places through the secondary *edge* only, never the level read the eat gate consumes", () => {
      start(1, ON_PLAY_SURFACE, 300);
      clock += 50;
      end(1, ON_PLAY_SURFACE, 300);

      expect(edges("engine")).toEqual(["secondary"]);
      // R26/U12 gives eating its own longer hold with a cancellable indicator.
      // A tap smuggling a bite in would eat the player's food on every place.
      expect(state.isHeld("secondary")).toBe(false);
    });

    it("carries the press timestamp on the place edge", () => {
      clock = 4200;
      start(1, ON_PLAY_SURFACE, 300);
      clock = 4260;
      end(1, ON_PLAY_SURFACE, 300);

      expect(state.takeEdges("engine")).toEqual([{ intent: "secondary", at: 4260 }]);
    });
  });

  describe("play surface: hold mines", () => {
    it("holds primary once the threshold passes, and keeps holding it", () => {
      start(1, ON_PLAY_SURFACE, 300);
      expect(state.isHeld("primary")).toBe(false);

      clock += 200;
      source.endFrame();
      expect(state.isHeld("primary")).toBe(true);

      // Level read: still true on later frames with no further touch events,
      // which is the whole point — a still finger emits nothing.
      for (let frame = 0; frame < 3; frame++) {
        clock += 16;
        state.clearDeltas();
        source.endFrame();
        expect(state.isHeld("primary")).toBe(true);
      }
    });

    it("does not hold before the threshold", () => {
      start(1, ON_PLAY_SURFACE, 300);
      clock += 199;
      source.endFrame();

      expect(state.isHeld("primary")).toBe(false);
      expect(source.isMining()).toBe(false);
    });

    it("releases primary on lift and emits no place edge", () => {
      start(1, ON_PLAY_SURFACE, 300);
      clock += 400;
      source.endFrame();
      expect(source.isMining()).toBe(true);

      end(1, ON_PLAY_SURFACE, 300);
      expect(state.isHeld("primary")).toBe(false);
      expect(edges("engine")).toEqual([]);
    });

    it("promotes during a sequence of sub-threshold moves, not only on a frame boundary", () => {
      start(1, ON_PLAY_SURFACE, 300);
      clock += 120;
      move(1, ON_PLAY_SURFACE + 2, 301);
      expect(state.isHeld("primary")).toBe(false);

      clock += 120;
      move(1, ON_PLAY_SURFACE + 3, 302);
      expect(state.isHeld("primary")).toBe(true);
    });
  });

  describe("play surface: long hold eats", () => {
    /**
     * The eat gate is a *level* read of `secondary`, and before this the touch
     * source produced no such level anywhere: its only hold asserted `primary`
     * and its only `secondary` signal was the tap edge. Food was therefore
     * unreachable on a phone — not broken, absent, and silently so, since a
     * closed gate looks exactly like a player who is not hungry.
     */
    it("asserts secondary once the longer threshold passes, alongside primary", () => {
      start(1, ON_PLAY_SURFACE, 300);

      clock += 200;
      source.endFrame();
      expect(state.isHeld("primary")).toBe(true);
      expect(state.isHeld("secondary")).toBe(false);

      clock += 300;
      source.endFrame();
      expect(state.isHeld("primary")).toBe(true);
      expect(state.isHeld("secondary")).toBe(true);
    });

    it("keeps asserting it on later frames with no further touch events", () => {
      start(1, ON_PLAY_SURFACE, 300);
      clock += 500;
      source.endFrame();

      for (let frame = 0; frame < 3; frame++) {
        clock += 16;
        state.clearDeltas();
        source.endFrame();
        expect(state.isHeld("secondary")).toBe(true);
      }
    });

    it("never pushes a place edge off the back of a bite", () => {
      start(1, ON_PLAY_SURFACE, 300);
      clock += 600;
      source.endFrame();
      end(1, ON_PLAY_SURFACE, 300);

      // `secondary` held and `secondary` edge are different readings of the
      // same control. A hold must produce only the first, or every bite would
      // place a block when the finger came off.
      expect(edges("engine")).toEqual([]);
    });

    it("cancels the bite on lift — the gate closes with the finger", () => {
      start(1, ON_PLAY_SURFACE, 300);
      clock += 600;
      source.endFrame();
      expect(state.isHeld("secondary")).toBe(true);

      end(1, ON_PLAY_SURFACE, 300);
      expect(state.isHeld("secondary")).toBe(false);
      expect(state.isHeld("primary")).toBe(false);
    });

    it("cancels the bite when the browser takes the contact away", () => {
      start(1, ON_PLAY_SURFACE, 300);
      clock += 600;
      source.endFrame();

      source.touchCancel([{ id: 1, x: ON_PLAY_SURFACE, y: 300 }]);
      expect(state.isHeld("secondary")).toBe(false);
      expect(state.isHeld("primary")).toBe(false);
    });

    it("cancels the bite when the hold starts sliding into a look", () => {
      start(1, ON_PLAY_SURFACE, 300);
      clock += 600;
      source.endFrame();
      expect(state.isHeld("secondary")).toBe(true);

      move(1, ON_PLAY_SURFACE + 40, 300);
      expect(state.isHeld("secondary")).toBe(false);
      expect(state.isHeld("primary")).toBe(false);
    });

    it("does not arm on a contact that converted to a look before the threshold", () => {
      start(1, ON_PLAY_SURFACE, 300);
      clock += 50;
      move(1, ON_PLAY_SURFACE + 40, 300);

      clock += 600;
      source.endFrame();
      expect(state.isHeld("secondary")).toBe(false);
    });

    it("releaseAll drops the bite with everything else", () => {
      start(1, ON_PLAY_SURFACE, 300);
      clock += 600;
      source.endFrame();

      source.releaseAll();
      expect(state.isHeld("secondary")).toBe(false);
      expect(state.isHeld("primary")).toBe(false);
    });

    it("re-arms on a fresh hold after the previous one was released", () => {
      start(1, ON_PLAY_SURFACE, 300);
      clock += 600;
      source.endFrame();
      end(1, ON_PLAY_SURFACE, 300);
      expect(state.isHeld("secondary")).toBe(false);

      start(2, ON_PLAY_SURFACE, 300);
      clock += 600;
      source.endFrame();
      expect(state.isHeld("secondary")).toBe(true);
    });
  });

  describe("play surface: drag looks", () => {
    it("cancels a hold in progress and looks instead", () => {
      start(1, ON_PLAY_SURFACE, 300);
      clock += 300;
      source.endFrame();
      expect(state.isHeld("primary")).toBe(true);

      move(1, ON_PLAY_SURFACE + 40, 300);

      // Break progress stops accruing the moment the level read goes false.
      expect(state.isHeld("primary")).toBe(false);
      expect(source.isMining()).toBe(false);
      // The movement that crossed the threshold is the tap's slop, not a look.
      expect(state.delta("look")).toEqual({ x: 0, y: 0 });

      move(1, ON_PLAY_SURFACE + 60, 310);
      expect(state.delta("look")).toEqual({ x: 20, y: 10 });
    });

    it("accumulates several moves within one frame", () => {
      start(1, ON_PLAY_SURFACE, 300);
      move(1, ON_PLAY_SURFACE + 20, 300); // crosses the threshold
      move(1, ON_PLAY_SURFACE + 25, 305);
      move(1, ON_PLAY_SURFACE + 30, 315);

      expect(state.delta("look")).toEqual({ x: 10, y: 15 });
    });

    it("does not place when a drag lifts", () => {
      start(1, ON_PLAY_SURFACE, 300);
      clock += 40;
      move(1, ON_PLAY_SURFACE + 30, 300);
      clock += 40;
      end(1, ON_PLAY_SURFACE + 30, 300);

      expect(edges("engine")).toEqual([]);
    });

    it("never re-arms as a hold once it has become a look", () => {
      start(1, ON_PLAY_SURFACE, 300);
      move(1, ON_PLAY_SURFACE + 40, 300);

      clock += 5000;
      source.endFrame();
      expect(state.isHeld("primary")).toBe(false);
    });

    it("looks in both directions, sign-preserving", () => {
      start(1, ON_PLAY_SURFACE, 300);
      move(1, ON_PLAY_SURFACE - 40, 300); // leftward crosses the threshold
      move(1, ON_PLAY_SURFACE - 60, 280);

      expect(state.delta("look")).toEqual({ x: -20, y: -20 });
    });
  });

  describe("movement joystick", () => {
    it("anchors where the thumb lands and reads zero until it slides", () => {
      start(5, IN_LEFT_REGION, 500);

      expect(state.delta("move")).toEqual({ x: 0, y: 0 });
      expect(source.getJoystick()).toMatchObject({ anchorX: IN_LEFT_REGION, anchorY: 500 });
    });

    it("reads full deflection at the configured radius", () => {
      start(5, IN_LEFT_REGION, 500);
      move(5, IN_LEFT_REGION + 56, 500);

      expect(state.delta("move")).toEqual({ x: 1, y: 0 });
    });

    it("walks forward when the thumb slides up the screen", () => {
      start(5, IN_LEFT_REGION, 500);
      move(5, IN_LEFT_REGION, 444);

      // Screen Y grows downward; `move.y` pushes forward.
      expect(state.delta("move")).toEqual({ x: 0, y: 1 });
    });

    it("walks back when the thumb slides down the screen", () => {
      start(5, IN_LEFT_REGION, 500);
      move(5, IN_LEFT_REGION, 556);

      expect(state.delta("move")).toEqual({ x: 0, y: -1 });
    });

    it("never exceeds magnitude 1 however far the thumb drags", () => {
      start(5, IN_LEFT_REGION, 500);

      for (const [dx, dy] of [
        [560, 0],
        [0, -560],
        [560, -560],
        [-2000, 2000],
      ]) {
        move(5, IN_LEFT_REGION + dx, 500 + dy);
        const v = state.delta("move");
        expect(Math.hypot(v.x, v.y)).toBeLessThanOrEqual(1 + 1e-9);
      }

      // ...and a full diagonal is a unit vector, not 1 on each axis: feeding a
      // larger magnitude through would change per-frame displacement, which
      // sub-stepping and auto-jump both derive from.
      move(5, IN_LEFT_REGION + 560, 500 - 560);
      const diagonal = state.delta("move");
      expect(diagonal.x).toBeCloseTo(Math.SQRT1_2, 6);
      expect(diagonal.y).toBeCloseTo(Math.SQRT1_2, 6);
    });

    it("survives the frame's delta clear with no further touch events", () => {
      start(5, IN_LEFT_REGION, 500);
      move(5, IN_LEFT_REGION + 56, 500);

      // What the frame loop does: the keyboard source clears every delta, then
      // the touch source re-asserts the one that is a level reading.
      state.clearDeltas();
      source.endFrame();

      expect(state.delta("move")).toEqual({ x: 1, y: 0 });
    });

    it("zeroes movement and drops the stick on lift", () => {
      start(5, IN_LEFT_REGION, 500);
      move(5, IN_LEFT_REGION + 56, 500);
      end(5, IN_LEFT_REGION + 56, 500);

      expect(state.delta("move")).toEqual({ x: 0, y: 0 });
      expect(source.getJoystick()).toBeNull();

      source.endFrame();
      expect(state.delta("move")).toEqual({ x: 0, y: 0 });
    });

    it("never looks or places, however far it drags", () => {
      start(5, IN_LEFT_REGION, 500);
      clock += 400;
      source.endFrame();
      move(5, IN_LEFT_REGION + 200, 200);
      end(5, IN_LEFT_REGION + 200, 200);

      expect(state.delta("look")).toEqual({ x: 0, y: 0 });
      expect(edges("engine")).toEqual([]);
      expect(state.isHeld("primary")).toBe(false);
    });

    it("leaves a contact on the right of the surface to the play surface", () => {
      start(1, ON_PLAY_SURFACE, 300);
      expect(source.getJoystick()).toBeNull();
    });

    it("anchors nothing while the surface width is unknown", () => {
      const blank = new TouchSource(state, () => clock);
      blank.touchStart([{ id: 1, x: 5, y: 500 }]);

      // Safe degradation: look/mine/place keep working, walking does not, which
      // is visible at once — where the opposite default would be a joystick
      // swallowing taps across the whole screen.
      expect(blank.getJoystick()).toBeNull();
      clock += 50;
      blank.touchEnd([{ id: 1, x: 5, y: 500 }]);
      expect(edges("blank")).toEqual(["secondary"]);
    });
  });

  describe("simultaneous contacts (R12)", () => {
    it("drives movement, look and a button at once without interference", () => {
      source.touchStart([
        { id: 1, x: IN_LEFT_REGION, y: 500 },
        { id: 2, x: ON_PLAY_SURFACE, y: 300 },
      ]);
      source.holdButton("jump", true);

      move(1, IN_LEFT_REGION + 56, 500);
      clock += 300;
      source.endFrame();

      expect(state.delta("move")).toEqual({ x: 1, y: 0 });
      expect(state.isHeld("primary")).toBe(true); // the play contact held still
      expect(state.isHeld("jump")).toBe(true);

      // The play contact converting to a look touches neither of the others.
      move(2, ON_PLAY_SURFACE + 40, 300);
      move(2, ON_PLAY_SURFACE + 55, 320);

      expect(state.delta("look")).toEqual({ x: 15, y: 20 });
      expect(state.delta("move")).toEqual({ x: 1, y: 0 });
      expect(state.isHeld("jump")).toBe(true);
      expect(state.isHeld("primary")).toBe(false); // converted, as it should

      // ...and lifting the joystick leaves the look and the button alone.
      end(1, IN_LEFT_REGION + 56, 500);
      expect(state.delta("move")).toEqual({ x: 0, y: 0 });
      expect(state.isHeld("jump")).toBe(true);
    });

    it("takes a second contact in the left region as a play contact, the stick being taken", () => {
      start(1, IN_LEFT_REGION, 500);
      start(2, IN_LEFT_REGION + 50, 200);
      clock += 50;
      end(2, IN_LEFT_REGION + 50, 200);

      expect(edges("engine")).toEqual(["secondary"]);
      expect(source.getJoystick()).not.toBeNull();
    });

    it("ignores a third canvas contact rather than letting it steal a role", () => {
      start(1, IN_LEFT_REGION, 500);
      start(2, ON_PLAY_SURFACE, 300);
      start(3, ON_PLAY_SURFACE + 100, 400);

      clock += 50;
      end(3, ON_PLAY_SURFACE + 100, 400);
      expect(edges("engine")).toEqual([]);

      // The two real roles are untouched.
      expect(source.getJoystick()).not.toBeNull();
      clock += 300;
      source.endFrame();
      expect(state.isHeld("primary")).toBe(true);
    });
  });

  describe("on-screen buttons", () => {
    it("holds and releases a held intent", () => {
      source.holdButton("sneak", true);
      expect(state.isHeld("sneak")).toBe(true);

      source.holdButton("sneak", false);
      expect(state.isHeld("sneak")).toBe(false);
    });

    it("pushes an edge intent with a timestamp", () => {
      clock = 7000;
      source.pressButton("pause");
      source.pressButton("hotbar3");

      expect(state.takeEdges("ui")).toEqual([
        { intent: "pause", at: 7000 },
        { intent: "hotbar3", at: 7000 },
      ]);
    });

    it("arms touch mode without a canvas contact", () => {
      expect(state.source).toBe("keyboardMouse");
      source.pressButton("openInventory");
      expect(state.source).toBe("touch");
    });
  });

  describe("interrupted and malformed gestures", () => {
    it("does not place when a pending contact is cancelled", () => {
      start(1, ON_PLAY_SURFACE, 300);
      clock += 50;
      source.touchCancel([{ id: 1, x: ON_PLAY_SURFACE, y: 300 }]);

      // The player never completed the gesture; building for them would be the
      // browser's decision, not theirs.
      expect(edges("engine")).toEqual([]);
      expect(state.isHeld("primary")).toBe(false);
    });

    it("releases a hold that is cancelled", () => {
      start(1, ON_PLAY_SURFACE, 300);
      clock += 300;
      source.endFrame();
      expect(state.isHeld("primary")).toBe(true);

      source.touchCancel([{ id: 1, x: ON_PLAY_SURFACE, y: 300 }]);
      expect(state.isHeld("primary")).toBe(false);

      clock += 5000;
      source.endFrame();
      expect(state.isHeld("primary")).toBe(false);
    });

    it("zeroes movement when the joystick contact is cancelled", () => {
      start(5, IN_LEFT_REGION, 500);
      move(5, IN_LEFT_REGION + 56, 500);
      source.touchCancel([{ id: 5, x: IN_LEFT_REGION + 56, y: 500 }]);

      expect(state.delta("move")).toEqual({ x: 0, y: 0 });
      expect(source.getJoystick()).toBeNull();
    });

    it("ignores a move or a lift for a contact it never saw start", () => {
      expect(() => move(99, 500, 500)).not.toThrow();
      expect(() => end(99, 500, 500)).not.toThrow();
      expect(edges("engine")).toEqual([]);
      expect(state.delta("look")).toEqual({ x: 0, y: 0 });
    });

    it("starts cleanly again after a gesture is cancelled", () => {
      start(1, ON_PLAY_SURFACE, 300);
      source.touchCancel([{ id: 1, x: ON_PLAY_SURFACE, y: 300 }]);

      start(2, ON_PLAY_SURFACE, 300);
      clock += 50;
      end(2, ON_PLAY_SURFACE, 300);
      expect(edges("engine")).toEqual(["secondary"]);
    });
  });

  describe("releaseAll", () => {
    it("drops what touch asserts and leaves other sources' held intents alone", () => {
      // Stand in for the keyboard holding a movement key of its own.
      state.setHeld("moveForward", true);

      start(1, ON_PLAY_SURFACE, 300);
      clock += 300;
      source.endFrame();
      source.holdButton("jump", true);
      start(5, IN_LEFT_REGION, 500);
      move(5, IN_LEFT_REGION + 56, 500);

      source.releaseAll();

      expect(state.isHeld("primary")).toBe(false);
      expect(state.isHeld("jump")).toBe(false);
      expect(state.delta("move")).toEqual({ x: 0, y: 0 });
      expect(source.getJoystick()).toBeNull();
      // Narrower than IntentState.releaseAll() on purpose.
      expect(state.isHeld("moveForward")).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// Wiring through InputManager
// ---------------------------------------------------------------------------

class FakeStyle {
  setProperty = vi.fn();
}

class FakeCanvas extends EventTarget {
  requestPointerLock = vi.fn();
  clientWidth = SURFACE_WIDTH;
  style = new FakeStyle();
}

class FakeDocument extends EventTarget {
  pointerLockElement: EventTarget | null = null;
  exitPointerLock = vi.fn();
}

function makeTouchEvent(type: string, points: readonly TouchPoint[]) {
  const e = new Event(type, { cancelable: true });
  const touches = points.map((p) => ({ identifier: p.id, clientX: p.x, clientY: p.y }));
  Object.defineProperty(e, "changedTouches", { value: touches, configurable: true });
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

function makeKeyEvent(type: string, code: string) {
  const e = new Event(type) as Event & { code: string };
  e.code = code;
  return e;
}

describe("InputManager touch wiring", () => {
  let win: FakeCanvas;
  let doc: FakeDocument;
  let canvas: FakeCanvas;
  let input: InputManager;
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

  const touch = (type: string, points: readonly TouchPoint[]) =>
    canvas.dispatchEvent(makeTouchEvent(type, points));

  it("forwards canvas contacts into the intent layer", () => {
    touch("touchstart", [{ id: 1, x: ON_PLAY_SURFACE, y: 300 }]);
    clock += 50;
    touch("touchend", [{ id: 1, x: ON_PLAY_SURFACE, y: 300 }]);

    expect(input.intents.takeEdges("engine").map((e) => e.intent)).toEqual(["secondary"]);
  });

  it("takes the left region from the canvas width, so the joystick anchors there", () => {
    touch("touchstart", [{ id: 1, x: IN_LEFT_REGION, y: 500 }]);
    touch("touchmove", [{ id: 1, x: IN_LEFT_REGION + 56, y: 500 }]);

    expect(input.intents.delta("move")).toEqual({ x: 1, y: 0 });
  });

  it("re-asserts the stick across endFrame while clearing the look delta", () => {
    touch("touchstart", [{ id: 1, x: IN_LEFT_REGION, y: 500 }]);
    touch("touchmove", [{ id: 1, x: IN_LEFT_REGION + 56, y: 500 }]);
    touch("touchstart", [{ id: 2, x: ON_PLAY_SURFACE, y: 300 }]);
    touch("touchmove", [{ id: 2, x: ON_PLAY_SURFACE + 40, y: 300 }]);
    touch("touchmove", [{ id: 2, x: ON_PLAY_SURFACE + 60, y: 300 }]);

    expect(input.intents.delta("look")).toEqual({ x: 20, y: 0 });

    input.endFrame();

    // Look accumulates and is spent; move is a level reading and is restored.
    expect(input.intents.delta("look")).toEqual({ x: 0, y: 0 });
    expect(input.intents.delta("move")).toEqual({ x: 1, y: 0 });
  });

  it("arms touch mode on the first touch event, not on a user-agent string (R27)", () => {
    expect(input.intents.source).toBe("keyboardMouse");
    touch("touchstart", [{ id: 1, x: ON_PLAY_SURFACE, y: 300 }]);
    expect(input.intents.source).toBe("touch");
  });

  it("returns to keyboard on the next real key press, with the keyboard still working (R28)", () => {
    touch("touchstart", [{ id: 1, x: ON_PLAY_SURFACE, y: 300 }]);
    clock += 50;
    touch("touchend", [{ id: 1, x: ON_PLAY_SURFACE, y: 300 }]);
    expect(input.intents.source).toBe("touch");

    win.dispatchEvent(makeKeyEvent("keydown", "KeyW"));

    expect(input.intents.source).toBe("keyboardMouse");
    expect(input.intents.isHeld("moveForward")).toBe(true);

    // ...and back again with no reload in between.
    clock += 1000;
    touch("touchstart", [{ id: 2, x: ON_PLAY_SURFACE, y: 300 }]);
    expect(input.intents.source).toBe("touch");
    expect(input.intents.isHeld("moveForward")).toBe(true);
  });

  it("keeps touch mode while a soft keyboard types into a text field", () => {
    touch("touchstart", [{ id: 1, x: ON_PLAY_SURFACE, y: 300 }]);

    const chatInput = Object.assign(new EventTarget(), { tagName: "INPUT" });
    const typed = makeKeyEvent("keydown", "KeyW");
    Object.defineProperty(typed, "target", { value: chatInput, configurable: true });
    win.dispatchEvent(typed);

    // A phone's soft keyboard fires keydown for every letter of a chat message.
    // Tearing the touch controls down mid-sentence is not an input-source change.
    expect(input.intents.source).toBe("touch");
  });

  it("produces no duplicate intent from the compatibility mouse burst", () => {
    touch("touchstart", [{ id: 1, x: ON_PLAY_SURFACE, y: 300 }]);
    clock += 50;
    touch("touchend", [{ id: 1, x: ON_PLAY_SURFACE, y: 300 }]);

    expect(input.intents.takeEdges("engine").map((e) => e.intent)).toEqual(["secondary"]);

    // The burst the browser synthesizes right afterwards.
    clock += 20;
    doc.dispatchEvent(makeMouseEvent("mousemove", { movementX: 9, movementY: 9 }));
    canvas.dispatchEvent(makeMouseEvent("mousedown", { button: 0 }));
    win.dispatchEvent(makeMouseEvent("mouseup", { button: 0 }));
    canvas.dispatchEvent(new Event("click"));

    expect(input.intents.takeEdges("engine")).toEqual([]);
    expect(input.intents.isHeld("primary")).toBe(false);
    expect(input.intents.delta("look")).toEqual({ x: 0, y: 0 });
    expect(input.intents.source).toBe("touch");
    // The synthesized click is the dangerous one: a lock the player cannot exit.
    expect(canvas.requestPointerLock).not.toHaveBeenCalled();
    // The legacy face is suppressed with it, so the two do not disagree.
    expect(input.isMouseButtonDown(0)).toBe(false);
    expect(input.getMouseButton()).toEqual({ left: false, right: false });
  });

  it("lets a real mouse through once the compatibility window has passed", () => {
    touch("touchstart", [{ id: 1, x: ON_PLAY_SURFACE, y: 300 }]);
    clock += 50;
    touch("touchend", [{ id: 1, x: ON_PLAY_SURFACE, y: 300 }]);
    input.intents.takeEdges("engine");

    clock += 800;
    canvas.dispatchEvent(makeMouseEvent("mousedown", { button: 0 }));

    expect(input.intents.isHeld("primary")).toBe(true);
    expect(input.intents.source).toBe("keyboardMouse");
  });

  it("suppresses double-tap zoom, the long-press callout and text selection (R20)", () => {
    const applied = Object.fromEntries(
      canvas.style.setProperty.mock.calls.map(([property, value]) => [property, value]),
    );

    expect(applied["touch-action"]).toBe("none");
    expect(applied["-webkit-touch-callout"]).toBe("none");
    expect(applied["user-select"]).toBe("none");
    expect(applied["-webkit-user-select"]).toBe("none");
  });

  it("prevents the browser default on the contact events that synthesize mouse events", () => {
    const started = makeTouchEvent("touchstart", [{ id: 1, x: ON_PLAY_SURFACE, y: 300 }]);
    canvas.dispatchEvent(started);
    const moved = makeTouchEvent("touchmove", [{ id: 1, x: ON_PLAY_SURFACE + 40, y: 300 }]);
    canvas.dispatchEvent(moved);
    const ended = makeTouchEvent("touchend", [{ id: 1, x: ON_PLAY_SURFACE + 40, y: 300 }]);
    canvas.dispatchEvent(ended);

    expect(started.defaultPrevented).toBe(true);
    expect(moved.defaultPrevented).toBe(true);
    expect(ended.defaultPrevented).toBe(true);
  });

  it("leaves desktop alone: no touch, no suppression, source never flips", () => {
    canvas.dispatchEvent(makeMouseEvent("mousedown", { button: 2 }));
    doc.dispatchEvent(makeMouseEvent("mousemove", { movementX: 4, movementY: 2 }));
    canvas.dispatchEvent(new Event("click"));

    expect(input.intents.takeEdges("engine").map((e) => e.intent)).toEqual(["secondary"]);
    expect(input.intents.delta("look")).toEqual({ x: 4, y: 2 });
    expect(input.intents.source).toBe("keyboardMouse");
    expect(canvas.requestPointerLock).toHaveBeenCalledTimes(1);
  });

  it("stops handling contacts after dispose, and releases what touch was holding", () => {
    touch("touchstart", [{ id: 1, x: ON_PLAY_SURFACE, y: 300 }]);
    clock += 300;
    input.endFrame();
    expect(input.intents.isHeld("primary")).toBe(true);

    input.dispose();
    expect(input.intents.isHeld("primary")).toBe(false);

    touch("touchstart", [{ id: 2, x: ON_PLAY_SURFACE, y: 300 }]);
    clock += 50;
    touch("touchend", [{ id: 2, x: ON_PLAY_SURFACE, y: 300 }]);
    expect(input.intents.takeEdges("engine")).toEqual([]);
  });
});
