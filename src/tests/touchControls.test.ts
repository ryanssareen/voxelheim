import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as THREE from "three";
import { InputManager } from "@engine/InputManager";
import { IntentState } from "@engine/input/snapshot";
import { DEFAULT_TOUCH_CONFIG, TouchSource } from "@engine/input/touchSource";
import { readEngineFrameEdges } from "@engine/input/frameIntents";
import {
  CHAT_OPEN_BLOCKERS,
  MINIMAP_TOGGLE_BLOCKERS,
  PAUSE_BLOCKERS,
  UI_PRIORITY,
  UiIntentRouter,
  type UiInputState,
} from "@engine/input/uiIntents";
import { BlockBreakOverlay, BlockTargetOutline } from "@engine/renderer/BlockBreakOverlay";
import { useChatStore } from "@store/useChatStore";
import { useGameStore } from "@store/useGameStore";
import { useInventoryStore } from "@store/useInventoryStore";
import { crosshairBarMetrics, crosshairVisible, touchProgressBarMetrics } from "@ui/HUD";
import { HOTBAR_DOCK_INTENT, hotbarIntentForIndex } from "@ui/HotbarUI";
import {
  TOUCH_CORNER_CONTROLS,
  TOUCH_HINT_LINES,
  TOUCH_HINT_STORAGE_KEY,
  TOUCH_HOLD_CONTROLS,
  TOUCH_TARGET_MIN,
  joystickPlacement,
  markTouchHintSeen,
  panelIsOpen,
  touchControlLayout,
  touchControlsVisible,
  touchHintSeen,
} from "@ui/TouchControls";
import { hudMetrics } from "@ui/useHudScale";
import { installWindow, removeWindow, throwingStorage } from "./helpers";

/**
 * U7: the on-screen controls, the touch aim indicator, and the hotbar strip's
 * touch affordances.
 *
 * The components themselves cannot be rendered here — `vitest.config.ts` runs
 * `environment: "node"` and the plan keeps it that way, because adding jsdom
 * changes the environment for every one of the 46 test files to make four
 * overlays mountable. So this file tests the two halves a DOM would have sat
 * between:
 *
 *  - The **decisions**, as the pure functions the components call: what is
 *    visible for a given input source, where each control sits, where the knob
 *    goes for a given stick, where break progress is drawn.
 *  - The **wiring**, by pressing the same intents the handlers press, through
 *    the real `TouchSource`, and asserting the real consumer downstream reacts —
 *    the frame loop for hotbar and inventory, the UI router for pause, chat and
 *    the map.
 *
 * What that leaves uncovered is JSX: that a button's `onPointerDown` is bound to
 * the intent asserted here. The control tables are exported and rendered from
 * directly, so the mapping under test is the one the component draws from, but
 * the binding itself is checked on a device.
 */

// ---------------------------------------------------------------------------
// Stubs — the hand-rolled window/document/canvas from InputManager.test.ts
// ---------------------------------------------------------------------------

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
}

function makeKeyEvent(type: string, code: string) {
  const e = new Event(type, { cancelable: true }) as Event & { code: string };
  e.code = code;
  return e;
}

function makeTouchEvent(type: string, points: ReadonlyArray<{ id: number; x: number; y: number }>) {
  const e = new Event(type, { cancelable: true });
  const touches = points.map((p) => ({ identifier: p.id, clientX: p.x, clientY: p.y }));
  Object.defineProperty(e, "changedTouches", { value: touches, configurable: true });
  return e;
}

/** Clear of the joystick's left region at the stub canvas's 1000px width. */
const ON_PLAY_SURFACE = 700;
const IN_LEFT_REGION = 100;

/** Landscape viewports the controls have to be usable at. */
const VIEWPORTS: Array<[number, number, string]> = [
  [568, 320, "small phone landscape"],
  [667, 375, "phone landscape"],
  [844, 390, "tall phone landscape"],
  [1024, 768, "tablet landscape"],
  [1280, 800, "laptop"],
];

// ---------------------------------------------------------------------------
// Visibility follows the input source (R27, R28)
// ---------------------------------------------------------------------------

