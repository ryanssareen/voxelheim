import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { InputManager } from "@engine/InputManager";
import { IntentState } from "@engine/input/snapshot";
import {
  CHAT_OPEN_BLOCKERS,
  DEBUG_TOGGLE_BLOCKERS,
  MINIMAP_TOGGLE_BLOCKERS,
  MODAL_DISMISS_BLOCKERS,
  UI_PRIORITY,
  UiIntentRouter,
  movementIntended,
  uiIntentBlocked,
  type UiInputState,
} from "@engine/input/uiIntents";
import { KEY_EDGE_INTENTS } from "@engine/input/keyboardMouseSource";
import { TouchSource } from "@engine/input/touchSource";
import { WALKTHROUGH_STEPS, useWalkthroughStore } from "@store/useWalkthroughStore";
import { installWindow, keyboardHarness, removeWindow } from "./helpers";

/**
 * U5: the React overlays stop owning `window` keydown listeners and consume
 * intents instead.
 *
 * The components themselves cannot be rendered here — `vitest.config.ts` runs
 * `environment: "node"` and the plan keeps it that way rather than pulling jsdom
 * in under 47 test files. What is worth pinning is not the JSX anyway: it is
 * which presses reach which overlay, under which conditions, and in what order.
 * All of that lives in `@engine/input/uiIntents`, deliberately free of React and
 * of the stores, and it is driven here through the real `InputManager` so the
 * assertions describe a key travelling the whole path rather than a hand-built
 * intent.
 */

class FakeCanvas extends EventTarget {
  requestPointerLock = vi.fn();
}

class FakeDocument extends EventTarget {
  pointerLockElement: EventTarget | null = null;
  exitPointerLock = vi.fn();
}

/** A fake DOM element (e.g. a chat <input>) used as an event target for the typing guard. */
class FakeElement extends EventTarget {
  constructor(
    public tagName: string,
    public isContentEditable = false,
  ) {
    super();
  }
}

function makeKeyEvent(type: string, code: string, target?: EventTarget) {
  const e = new Event(type, { cancelable: true }) as Event & { code: string };
  e.code = code;
  if (target !== undefined) {
    Object.defineProperty(e, "target", { value: target, configurable: true });
  }
  return e;
}

/** Nothing is blocking: the live, unpaused, not-composing, no-panel case. */
function playing(overrides: Partial<UiInputState> = {}): UiInputState {
  return {
    dead: false,
    paused: false,
    chatComposing: false,
    panelOpen: false,
    ...overrides,
  };
}

let win: FakeCanvas;
let doc: FakeDocument;
let canvas: FakeCanvas;
let input: InputManager;
let router: UiIntentRouter;
/** Guard state the router sees; mutated per case to stand in for the stores. */
let uiState: UiInputState;
let stateReads: number;

