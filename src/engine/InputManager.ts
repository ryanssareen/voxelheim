import { KeyboardMouseSource } from "@engine/input/keyboardMouseSource";
import { IntentState } from "@engine/input/snapshot";
import { TouchSource, type TouchPoint } from "@engine/input/touchSource";

/**
 * Codes whose pre-U5 React listener ran with no typing guard and swallowed the
 * browser default.
 *
 * Only F3 qualifies: the debug overlay's own `window` listener checked nothing
 * about the event target, so F3 toggled the overlay even mid-sentence in chat,
 * and called `preventDefault()` so Firefox did not open find-in-page. Both
 * moved here with the handler. The typing quirk is a latent bug the plan's
 * Scope Boundaries defer on purpose — a refactor that quietly fixes behaviour
 * is one nothing can verify — so this set shrinks to empty in that follow-up,
 * not here.
 *
 * Nothing else belongs in it. The chat and minimap keys have always respected
 * the typing guard, and moving a movement key in would let WASD drive the
 * player out from under a chat message.
 */
const UNGUARDED_UI_CODES = new Set(["F3"]);

/**
 * How long after touch activity a mouse event is assumed to be the browser's
 * compatibility synthesis rather than a real mouse.
 *
 * Browsers fire a `mousemove`/`mousedown`/`mouseup`/`click` burst after a touch
 * so that mouse-only pages keep working. Here every one of them is a duplicate:
 * the touch already produced its intent, and the synthesized `click` is the one
 * that reaches the pointer-lock request, which on a phone yields a lock the
 * player cannot exit and a look source they never asked for.
 *
 * `preventDefault()` on the touch events suppresses the synthesis on most
 * browsers; this window is the belt to that pair of braces, because the ones
 * that synthesize anyway give no signal that they did. Long enough to cover the
 * burst (Safari's synthesized `click` can trail touchend by ~500 ms), short
 * enough that a player who genuinely puts the finger down and reaches for the
 * mouse loses at most one click.
 */
const COMPAT_MOUSE_WINDOW_MS = 700;

/**
 * Styles that stop the browser claiming the play surface's gestures (R20).
 *
 * All four are gesture suppression, not decoration: `touch-action` is what
 * disables double-tap-to-zoom and pan-scroll — without it the browser waits
 * ~300 ms on every tap to see whether a second one is coming, which is felt
 * directly as place lag — and the other three remove the long-press callout,
 * the text-selection that a hold-to-mine otherwise starts, and the grey tap
 * flash. Applied here rather than in CSS so the play surface carries them
 * wherever the canvas is mounted.
 */
const TOUCH_SURFACE_STYLES: ReadonlyArray<readonly [string, string]> = [
  ["touch-action", "none"],
  ["-webkit-touch-callout", "none"],
  ["-webkit-user-select", "none"],
  ["user-select", "none"],
];

/**
 * Captures keyboard, mouse movement, mouse buttons, and pointer lock state.
 * Call init(canvas) to attach listeners; dispose() to remove them.
 *
 * It is also the keyboard/mouse **source** for the intent layer: every event it
 * already listens for is forwarded to a {@link KeyboardMouseSource}, which
 * writes named intents into {@link InputManager.intents}.
 *
 * Since U4 no gameplay code polls the direct accessors below (`isKeyDown`,
 * `getMouseButton`, `isMouseButtonDown`, `getMouseDelta`) — `Engine`,
 * `PlayerController` and `BlockInteraction` all read the snapshot. They stay
 * because the characterization suite pins them, and pinning both faces against
 * the same event stream is what proves desktop behaviour came through the
 * refactor intact; the React listeners (U5) are the last surface still outside
 * the layer.
 *
 * One deliberate difference between the two faces: `getMouseDelta()` drops
 * movement made while the pointer is not locked, where the intent layer
 * accumulates look deltas regardless (R4) — a finger drag will never hold a
 * lock. The frame loop calls `endFrame()` on every path so an unread delta is
 * cleared rather than saved up into a camera snap.
 */
export class InputManager {
  /**
   * Named intents produced from the events below. Consumers should type this as
   * `IntentSnapshot` (read-only); the frame loop needs the `IntentState` face to
   * set suppression, `drain()` on panel-open frames, and `endFrame()`.
   */
  readonly intents = new IntentState();
  private readonly source: KeyboardMouseSource;
  /**
   * The touch source. Public because the on-screen controls (U7) press its
   * buttons and draw its joystick; the canvas contacts below are forwarded to it
   * the same way key and mouse events are forwarded to `source`.
   */
  readonly touch: TouchSource;
  private readonly now: () => number;
  /**
   * When touch activity was last seen. Drives {@link COMPAT_MOUSE_WINDOW_MS};
   * `-Infinity` so a session that never touches the screen — every desktop
   * session — can never fall inside the window.
   */
  private lastTouchAt = -Infinity;

  private keys = new Set<string>();
  private mouseDx = 0;
  private mouseDy = 0;
  private leftClick = false;
  private rightClick = false;
  private leftDown = false;
  private rightDown = false;
  private locked = false;
  private canvas: HTMLCanvasElement | null = null;