describe("the overlay follows the live input source", () => {
  let win: FakeCanvas;
  let doc: FakeDocument;
  let canvas: FakeCanvas;
  let input: InputManager;

  /** Stands in for the one line the engine's frame loop runs in its `finally`. */
  const publishSource = () =>
    useGameStore.getState().setInputSource(input.intents.source);

  beforeEach(() => {
    win = new FakeCanvas();
    doc = new FakeDocument();
    canvas = new FakeCanvas();
    vi.stubGlobal("window", win);
    vi.stubGlobal("document", doc);
    useGameStore.setState({ inputSource: "keyboardMouse", isPaused: false, isDead: false });
    input = new InputManager(() => 1000);
    input.init(canvas as unknown as HTMLCanvasElement);
  });

  afterEach(() => {
    input.dispose();
    useGameStore.setState({ inputSource: "keyboardMouse", isPaused: false });
    vi.unstubAllGlobals();
  });

  it("draws nothing on a keyboard, and keeps the crosshair", () => {
    publishSource();

    expect(touchControlsVisible(useGameStore.getState().inputSource)).toBe(false);
    expect(crosshairVisible(useGameStore.getState().inputSource)).toBe(true);
  });

  it("appears on the first contact, and takes the crosshair with it (R10, R27)", () => {
    canvas.dispatchEvent(makeTouchEvent("touchstart", [{ id: 1, x: ON_PLAY_SURFACE, y: 200 }]));
    publishSource();

    expect(touchControlsVisible(useGameStore.getState().inputSource)).toBe(true);
    expect(crosshairVisible(useGameStore.getState().inputSource)).toBe(false);
  });

  it("disappears again when the player goes back to the keyboard (R28)", () => {
    canvas.dispatchEvent(makeTouchEvent("touchstart", [{ id: 1, x: ON_PLAY_SURFACE, y: 200 }]));
    publishSource();
    expect(touchControlsVisible(useGameStore.getState().inputSource)).toBe(true);

    win.dispatchEvent(makeKeyEvent("keydown", "KeyW"));
    publishSource();

    expect(touchControlsVisible(useGameStore.getState().inputSource)).toBe(false);
    expect(crosshairVisible(useGameStore.getState().inputSource)).toBe(true);

    // ...and back, with no reload in between.
    canvas.dispatchEvent(makeTouchEvent("touchstart", [{ id: 2, x: ON_PLAY_SURFACE, y: 200 }]));
    publishSource();
    expect(touchControlsVisible(useGameStore.getState().inputSource)).toBe(true);
  });

  it("arms touch mode from a control press alone, before any canvas contact", () => {
    // A player who taps pause first — a real first move on a phone — must not
    // have to touch the play surface to make the controls appear.
    input.touch.pressButton("pause");
    publishSource();

    expect(touchControlsVisible(useGameStore.getState().inputSource)).toBe(true);
    expect(doc.pointerLockElement).toBeNull();
    expect(canvas.requestPointerLock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Corner controls reach their consumers (R22)
// ---------------------------------------------------------------------------

describe("corner controls", () => {
  let win: FakeCanvas;
  let doc: FakeDocument;
  let canvas: FakeCanvas;
  let input: InputManager;
  let router: UiIntentRouter;

  /** The four guard conditions, read from the live stores. */
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

  function resetStores() {
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

  /** Presses the control the overlay renders for `label`. */
  function pressControl(label: string) {
    const control = TOUCH_CORNER_CONTROLS.find((c) => c.label === label);
    if (!control) throw new Error(`no corner control labelled ${label}`);
    input.touch.pressButton(control.intent);
  }

  it("offers exactly pause, chat and the map", () => {
    // Every other keyboard-only action is U12's parity sweep; this pins what
    // this unit claims to cover so the two cannot silently overlap.
    expect(TOUCH_CORNER_CONTROLS.map((c) => c.intent)).toEqual([
      "pause",
      "openChat",
      "toggleMinimap",
    ]);
  });

  it("pauses with no pointer lock ever acquired (R22)", () => {
    router.register({
      intent: "pause",
      blockers: PAUSE_BLOCKERS,
      priority: UI_PRIORITY.hud,
      exclusive: false,
      run: () => useGameStore.getState().setPaused(true),
    });

    pressControl("Pause");

    expect(useGameStore.getState().isPaused).toBe(true);
    expect(canvas.requestPointerLock).not.toHaveBeenCalled();
    expect(doc.exitPointerLock).not.toHaveBeenCalled();
    expect(doc.pointerLockElement).toBeNull();
  });

  it("is idempotent — a second tap does not resume the game", () => {
    router.register({
      intent: "pause",
      blockers: PAUSE_BLOCKERS,
      priority: UI_PRIORITY.hud,
      exclusive: false,
      run: () => useGameStore.getState().setPaused(true),
    });

    pressControl("Pause");
    pressControl("Pause");

    expect(useGameStore.getState().isPaused).toBe(true);
  });

  it("opens chat and toggles the map through the same consumers the keys reach", () => {
    let chatOpens = 0;
    let mapToggles = 0;
    router.register({
      intent: "openChat",
      blockers: CHAT_OPEN_BLOCKERS,
      priority: UI_PRIORITY.hud,
      exclusive: false,
      run: () => chatOpens++,
    });
    router.register({
      intent: "toggleMinimap",
      blockers: MINIMAP_TOGGLE_BLOCKERS,
      priority: UI_PRIORITY.hud,
      exclusive: false,
      run: () => mapToggles++,
    });

    pressControl("Chat");
    pressControl("Map");

    expect(chatOpens).toBe(1);
    expect(mapToggles).toBe(1);
  });

  it("respects the same guards a key press does — no chat over an open panel", () => {
    let chatOpens = 0;
    router.register({
      intent: "openChat",
      blockers: CHAT_OPEN_BLOCKERS,
      priority: UI_PRIORITY.hud,
      exclusive: false,
      run: () => chatOpens++,
    });
    useInventoryStore.setState({ isOpen: true });

    pressControl("Chat");

    expect(chatOpens).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Hotbar strip: taps and the docked inventory control (R14, R15)
// ---------------------------------------------------------------------------

describe("hotbar taps", () => {
  let state: IntentState;
  let touch: TouchSource;

  beforeEach(() => {
    state = new IntentState();
    touch = new TouchSource(state, () => 1000);
  });

  it("maps every slot index to its own press", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8].map(hotbarIntentForIndex)).toEqual([
      "hotbar1",
      "hotbar2",
      "hotbar3",
      "hotbar4",
      "hotbar5",
      "hotbar6",
      "hotbar7",
      "hotbar8",
      "hotbar9",
    ]);
  });

  it("clamps an out-of-range index rather than inventing an intent", () => {
    expect(hotbarIntentForIndex(-4)).toBe("hotbar1");
    expect(hotbarIntentForIndex(99)).toBe("hotbar9");
  });

  it("selects the slot matching the tapped index, through the frame loop", () => {
    for (let index = 0; index < 9; index++) {
      touch.pressButton(hotbarIntentForIndex(index));
      expect(readEngineFrameEdges(state).hotbarSlot).toBe(index);
    }
  });

  it("resolves two taps in one frame to the last one, as the number row does", () => {
    touch.pressButton(hotbarIntentForIndex(2));
    touch.pressButton(hotbarIntentForIndex(6));

    expect(readEngineFrameEdges(state).hotbarSlot).toBe(6);
  });

  it("opens the panel from the docked control, on the key's own path (R14)", () => {
    touch.pressButton(HOTBAR_DOCK_INTENT);

    // `togglePanel` is what `KeyE` produces, so the control closes an open
    // panel as well as opening a closed one, with no second rule to keep in
    // step.
    expect(readEngineFrameEdges(state).togglePanel).toBe(true);
  });

  it("closes an open panel with the same press that opened it", () => {
    // The panels' own close hint reads "Press E to close", which a phone has no
    // way of doing, so the overlay keeps this one control on screen while a
    // panel is up. It is the dock control's intent, not a second rule: the
    // engine's toggle closes whichever panel is open.
    useInventoryStore.setState({ isOpen: true });
    expect(panelIsOpen(useInventoryStore.getState())).toBe(true);

    touch.pressButton(HOTBAR_DOCK_INTENT);

    expect(readEngineFrameEdges(state).togglePanel).toBe(true);
    useInventoryStore.setState({ isOpen: false });
  });

  it("counts every panel as open, so none of them can strand a thumb", () => {
    const closed = {
      isOpen: false,
      tableOpen: false,
      furnaceOpen: false,
      creativeOpen: false,
    };
    expect(panelIsOpen(closed)).toBe(false);

    for (const key of ["isOpen", "tableOpen", "furnaceOpen", "creativeOpen"] as const) {
      expect(panelIsOpen({ ...closed, [key]: true }), key).toBe(true);
    }
  });

  it("arms touch mode, so the strip stays interactive after a tap", () => {
    touch.pressButton(hotbarIntentForIndex(3));

    expect(state.source).toBe("touch");
  });

  it("does not disturb what the thumbs are doing", () => {
    touch.setSurfaceWidth(1000);
    touch.touchStart([{ id: 1, x: IN_LEFT_REGION, y: 300 }]);
    touch.touchMove([{ id: 1, x: IN_LEFT_REGION, y: 240 }]);

    touch.pressButton(hotbarIntentForIndex(4));

    expect(state.delta("move").y).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Jump and crouch (R9, R12)
// ---------------------------------------------------------------------------

describe("jump and crouch buttons", () => {
  let state: IntentState;
  let touch: TouchSource;
  let clock: number;

  beforeEach(() => {
    state = new IntentState();
    clock = 1000;
    touch = new TouchSource(state, () => clock);
    touch.setSurfaceWidth(1000);
  });

  it("stacks jump below crouch, nearest the resting thumb", () => {
    expect(TOUCH_HOLD_CONTROLS.map((c) => c.intent)).toEqual(["jump", "sneak"]);
  });

  it("holds and releases the intent the button names", () => {
    for (const control of TOUCH_HOLD_CONTROLS) {
      touch.holdButton(control.intent, true);
      expect(state.isHeld(control.intent)).toBe(true);

      touch.holdButton(control.intent, false);
      expect(state.isHeld(control.intent)).toBe(false);
    }
  });

  it("keeps holding across frames, so flight ascends while the thumb rests", () => {
    touch.holdButton("jump", true);

    for (let frame = 0; frame < 3; frame++) {
      clock += 16;
      state.clearDeltas();
      touch.endFrame();
      expect(state.isHeld("jump")).toBe(true);
    }
  });

  it("moves, looks and jumps as three independent touches (R12)", () => {
    // Thumb one anchors the stick and pushes forward.
    touch.touchStart([{ id: 1, x: IN_LEFT_REGION, y: 300 }]);
    touch.touchMove([{ id: 1, x: IN_LEFT_REGION, y: 260 }]);
    // Thumb two drags to look. Two moves: the first crosses the look threshold
    // and is deliberately not spent, so that the slop a tap is allowed never
    // arrives as a camera jerk.
    touch.touchStart([{ id: 2, x: ON_PLAY_SURFACE, y: 300 }]);
    touch.touchMove([{ id: 2, x: ON_PLAY_SURFACE + 40, y: 300 }]);
    touch.touchMove([{ id: 2, x: ON_PLAY_SURFACE + 70, y: 300 }]);
    const movedBefore = state.delta("move");
    const lookedBefore = state.delta("look");

    // Thumb three presses jump.
    touch.holdButton("jump", true);

    expect(state.isHeld("jump")).toBe(true);
    expect(state.delta("move")).toEqual(movedBefore);
    expect(state.delta("look")).toEqual(lookedBefore);
    expect(movedBefore.y).toBeGreaterThan(0);
    expect(lookedBefore.x).toBeGreaterThan(0);

    // ...and the look keeps accruing while the button is down.
    touch.touchMove([{ id: 2, x: ON_PLAY_SURFACE + 110, y: 300 }]);
    expect(state.delta("look").x).toBeGreaterThan(lookedBefore.x);
    expect(state.isHeld("jump")).toBe(true);
  });

  it("does not interrupt a mine in progress", () => {
    touch.touchStart([{ id: 1, x: ON_PLAY_SURFACE, y: 300 }]);
    clock += 250;
    touch.endFrame();
    expect(state.isHeld("primary")).toBe(true);

    touch.holdButton("sneak", true);

    expect(state.isHeld("primary")).toBe(true);
    expect(state.isHeld("sneak")).toBe(true);
  });

  it("drops a button left held when the source is torn down", () => {
    // The DOM release handlers are the first line, but a control unmounted
    // mid-press (input source flipped, engine disposed) has no handler left to
    // fire — a jump held forever is the failure that would follow.
    touch.holdButton("jump", true);

    touch.releaseAll();

    expect(state.isHeld("jump")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Layout (R6, R9)
// ---------------------------------------------------------------------------

describe("control layout", () => {
  it.each(VIEWPORTS)("is thumb-sized and reachable at %ix%i (%s)", (vw, vh) => {
    const m = hudMetrics(vw, vh);
    const layout = touchControlLayout(vw, vh, m);

    for (const size of [layout.actionButton, layout.iconButton, layout.joystickKnob]) {
      expect(size).toBeGreaterThanOrEqual(TOUCH_TARGET_MIN);
    }
    for (const [key, value] of Object.entries(layout)) {
      expect(Number.isInteger(value), key).toBe(true);
      expect(value, key).toBeGreaterThan(0);
    }

    // The stack sits above the hotbar strip, never over a slot.
    expect(layout.actionBottom).toBeGreaterThanOrEqual(m.hotbarHeight);
    // ...and clear of the corner icons at the other side of the screen.
    expect(layout.iconTop).toBeGreaterThanOrEqual(12 + m.sunH);

    // Reach: the far corner of the upper button, measured from the bottom-right
    // corner the thumb is anchored in.
    const stackHeight = layout.actionButton * 2 + layout.actionGap;
    const dx = layout.inset + layout.actionButton;
    const dy = layout.actionBottom + stackHeight;
    expect(Math.hypot(dx, dy)).toBeLessThan(Math.hypot(vw, vh) * 0.5);
    // Everything stays on screen.
    expect(dy).toBeLessThan(vh);
    expect(layout.iconTop + 3 * (layout.iconButton + layout.iconGap)).toBeLessThan(vh);
  });

  it("draws the joystick ring at the radius the source actually reads", () => {
    const layout = touchControlLayout(844, 390, hudMetrics(844, 390));

    // A ring drawn at some other size would say the stick is at full tilt
    // somewhere it is not.
    expect(layout.joystickRadius).toBe(DEFAULT_TOUCH_CONFIG.joystickRadiusPx);
  });

  it("survives a viewport that has not been measured yet", () => {
    // The overlay renders once before its resize listener has run.
    const layout = touchControlLayout(0, 0, hudMetrics(0, 0));

    for (const [key, value] of Object.entries(layout)) {
      expect(Number.isFinite(value), key).toBe(true);
      expect(value, key).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Joystick rendering (R6)
// ---------------------------------------------------------------------------

describe("joystick placement", () => {
  const RADIUS = DEFAULT_TOUCH_CONFIG.joystickRadiusPx;
  let state: IntentState;
  let touch: TouchSource;

  beforeEach(() => {
    state = new IntentState();
    touch = new TouchSource(state, () => 1000);
    touch.setSurfaceWidth(1000);
  });

  /** The live joystick, or a failure if the thumb is not on it. */
  function view() {
    const live = touch.getJoystick();
    if (!live) throw new Error("no joystick anchored");
    return live;
  }

  it("puts the knob on the anchor while the thumb has not moved", () => {
    touch.touchStart([{ id: 1, x: 120, y: 260 }]);

    const place = joystickPlacement(view(), RADIUS);

    expect(place).toEqual({ anchorX: 120, anchorY: 260, knobX: 120, knobY: 260 });
  });

  it("draws the ring where the thumb landed, not at a fixed spot (R6)", () => {
    touch.touchStart([{ id: 1, x: 40, y: 300 }]);
    expect(joystickPlacement(view(), RADIUS).anchorX).toBe(40);

    touch.touchEnd([{ id: 1, x: 40, y: 300 }]);
    touch.touchStart([{ id: 2, x: 300, y: 120 }]);

    expect(joystickPlacement(view(), RADIUS)).toMatchObject({ anchorX: 300, anchorY: 120 });
  });

  it("moves the knob up when the thumb pushes forward", () => {
    touch.touchStart([{ id: 1, x: 120, y: 260 }]);
    touch.touchMove([{ id: 1, x: 120, y: 260 - RADIUS / 2 }]);

    const place = joystickPlacement(view(), RADIUS);

    expect(place.knobY).toBeLessThan(place.anchorY);
    expect(place.knobX).toBe(place.anchorX);
    // The player is walking forward, and the knob agrees with them.
    expect(state.delta("move").y).toBeGreaterThan(0);
  });

  it("never lets the knob escape the ring, however far the thumb slides", () => {
    touch.touchStart([{ id: 1, x: 120, y: 260 }]);
    touch.touchMove([{ id: 1, x: 120 + RADIUS * 8, y: 260 - RADIUS * 8 }]);

    const place = joystickPlacement(view(), RADIUS);
    const offset = Math.hypot(place.knobX - place.anchorX, place.knobY - place.anchorY);

    expect(offset).toBeLessThanOrEqual(RADIUS + 1e-9);
    expect(offset).toBeCloseTo(RADIUS, 6);
  });

  it("has nothing to draw once the thumb lifts", () => {
    touch.touchStart([{ id: 1, x: 120, y: 260 }]);
    touch.touchEnd([{ id: 1, x: 120, y: 260 }]);

    expect(touch.getJoystick()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Aim indicator (R10)
// ---------------------------------------------------------------------------

describe("block target outline", () => {
  /** The two nested wire boxes, outermost first. */
  function layersOf(outline: BlockTargetOutline): THREE.LineSegments[] {
    return outline.getObject().children as THREE.LineSegments[];
  }

  function colorOf(lines: THREE.LineSegments): number {
    return (lines.material as THREE.LineBasicMaterial).color.getHex();
  }

  /** Half-extent of a wire box, from its own geometry. */
  function radiusOf(lines: THREE.LineSegments): number {
    lines.geometry.computeBoundingBox();
    return lines.geometry.boundingBox!.max.x;
  }

  it("hides until a block is aimed at, then sits on that block", () => {
    const outline = new BlockTargetOutline();
    expect(outline.getObject().visible).toBe(false);

    outline.update({ x: 4, y: -2, z: 7 });

    expect(outline.getObject().visible).toBe(true);
    // Block centre, since the box is drawn around the whole cube.
    expect(outline.getObject().position.toArray()).toEqual([4.5, -1.5, 7.5]);

    outline.update(null);
    expect(outline.getObject().visible).toBe(false);
    outline.dispose();
  });

  it("reads on light and dark faces alike: a dark casing around a light core", () => {
    const outline = new BlockTargetOutline();
    const [casing, core] = layersOf(outline);

    expect(colorOf(casing)).toBe(0x000000);
    expect(colorOf(core)).toBe(0xffffff);
    // The dark one is outside, so the pair reads as a haloed line rather than
    // two boxes, and whichever matches the face behind it, the other shows.
    expect(radiusOf(casing)).toBeGreaterThan(radiusOf(core));
    outline.dispose();
  });

  it("stands clear of the block's own faces, so it cannot z-fight them", () => {
    const outline = new BlockTargetOutline();

    for (const lines of layersOf(outline)) {
      expect(radiusOf(lines)).toBeGreaterThan(0.5);
      // ...but still reads as this block's outline rather than a box around it.
      expect(radiusOf(lines)).toBeLessThan(0.52);
    }
    outline.dispose();
  });

  it("never occludes the world it annotates", () => {
    const outline = new BlockTargetOutline();

    for (const lines of layersOf(outline)) {
      const material = lines.material as THREE.LineBasicMaterial;
      expect(material.depthWrite).toBe(false);
      // Depth *testing* stays on: a block in front must still hide it.
      expect(material.depthTest).toBe(true);
    }
    outline.dispose();
  });

  it("disposes without throwing, twice", () => {
    const outline = new BlockTargetOutline();
    outline.dispose();
    expect(() => outline.dispose()).not.toThrow();
  });
});

describe("the break overlay drives the outline", () => {
  it("shows the outline on the aimed block while nothing is being mined", () => {
    const overlay = new BlockBreakOverlay();

    overlay.update(null, 0, { x: 1, y: 2, z: 3 });

    expect(overlay.getOutline().visible).toBe(true);
    expect(overlay.getMesh().visible).toBe(false);
    overlay.dispose();
  });

  it("clears the outline on every path that stops mining", () => {
    // The paused, dead and panel-open frames all call `update(null, 0)`, and
    // the default third argument is what makes each of them clear the outline
    // without being changed.
    const overlay = new BlockBreakOverlay();
    overlay.update(null, 0, { x: 1, y: 2, z: 3 });

    overlay.update(null, 0);

    expect(overlay.getOutline().visible).toBe(false);
    overlay.dispose();
  });

  it("keeps desktop as it was: no aim target, no outline", () => {
    const overlay = new BlockBreakOverlay();

    overlay.update({ x: 5, y: 5, z: 5 }, 0.5);

    expect(overlay.getOutline().visible).toBe(false);
    overlay.dispose();
  });

  it("draws the outline headless, where the crack textures cannot be built", () => {
    // vitest runs in node, so there is no 2D context for the crack canvases —
    // but the outline is geometry, and the aim indicator has to survive the
    // one place the overlay degrades.
    expect(typeof document).toBe("undefined");
    const overlay = new BlockBreakOverlay();

    overlay.update({ x: 0, y: 0, z: 0 }, 0.9, { x: 0, y: 0, z: 0 });

    expect(overlay.getMesh().visible).toBe(false);
    expect(overlay.getOutline().visible).toBe(true);
    expect(() => overlay.dispose()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Break progress placement (R11)
// ---------------------------------------------------------------------------

describe("break progress in touch mode", () => {
  it.each(VIEWPORTS)("stays clear of the acting finger at %ix%i (%s)", (vw, vh) => {
    const m = hudMetrics(vw, vh);
    const bar = touchProgressBarMetrics(m);

    for (const [key, value] of Object.entries(bar)) {
      expect(Number.isInteger(value), key).toBe(true);
    }
    // The finger that mines sits where the player aims — the middle of the
    // screen, with no crosshair there to say so. The bar lives at the top.
    expect(bar.top + bar.height).toBeLessThan(vh * 0.35);
    // Below the shard counter rather than through it.
    expect(bar.top).toBeGreaterThan(12 + m.shardFont);
    expect(bar.width).toBeLessThan(vw);
  });

  it("is easier to read at a distance than the crosshair bar it replaces", () => {
    const m = hudMetrics(844, 390);

    expect(touchProgressBarMetrics(m).width).toBeGreaterThan(crosshairBarMetrics(m).width);
    expect(touchProgressBarMetrics(m).height).toBeGreaterThan(crosshairBarMetrics(m).height);
  });
});

// ---------------------------------------------------------------------------
// First-session hint (R13)
// ---------------------------------------------------------------------------

describe("the gesture hint", () => {
  afterEach(removeWindow);

  it("covers exactly the three gestures nothing on screen labels", () => {
    expect(TOUCH_HINT_LINES).toHaveLength(3);
    expect(TOUCH_HINT_LINES.map((l) => l.gesture)).toEqual(["Drag", "Hold", "Tap"]);
    const meanings = TOUCH_HINT_LINES.map((l) => l.meaning.toLowerCase()).join(" ");
    expect(meanings).toContain("look");
    expect(meanings).toContain("mine");
    expect(meanings).toContain("place");
  });

  it("shows on a first touch session and never again after dismissal", () => {
    const storage = installWindow();
    expect(touchHintSeen()).toBe(false);

    markTouchHintSeen();

    expect(touchHintSeen()).toBe(true);
    expect(storage.local.get(TOUCH_HINT_STORAGE_KEY)).toBe("true");
  });

  it("stays dismissed across a reload", () => {
    installWindow();
    markTouchHintSeen();

    // A fresh page reads the same key back rather than any in-memory state.
    expect(touchHintSeen()).toBe(true);
  });

  it("shows again rather than crashing when storage is blocked", () => {
    installWindow({ localStorage: throwingStorage() });

    expect(() => markTouchHintSeen()).not.toThrow();
    expect(touchHintSeen()).toBe(false);
  });

  it("treats a missing window as a first session (SSR)", () => {
    removeWindow();

    expect(touchHintSeen()).toBe(false);
  });
});
