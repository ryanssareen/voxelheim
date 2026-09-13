import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { InputManager } from "@engine/InputManager";
import type { TouchPoint } from "@engine/input/touchSource";
import {
  MODAL_DISMISS_BLOCKERS,
  PAUSE_BLOCKERS,
  UI_PRIORITY,
  UiIntentRouter,
  uiIntentBlocked,
  type UiInputState,
} from "@engine/input/uiIntents";
import { enterPlayCapture } from "@ui/playCapture";
import { useChatStore } from "@store/useChatStore";
import { useGameStore } from "@store/useGameStore";
import { useInventoryStore } from "@store/useInventoryStore";

/**
 * U8: pause stops being the pointer-lock-lost callback, and the input source
 * becomes something the UI can see.
 *
 * Two claims are worth pinning here, and neither is about a component.
 *
 * **Pause has two triggers that must agree.** Desktop keeps pausing when the
 * browser takes the pointer lock away; the `pause` intent is what lets a thumb
 * (U7's control) and an Escape pressed without a lock reach the same place
 * (R22). Two triggers is two guards unless something holds them together, and
 * the thing holding them together is `PAUSE_BLOCKERS` — so the cases below run
 * *both* triggers over the same store state and assert they answer identically.
 * A future edit that tightens one and not the other fails here.
 *
 * **The source is published, not detected.** Touch arms on the first touch
 * event (R27) and a key press hands it straight back (R28); the store is how
 * the UI finds out, with no reload and no user-agent string anywhere.
 *
 * `Engine` itself cannot be constructed in this environment — it wants a WebGL
 * context — so its two wiring lines are mirrored by {@link lockLost} and
 * {@link publishSource} below, and driven through the real `InputManager` and
 * the real stores. What the mirrors cannot prove is that `Engine` calls them;
 * what they do prove is that the rule both sides share behaves the same from
 * either direction.
 */

class FakeStyle {
  setProperty = vi.fn();
}

class FakeCanvas extends EventTarget {
  requestPointerLock = vi.fn();
  clientWidth = 1000;
  style = new FakeStyle();
}

class FakeDocument extends EventTarget {
  pointerLockElement: EventTarget | null = null;
  exitPointerLock = vi.fn();
  /** Read by `enterPlayCapture`'s fullscreen half. */
  fullscreenEnabled = true;
  fullscreenElement: Element | null = null;
}

function makeKeyEvent(type: string, code: string, target?: EventTarget) {
  const e = new Event(type, { cancelable: true }) as Event & { code: string };
  e.code = code;
  if (target !== undefined) {
    Object.defineProperty(e, "target", { value: target, configurable: true });
  }
  return e;
}

function makeTouchEvent(type: string, points: readonly TouchPoint[]) {
  const e = new Event(type, { cancelable: true });
  const touches = points.map((p) => ({ identifier: p.id, clientX: p.x, clientY: p.y }));
  Object.defineProperty(e, "changedTouches", { value: touches, configurable: true });
  return e;
}

/** A point on the play surface, clear of the joystick's left region. */
const ON_PLAY_SURFACE = 700;

let win: FakeCanvas;
let doc: FakeDocument;
let canvas: FakeCanvas;
let input: InputManager;
let router: UiIntentRouter;

/**
 * The four guard conditions, read from the live stores.
 *
 * Mirrors `readUiInputState()` in `src/ui/useIntentEdge.ts` and
 * `Engine.readPauseGuardState()`, neither of which is importable here — the
 * first is a `"use client"` React module, the second a private method on a
 * class that needs a canvas and a WebGL context to exist.
 */
function readGuardState(): UiInputState {
  const game = useGameStore.getState();
  const inv = useInventoryStore.getState();
  return {
    dead: game.isDead,
    paused: game.isPaused,
    chatComposing: useChatStore.getState().composing,
    panelOpen: inv.isOpen || inv.tableOpen || inv.furnaceOpen || inv.creativeOpen,
  };
}

/** Stands in for `PauseMenu`'s intent handler. */
function pauseFromIntent(): void {
  if (document.pointerLockElement) document.exitPointerLock();
  useGameStore.getState().setPaused(true);
}