  /** Called when pointer lock is lost (e.g., user pressed ESC). */
  public onPointerLockLost: (() => void) | null = null;

  private onKeyDown: ((e: KeyboardEvent) => void) | null = null;
  private onKeyUp: ((e: KeyboardEvent) => void) | null = null;
  private onMouseMove: ((e: MouseEvent) => void) | null = null;
  private onMouseDown: ((e: MouseEvent) => void) | null = null;
  private onMouseUp: ((e: MouseEvent) => void) | null = null;
  private onPointerLockChange: (() => void) | null = null;
  private onCanvasClick: (() => void) | null = null;
  private onTouchStart: ((e: TouchEvent) => void) | null = null;
  private onTouchMove: ((e: TouchEvent) => void) | null = null;
  private onTouchEnd: ((e: TouchEvent) => void) | null = null;
  private onTouchCancel: ((e: TouchEvent) => void) | null = null;

  /**
   * @param now press-timestamp clock handed to the intent source. Injectable so
   *   tests can drive the double-tap window deterministically.
   */
  constructor(now: () => number = () => performance.now()) {
    this.now = now;
    this.source = new KeyboardMouseSource(this.intents, now);
    this.touch = new TouchSource(this.intents, now);
  }

  /** Attaches all event listeners. */
  init(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;

    this.onKeyDown = (e: KeyboardEvent) => {
      if (UNGUARDED_UI_CODES.has(e.code)) e.preventDefault();
      // Ignore keys while typing in a text field (e.g. chat), so movement
      // keys like WASD / arrows don't drive the player during composition.
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        // ...except the handful of codes whose React listener never had this
        // guard. They reach the intent layer only; the legacy `keys` face keeps
        // the behaviour it has always had, so neither face is rewritten.
        if (UNGUARDED_UI_CODES.has(e.code)) this.source.keyDown(e.code);
        return;
      }
      // Past the typing guard, so this is a key the *game* consumed, not one the
      // player typed. Placed here on purpose (R28): a soft keyboard on a phone
      // fires keydown for every letter of a chat message, and flipping the
      // source above the guard would tear the touch controls down mid-sentence.
      this.intents.setSource("keyboardMouse");
      this.keys.add(e.code);
      this.source.keyDown(e.code);
    };
    this.onKeyUp = (e: KeyboardEvent) => {
      this.keys.delete(e.code);
      this.source.keyUp(e.code);
    };
    this.onMouseMove = (e: MouseEvent) => {
      if (this.isCompatMouseEvent()) return;
      this.intents.setSource("keyboardMouse");
      // Intent look is not gated on pointer lock (R4); the legacy accumulator
      // below still is, because its consumers depend on that.
      this.source.look(e.movementX, e.movementY);
      if (!this.locked) return;
      this.mouseDx += e.movementX;
      this.mouseDy += e.movementY;
    };
    this.onMouseDown = (e: MouseEvent) => {
      if (this.isCompatMouseEvent()) return;
      this.intents.setSource("keyboardMouse");
      if (e.button === 0) { this.leftClick = true; this.leftDown = true; }
      if (e.button === 2) { this.rightClick = true; this.rightDown = true; }
      this.source.mouseDown(e.button);
    };
    this.onMouseUp = (e: MouseEvent) => {
      if (this.isCompatMouseEvent()) return;
      if (e.button === 0) this.leftDown = false;
      if (e.button === 2) this.rightDown = false;
      this.source.mouseUp(e.button);
    };
    this.onPointerLockChange = () => {
      const wasLocked = this.locked;
      this.locked = document.pointerLockElement === canvas;
      if (wasLocked && !this.locked && this.onPointerLockLost) {
        this.onPointerLockLost();
      }
    };
    this.onCanvasClick = () => {
      // The synthesized click is the dangerous one: on a phone it would acquire
      // a pointer lock the player never asked for and cannot exit.
      if (this.isCompatMouseEvent()) return;
      if (!this.locked) {
        canvas.requestPointerLock();
      }
    };