beforeEach(() => {
  win = new FakeCanvas();
  doc = new FakeDocument();
  canvas = new FakeCanvas();
  vi.stubGlobal("window", win);
  vi.stubGlobal("document", doc);

  input = new InputManager(() => 1000);
  input.init(canvas as unknown as HTMLCanvasElement);

  router = new UiIntentRouter();
  uiState = playing();
  stateReads = 0;
  // Stands in for src/ui/useIntentEdge.ts, which subscribes the router to the
  // push face and samples the stores for each edge.
  input.intents.onEdge((edge) =>
    router.dispatch(edge, () => {
      stateReads++;
      return uiState;
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Registers a consumer and returns the calls it received. */
function consumer(
  intent: Parameters<UiIntentRouter["register"]>[0]["intent"],
  blockers: readonly (typeof CHAT_OPEN_BLOCKERS)[number][],
  options: { priority?: number; exclusive?: boolean } = {},
): { fired: number; unregister: () => void } {
  const record = { fired: 0, unregister: () => {} };
  record.unregister = router.register({
    intent,
    blockers,
    priority: options.priority ?? UI_PRIORITY.hud,
    exclusive: options.exclusive ?? false,
    run: () => {
      record.fired++;
    },
  });
  return record;
}

describe("uiIntentBlocked", () => {
  it("passes when none of the declared blockers is active", () => {
    expect(uiIntentBlocked(CHAT_OPEN_BLOCKERS, playing())).toBeNull();
  });

  it("names the blocker that stopped it, not just that something did", () => {
    expect(uiIntentBlocked(CHAT_OPEN_BLOCKERS, playing({ panelOpen: true }))).toBe("panelOpen");
  });

  it("ignores a condition a consumer did not declare", () => {
    // The minimap has always toggled while dead and while paused.
    expect(uiIntentBlocked(MINIMAP_TOGGLE_BLOCKERS, playing({ dead: true, paused: true }))).toBeNull();
    expect(uiIntentBlocked(MINIMAP_TOGGLE_BLOCKERS, playing({ chatComposing: true }))).toBe("chatComposing");
  });

  it("lets everything through for a consumer that declares no blockers", () => {
    const everything = playing({ dead: true, paused: true, chatComposing: true, panelOpen: true });
    expect(uiIntentBlocked(DEBUG_TOGGLE_BLOCKERS, everything)).toBeNull();
    expect(uiIntentBlocked(MODAL_DISMISS_BLOCKERS, everything)).toBeNull();
  });
});

describe("chat opens on its intent (T)", () => {
  it("fires for a plain keypress", () => {
    const chat = consumer("openChat", CHAT_OPEN_BLOCKERS);
    win.dispatchEvent(makeKeyEvent("keydown", "KeyT"));
    expect(chat.fired).toBe(1);
  });

  it("does not fire while a text field has focus", () => {
    const chat = consumer("openChat", CHAT_OPEN_BLOCKERS);
    win.dispatchEvent(makeKeyEvent("keydown", "KeyT", new FakeElement("INPUT")));
    win.dispatchEvent(makeKeyEvent("keydown", "KeyT", new FakeElement("TEXTAREA")));
    win.dispatchEvent(makeKeyEvent("keydown", "KeyT", new FakeElement("DIV", true)));
    // The guard is InputManager's: no intent is produced at all, so the router
    // is never even asked whether chat may open.
    expect(chat.fired).toBe(0);
    expect(stateReads).toBe(0);
  });

  it("does not fire while dead, paused, already composing, or over an open panel", () => {
    const chat = consumer("openChat", CHAT_OPEN_BLOCKERS);
    for (const blocked of [
      playing({ dead: true }),
      playing({ paused: true }),
      playing({ chatComposing: true }),
      playing({ panelOpen: true }),
    ]) {
      uiState = blocked;
      win.dispatchEvent(makeKeyEvent("keydown", "KeyT"));
      win.dispatchEvent(makeKeyEvent("keyup", "KeyT"));
    }
    expect(chat.fired).toBe(0);
  });

  it("fires once per press, not once per auto-repeat", () => {
    const chat = consumer("openChat", CHAT_OPEN_BLOCKERS);
    win.dispatchEvent(makeKeyEvent("keydown", "KeyT"));
    win.dispatchEvent(makeKeyEvent("keydown", "KeyT"));
    win.dispatchEvent(makeKeyEvent("keydown", "KeyT"));
    expect(chat.fired).toBe(1);

    win.dispatchEvent(makeKeyEvent("keyup", "KeyT"));
    win.dispatchEvent(makeKeyEvent("keydown", "KeyT"));
    expect(chat.fired).toBe(2);
  });
});

describe("minimap toggles on its intent (M)", () => {
  it("fires while dead and while paused, as it always has", () => {
    const minimap = consumer("toggleMinimap", MINIMAP_TOGGLE_BLOCKERS);
    uiState = playing({ dead: true, paused: true });
    win.dispatchEvent(makeKeyEvent("keydown", "KeyM"));
    expect(minimap.fired).toBe(1);
  });

  it("does not fire while chat is composing or a panel is open", () => {
    const minimap = consumer("toggleMinimap", MINIMAP_TOGGLE_BLOCKERS);
    uiState = playing({ chatComposing: true });
    win.dispatchEvent(makeKeyEvent("keydown", "KeyM"));
    win.dispatchEvent(makeKeyEvent("keyup", "KeyM"));
    uiState = playing({ panelOpen: true });
    win.dispatchEvent(makeKeyEvent("keydown", "KeyM"));
    expect(minimap.fired).toBe(0);
  });
});

describe("debug overlay behaviour is unchanged (F3)", () => {
  it("toggles from a plain keypress", () => {
    const debug = consumer("toggleDebug", DEBUG_TOGGLE_BLOCKERS);
    win.dispatchEvent(makeKeyEvent("keydown", "F3"));
    expect(debug.fired).toBe(1);
  });

  /**
   * The quirk the plan's Scope Boundaries keep on purpose: F3's pre-U5 listener
   * had no typing guard, so the overlay toggles mid-sentence in chat. It
   * survives only because InputManager exempts F3 from the guard that stops
   * every other key — pin it here, so the follow-up that fixes it has to come
   * through this test rather than past it.
   */
  it("still toggles while the player is typing in chat", () => {
    const debug = consumer("toggleDebug", DEBUG_TOGGLE_BLOCKERS);
    uiState = playing({ chatComposing: true });
    win.dispatchEvent(makeKeyEvent("keydown", "F3", new FakeElement("INPUT")));
    expect(debug.fired).toBe(1);
  });

  it("still toggles while paused, dead and over an open panel", () => {
    const debug = consumer("toggleDebug", DEBUG_TOGGLE_BLOCKERS);
    uiState = playing({ dead: true, paused: true, panelOpen: true });
    win.dispatchEvent(makeKeyEvent("keydown", "F3"));
    expect(debug.fired).toBe(1);
  });

  /**
   * The reason the React overlays read the push face rather than a cursor. The
   * frame loop calls `drain()` on every frame a panel is open, and F3 has no
   * panel guard — a polling consumer would toggle or not depending on whether
   * its poll landed before or after that frame's drain.
   */
  it("is delivered before a panel-open frame can drain the queue", () => {
    const debug = consumer("toggleDebug", DEBUG_TOGGLE_BLOCKERS);
    uiState = playing({ panelOpen: true });
    win.dispatchEvent(makeKeyEvent("keydown", "F3"));
    input.intents.drain();
    expect(debug.fired).toBe(1);
  });
});

describe("controls popup takes Escape ahead of other handlers", () => {
  it("claims the pause intent so lower-priority consumers never see it", () => {
    const popup = consumer("pause", MODAL_DISMISS_BLOCKERS, {
      priority: UI_PRIORITY.modal,
      exclusive: true,
    });
    const behind = consumer("pause", MODAL_DISMISS_BLOCKERS);

    win.dispatchEvent(makeKeyEvent("keydown", "Escape"));

    expect(popup.fired).toBe(1);
    expect(behind.fired).toBe(0);
  });

  it("claims Enter the same way", () => {
    const popup = consumer("confirm", MODAL_DISMISS_BLOCKERS, {
      priority: UI_PRIORITY.modal,
      exclusive: true,
    });
    win.dispatchEvent(makeKeyEvent("keydown", "Enter"));
    expect(popup.fired).toBe(1);
  });

  it("goes back to the lower-priority consumer once the popup unregisters", () => {
    const popup = consumer("pause", MODAL_DISMISS_BLOCKERS, {
      priority: UI_PRIORITY.modal,
      exclusive: true,
    });
    const behind = consumer("pause", MODAL_DISMISS_BLOCKERS);

    popup.unregister();
    win.dispatchEvent(makeKeyEvent("keydown", "Escape"));

    expect(popup.fired).toBe(0);
    expect(behind.fired).toBe(1);
  });

  it("does not claim an edge it declined to handle", () => {
    // A blocked exclusive handler must not swallow the press on its way past —
    // `stopPropagation` only ever ran on a press this popup actually consumed.
    const modal = consumer("pause", ["paused"], {
      priority: UI_PRIORITY.modal,
      exclusive: true,
    });
    const behind = consumer("pause", MODAL_DISMISS_BLOCKERS);

    uiState = playing({ paused: true });
    win.dispatchEvent(makeKeyEvent("keydown", "Escape"));

    expect(modal.fired).toBe(0);
    expect(behind.fired).toBe(1);
  });

  it("runs equal-priority consumers in registration order, both of them", () => {
    const order: string[] = [];
    const record = (name: string) => ({
      intent: "toggleDebug" as const,
      blockers: DEBUG_TOGGLE_BLOCKERS,
      priority: UI_PRIORITY.hud,
      exclusive: false,
      run: () => void order.push(name),
    });
    router.register(record("first"));
    router.register(record("second"));

    win.dispatchEvent(makeKeyEvent("keydown", "F3"));

    expect(order).toEqual(["first", "second"]);
  });
});

describe("router housekeeping", () => {
  it("ignores an edge nobody registered for without touching the stores", () => {
    // Every mouse click pushes a `primary`/`secondary` edge; sampling four
    // stores for each of them would be a cost paid on every swing.
    win.dispatchEvent(makeKeyEvent("keydown", "KeyM"));
    expect(stateReads).toBe(0);
  });

  it("unregistering twice is a no-op, not an error", () => {
    const chat = consumer("openChat", CHAT_OPEN_BLOCKERS);
    chat.unregister();
    expect(() => chat.unregister()).not.toThrow();
    win.dispatchEvent(makeKeyEvent("keydown", "KeyT"));
    expect(chat.fired).toBe(0);
  });

  it("stops delivering once the push subscription is dropped", () => {
    const state = new IntentState();
    const seen: string[] = [];
    const off = state.onEdge((edge) => void seen.push(edge.intent));
    state.pushEdge("toggleDebug", 1);
    off();
    state.pushEdge("toggleDebug", 2);
    expect(seen).toEqual(["toggleDebug"]);
  });

  it("delivers a pushed edge to the cursor face as well, not instead of it", () => {
    const state = new IntentState();
    let pushed = 0;
    state.onEdge(() => pushed++);
    state.pushEdge("openChat", 1);
    expect(pushed).toBe(1);
    expect(state.takeEdges("engineFrame").map((e) => e.intent)).toEqual(["openChat"]);
  });
});

describe("walkthrough movement step reads intents, not key codes", () => {
  beforeEach(() => {
    installWindow();
    useWalkthroughStore.setState({ isOpen: false, activeIndex: 0, completed: false });
  });
  afterEach(removeWindow);

  it("reports no movement when nothing is held", () => {
    const kb = keyboardHarness(() => 1000);
    expect(movementIntended(kb.intents)).toBe(false);
  });

  it("reports movement for every key PlayerController accepts", () => {
    for (const code of ["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowLeft", "ArrowDown", "ArrowRight"]) {
      const kb = keyboardHarness(() => 1000);
      kb.press(code);
      expect(movementIntended(kb.intents), `${code} should read as movement`).toBe(true);
    }
  });

  it("stops reporting movement once the key is released", () => {
    const kb = keyboardHarness(() => 1000);
    kb.press("KeyW");
    kb.release("KeyW");
    expect(movementIntended(kb.intents)).toBe(false);
  });

  it("reports movement from an analog stick, which has no key code at all", () => {
    // U6's joystick writes the `move` delta rather than held intents; the
    // walkthrough advances off it without learning anything about touch.
    const state = new IntentState();
    state.setDelta("move", { x: 0, y: 0.4 });
    expect(movementIntended(state)).toBe(true);
  });

  it("advances the walkthrough's first step from a movement intent", () => {
    useWalkthroughStore.getState().startIfUnseen();
    expect(WALKTHROUGH_STEPS[useWalkthroughStore.getState().activeIndex].action).toBe("move");

    const kb = keyboardHarness(() => 1000);
    kb.press("KeyW");
    if (movementIntended(kb.intents)) useWalkthroughStore.getState().notify("move");

    expect(useWalkthroughStore.getState().activeIndex).toBe(1);
  });

  it("advances that step from a real joystick drag, end to end (R24)", () => {
    // The whole chain rather than a hand-written `move` delta: a thumb lands in
    // the left region, slides, and the walkthrough moves on. Onboarding is the
    // one screen where a stalled first step is unrecoverable — a player who
    // cannot complete "move" never sees step two, and the overlay sits there
    // telling them to do the thing they are already doing.
    useWalkthroughStore.getState().startIfUnseen();

    const state = new IntentState();
    const touch = new TouchSource(state, () => 1000);
    touch.setSurfaceWidth(1000);

    touch.touchStart([{ id: 1, x: 100, y: 300 }]);
    expect(movementIntended(state)).toBe(false); // anchored, not yet deflected

    touch.touchMove([{ id: 1, x: 100, y: 260 }]);
    if (movementIntended(state)) useWalkthroughStore.getState().notify("move");

    expect(useWalkthroughStore.getState().activeIndex).toBe(1);
  });

  it("does not advance it from a look drag on the play surface", () => {
    // Looking around is not walking. The step would otherwise complete itself
    // the moment a first-time player oriented the camera, teaching nothing.
    useWalkthroughStore.getState().startIfUnseen();

    const state = new IntentState();
    const touch = new TouchSource(state, () => 1000);
    touch.setSurfaceWidth(1000);

    touch.touchStart([{ id: 1, x: 700, y: 300 }]);
    touch.touchMove([{ id: 1, x: 760, y: 300 }]);

    expect(movementIntended(state)).toBe(false);
    expect(useWalkthroughStore.getState().activeIndex).toBe(0);
  });
});

describe("intent vocabulary the overlays depend on", () => {
  it("maps every overlay key to the intent its consumer registers for", () => {
    expect(KEY_EDGE_INTENTS.KeyT).toBe("openChat");
    expect(KEY_EDGE_INTENTS.KeyM).toBe("toggleMinimap");
    expect(KEY_EDGE_INTENTS.F3).toBe("toggleDebug");
    expect(KEY_EDGE_INTENTS.Escape).toBe("pause");
    expect(KEY_EDGE_INTENTS.Enter).toBe("confirm");
  });
});