/** Stands in for `Engine`'s `onPointerLockLost` callback. */
function lockLost(): void {
  if (uiIntentBlocked(PAUSE_BLOCKERS, readGuardState())) return;
  useGameStore.getState().setPaused(true);
}

/** Stands in for the one line the engine's frame loop runs in its `finally`. */
function publishSource(): void {
  useGameStore.getState().setInputSource(input.intents.source);
}

/** Registers the pause consumer `PauseMenu` registers. */
function registerPauseConsumer(): () => void {
  return router.register({
    intent: "pause",
    blockers: PAUSE_BLOCKERS,
    priority: UI_PRIORITY.hud,
    exclusive: false,
    run: pauseFromIntent,
  });
}

/** Registers the controls popup's exclusive claim on the same intent. */
function registerControlsPopup(): { closed: number; unregister: () => void } {
  const record = { closed: 0, unregister: () => {} };
  record.unregister = router.register({
    intent: "pause",
    blockers: MODAL_DISMISS_BLOCKERS,
    priority: UI_PRIORITY.modal,
    exclusive: true,
    run: () => {
      record.closed++;
    },
  });
  return record;
}

function resetStores(): void {
  useGameStore.setState({ isPaused: false, isDead: false, inputSource: "keyboardMouse" });
  useInventoryStore.setState({
    isOpen: false,
    tableOpen: false,
    furnaceOpen: false,
    creativeOpen: false,
  });
  useChatStore.setState({ composing: false });
}

beforeEach(() => {
  win = new FakeCanvas();
  doc = new FakeDocument();
  canvas = new FakeCanvas();
  vi.stubGlobal("window", win);
  vi.stubGlobal("document", doc);

  resetStores();

  input = new InputManager(() => 1000);
  input.init(canvas as unknown as HTMLCanvasElement);
  input.onPointerLockLost = lockLost;

  router = new UiIntentRouter();
  // Stands in for src/ui/useIntentEdge.ts, which subscribes the router to the
  // push face and samples the stores once per edge.
  input.intents.onEdge((edge) => router.dispatch(edge, readGuardState));
});

afterEach(() => {
  input.dispose();
  resetStores();
  vi.unstubAllGlobals();
});

/** Drives the browser's locked -> unlocked transition. */
function loseLock(): void {
  doc.pointerLockElement = canvas;
  doc.dispatchEvent(new Event("pointerlockchange"));
  doc.pointerLockElement = null;
  doc.dispatchEvent(new Event("pointerlockchange"));
}

// ---------------------------------------------------------------------------
// One rule, two triggers
// ---------------------------------------------------------------------------

interface GuardCase {
  name: string;
  arrange: () => void;
  pauses: boolean;
}

const GUARD_CASES: readonly GuardCase[] = [
  { name: "playing", arrange: () => {}, pauses: true },
  {
    name: "dead",
    arrange: () => useGameStore.setState({ isDead: true }),
    pauses: false,
  },
  {
    name: "chat composing",
    arrange: () => useChatStore.setState({ composing: true }),
    pauses: false,
  },
  {
    name: "inventory open",
    arrange: () => useInventoryStore.setState({ isOpen: true }),
    pauses: false,
  },
  {
    name: "crafting table open",
    arrange: () => useInventoryStore.setState({ tableOpen: true }),
    pauses: false,
  },
  {
    name: "furnace open",
    arrange: () => useInventoryStore.setState({ furnaceOpen: true }),
    pauses: false,
  },
  {
    name: "creative screen open",
    arrange: () => useInventoryStore.setState({ creativeOpen: true }),
    pauses: false,
  },
];