    // Touch contacts. `preventDefault()` on every one of them is what stops the
    // browser synthesizing the mouse burst, scrolling the page under the player,
    // and — on touchstart — starting a text selection from a hold-to-mine. The
    // listeners are therefore non-passive; a passive listener's preventDefault()
    // is silently ignored, which would leave all three behaviours in place with
    // nothing to show for it.
    this.onTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      this.noteTouch();
      // Re-read each time rather than once at init: the surface changes width on
      // rotation, and the left region is a fraction of it.
      this.touch.setSurfaceWidth(canvas.clientWidth || window.innerWidth || 0);
      this.touch.touchStart(toTouchPoints(e));
    };
    this.onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      this.noteTouch();
      this.touch.touchMove(toTouchPoints(e));
    };
    this.onTouchEnd = (e: TouchEvent) => {
      e.preventDefault();
      this.noteTouch();
      this.touch.touchEnd(toTouchPoints(e));
    };
    this.onTouchCancel = (e: TouchEvent) => {
      this.noteTouch();
      this.touch.touchCancel(toTouchPoints(e));
    };

    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    document.addEventListener("mousemove", this.onMouseMove);
    canvas.addEventListener("mousedown", this.onMouseDown);
    window.addEventListener("mouseup", this.onMouseUp);
    document.addEventListener("pointerlockchange", this.onPointerLockChange);
    canvas.addEventListener("click", this.onCanvasClick);
    canvas.addEventListener("touchstart", this.onTouchStart, { passive: false });
    canvas.addEventListener("touchmove", this.onTouchMove, { passive: false });
    canvas.addEventListener("touchend", this.onTouchEnd, { passive: false });
    canvas.addEventListener("touchcancel", this.onTouchCancel);

    // Prevent context menu on right-click — and, on touch, the long-press menu,
    // which Android raises from a hold-to-mine.
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());

    for (const [property, value] of TOUCH_SURFACE_STYLES) {
      canvas.style?.setProperty(property, value);
    }
  }

  /**
   * True while a mouse event is more likely the browser's compatibility
   * synthesis after a touch than a real mouse. See
   * {@link COMPAT_MOUSE_WINDOW_MS}.
   */
  private isCompatMouseEvent(): boolean {
    return this.now() - this.lastTouchAt < COMPAT_MOUSE_WINDOW_MS;
  }

  private noteTouch(): void {
    this.lastTouchAt = this.now();
  }

  /** Returns true if the key (by KeyboardEvent.code) is currently held. */
  isKeyDown(key: string): boolean {
    return this.keys.has(key);
  }

  /** Returns accumulated mouse movement since last call. Resets accumulator. */
  getMouseDelta(): { dx: number; dy: number } {
    const dx = this.mouseDx;
    const dy = this.mouseDy;
    this.mouseDx = 0;
    this.mouseDy = 0;
    return { dx, dy };
  }

  /** Returns mouse buttons pressed this frame. Resets after reading. */
  getMouseButton(): { left: boolean; right: boolean } {
    const left = this.leftClick;
    const right = this.rightClick;
    this.leftClick = false;
    this.rightClick = false;
    return { left, right };
  }

  /** Returns true if the mouse button is currently held down. */
  isMouseButtonDown(button: 0 | 2): boolean {
    return button === 0 ? this.leftDown : this.rightDown;
  }

  /** Returns true if the pointer is currently locked to the canvas. */
  isPointerLocked(): boolean {
    return this.locked;
  }

  /**
   * Ends the intent frame: clears accumulated deltas so the next frame's look
   * describes only that frame. Call once per frame, after every consumer has
   * read the snapshot. Held state and queued edges are untouched — edges are
   * read through per-consumer cursors and must survive until each consumer has
   * seen them.
   */
  endFrame(): void {
    this.source.endFrame();
    // After the clear, never before: the joystick's `move` vector is a level
    // reading of where the thumb is rather than something that accumulates, and
    // a thumb held still emits no further events to restore it with.
    this.touch.endFrame();
  }

  /** Removes all event listeners. */
  dispose(): void {
    if (this.onKeyDown) window.removeEventListener("keydown", this.onKeyDown);
    if (this.onKeyUp) window.removeEventListener("keyup", this.onKeyUp);
    if (this.onMouseMove) document.removeEventListener("mousemove", this.onMouseMove);
    if (this.onMouseDown && this.canvas) this.canvas.removeEventListener("mousedown", this.onMouseDown);
    if (this.onMouseUp) window.removeEventListener("mouseup", this.onMouseUp);
    if (this.onPointerLockChange) document.removeEventListener("pointerlockchange", this.onPointerLockChange);
    if (this.onCanvasClick && this.canvas) this.canvas.removeEventListener("click", this.onCanvasClick);
    if (this.canvas) {
      if (this.onTouchStart) this.canvas.removeEventListener("touchstart", this.onTouchStart);
      if (this.onTouchMove) this.canvas.removeEventListener("touchmove", this.onTouchMove);
      if (this.onTouchEnd) this.canvas.removeEventListener("touchend", this.onTouchEnd);
      if (this.onTouchCancel) this.canvas.removeEventListener("touchcancel", this.onTouchCancel);
    }
    // Drops what touch is asserting without touching the keyboard's held state.
    this.touch.releaseAll();
    if (this.locked && document.exitPointerLock) {
      document.exitPointerLock();
    }
  }
}

/**
 * `TouchEvent.changedTouches` as the plain contacts {@link TouchSource} reads.
 *
 * Only the *changed* touches: a `touchmove` carrying one moving finger also
 * lists the two that stayed put, and replaying those as movement would make a
 * still thumb jitter the camera.
 */
function toTouchPoints(e: TouchEvent): TouchPoint[] {
  const points: TouchPoint[] = [];
  for (let i = 0; i < e.changedTouches.length; i++) {
    const touch = e.changedTouches[i];
    points.push({ id: touch.identifier, x: touch.clientX, y: touch.clientY });
  }
  return points;
}