describe("pause is one rule with two triggers", () => {
  for (const testCase of GUARD_CASES) {
    it(`${testCase.name}: the pause intent ${testCase.pauses ? "pauses" : "does not pause"}`, () => {
      registerPauseConsumer();
      testCase.arrange();

      win.dispatchEvent(makeKeyEvent("keydown", "Escape"));

      expect(useGameStore.getState().isPaused).toBe(testCase.pauses);
    });

    it(`${testCase.name}: losing the pointer lock ${testCase.pauses ? "pauses" : "does not pause"} too`, () => {
      testCase.arrange();

      loseLock();

      expect(useGameStore.getState().isPaused).toBe(testCase.pauses);
    });
  }

  it("does not block on being paused already, because the desktop Escape fires both triggers", () => {
    // A locked desktop Escape reaches pause twice over: the browser drops the
    // lock and the keydown produces the intent. Blocking on `paused` would make
    // that order-dependent for no gain; both are idempotent instead.
    expect(uiIntentBlocked(PAUSE_BLOCKERS, { ...readGuardState(), paused: true })).toBeNull();
  });

  it("stays paused when both triggers fire for the same press", () => {
    registerPauseConsumer();

    loseLock();
    win.dispatchEvent(makeKeyEvent("keydown", "Escape"));

    expect(useGameStore.getState().isPaused).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Pause without a pointer lock (R22)
// ---------------------------------------------------------------------------

describe("pause without a pointer lock", () => {
  it("fires from the touch control, with no lock ever acquired", () => {
    registerPauseConsumer();

    input.touch.pressButton("pause");

    expect(useGameStore.getState().isPaused).toBe(true);
    expect(doc.pointerLockElement).toBeNull();
    expect(canvas.requestPointerLock).not.toHaveBeenCalled();
    expect(doc.exitPointerLock).not.toHaveBeenCalled();
  });

  it("arms touch mode on the way through, so the UI knows which control paused", () => {
    registerPauseConsumer();

    input.touch.pressButton("pause");
    publishSource();

    expect(useGameStore.getState().inputSource).toBe("touch");
  });

  it("fires from Escape when the player never clicked to lock", () => {
    registerPauseConsumer();

    win.dispatchEvent(makeKeyEvent("keydown", "Escape"));

    expect(useGameStore.getState().isPaused).toBe(true);
  });

  it("releases a lock that is still held, so the menu gets a cursor", () => {
    registerPauseConsumer();
    doc.pointerLockElement = canvas;
    doc.dispatchEvent(new Event("pointerlockchange"));

    input.touch.pressButton("pause");

    expect(doc.exitPointerLock).toHaveBeenCalledTimes(1);
    expect(useGameStore.getState().isPaused).toBe(true);
  });

  it("is idempotent: a second press leaves the game paused rather than resuming it", () => {
    registerPauseConsumer();

    input.touch.pressButton("pause");
    input.touch.pressButton("pause");

    expect(useGameStore.getState().isPaused).toBe(true);
  });

  it("does not pause behind the controls popup, which claims the same intent", () => {
    const popup = registerControlsPopup();
    registerPauseConsumer();

    win.dispatchEvent(makeKeyEvent("keydown", "Escape"));

    expect(popup.closed).toBe(1);
    expect(useGameStore.getState().isPaused).toBe(false);

    // ...and once the popup is gone, the same press pauses again.
    popup.unregister();
    win.dispatchEvent(makeKeyEvent("keyup", "Escape"));
    win.dispatchEvent(makeKeyEvent("keydown", "Escape"));

    expect(useGameStore.getState().isPaused).toBe(true);
  });

  it("ignores an Escape typed into a text field, which never becomes an intent", () => {
    registerPauseConsumer();
    const chatInput = Object.assign(new EventTarget(), { tagName: "INPUT" });

    win.dispatchEvent(makeKeyEvent("keydown", "Escape", chatInput));

    expect(useGameStore.getState().isPaused).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Input source reaches the store (R27, R28)
// ---------------------------------------------------------------------------

describe("input source is published to the store", () => {
  const touch = (type: string, points: readonly TouchPoint[]) =>
    canvas.dispatchEvent(makeTouchEvent(type, points));

  it("starts on keyboard and mouse, with nothing detected", () => {
    publishSource();
    expect(useGameStore.getState().inputSource).toBe("keyboardMouse");
  });

  it("switches to touch on the first contact (R27)", () => {
    touch("touchstart", [{ id: 1, x: ON_PLAY_SURFACE, y: 300 }]);
    publishSource();

    expect(useGameStore.getState().inputSource).toBe("touch");
  });

  it("switches back on the next key press, with the keyboard still working (R28)", () => {
    touch("touchstart", [{ id: 1, x: ON_PLAY_SURFACE, y: 300 }]);
    publishSource();
    expect(useGameStore.getState().inputSource).toBe("touch");

    win.dispatchEvent(makeKeyEvent("keydown", "KeyW"));
    publishSource();

    expect(useGameStore.getState().inputSource).toBe("keyboardMouse");
    expect(input.intents.isHeld("moveForward")).toBe(true);

    // ...and back to touch again, no reload in between.
    touch("touchstart", [{ id: 2, x: ON_PLAY_SURFACE, y: 300 }]);
    publishSource();

    expect(useGameStore.getState().inputSource).toBe("touch");
    expect(input.intents.isHeld("moveForward")).toBe(true);
  });

  it("stays on touch while a soft keyboard types into a text field", () => {
    touch("touchstart", [{ id: 1, x: ON_PLAY_SURFACE, y: 300 }]);
    publishSource();

    const chatInput = Object.assign(new EventTarget(), { tagName: "INPUT" });
    win.dispatchEvent(makeKeyEvent("keydown", "KeyW", chatInput));
    publishSource();

    // Every letter of a chat message fires keydown on a phone. Tearing the
    // touch controls down mid-sentence is not an input-source change.
    expect(useGameStore.getState().inputSource).toBe("touch");
  });

  it("publishes while the game is paused, which is where a first touch often lands", () => {
    // The engine publishes from the frame loop's `finally`, so the paused,
    // dead and panel-open early returns cannot skip it.
    useGameStore.setState({ isPaused: true });

    touch("touchstart", [{ id: 1, x: ON_PLAY_SURFACE, y: 300 }]);
    publishSource();

    expect(useGameStore.getState().inputSource).toBe("touch");
  });

  it("notifies subscribers only on a real switch, not on every frame", () => {
    let notifications = 0;
    const unsubscribe = useGameStore.subscribe(() => {
      notifications++;
    });

    useGameStore.getState().setInputSource("touch");
    useGameStore.getState().setInputSource("touch");
    useGameStore.getState().setInputSource("touch");
    unsubscribe();

    expect(notifications).toBe(1);
    expect(useGameStore.getState().inputSource).toBe("touch");
  });
});

// ---------------------------------------------------------------------------
// Resuming play (R22, R28)
// ---------------------------------------------------------------------------

describe("entering play capture follows the input source", () => {
  function fakePlayCanvas() {
    return {
      requestPointerLock: vi.fn(),
      parentElement: { requestFullscreen: vi.fn(() => Promise.resolve()) },
    } as unknown as HTMLCanvasElement;
  }

  const fullscreenOf = (c: HTMLCanvasElement) =>
    (c.parentElement as unknown as { requestFullscreen: ReturnType<typeof vi.fn> })
      .requestFullscreen;

  it("asks for the lock on desktop, as it always has", () => {
    const playCanvas = fakePlayCanvas();

    enterPlayCapture(playCanvas);

    expect(playCanvas.requestPointerLock).toHaveBeenCalledTimes(1);
  });

  it("skips the lock in touch mode but still goes fullscreen", () => {
    useGameStore.setState({ inputSource: "touch" });
    const playCanvas = fakePlayCanvas();

    enterPlayCapture(playCanvas);

    expect(playCanvas.requestPointerLock).not.toHaveBeenCalled();
    expect(fullscreenOf(playCanvas)).toHaveBeenCalledTimes(1);
  });

  it("asks for the lock again once the player goes back to a keyboard", () => {
    useGameStore.setState({ inputSource: "touch" });
    const onTouch = fakePlayCanvas();
    enterPlayCapture(onTouch);
    expect(onTouch.requestPointerLock).not.toHaveBeenCalled();

    useGameStore.getState().setInputSource("keyboardMouse");
    const onKeyboard = fakePlayCanvas();
    enterPlayCapture(onKeyboard);

    expect(onKeyboard.requestPointerLock).toHaveBeenCalledTimes(1);
  });
});
