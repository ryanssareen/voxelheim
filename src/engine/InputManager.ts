import { KeyboardMouseSource } from "@engine/input/keyboardMouseSource";
import { IntentState } from "@engine/input/snapshot";

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

  /**
   * @param now press-timestamp clock handed to the intent source. Injectable so
   *   tests can drive the double-tap window deterministically.
   */
  constructor(now: () => number = () => performance.now()) {
    this.source = new KeyboardMouseSource(this.intents, now);
  }

  /** Attaches all event listeners. */
  init(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;

    this.onKeyDown = (e: KeyboardEvent) => {
      // Ignore keys while typing in a text field (e.g. chat), so movement
      // keys like WASD / arrows don't drive the player during composition.
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }
      this.keys.add(e.code);
      this.source.keyDown(e.code);
    };
    this.onKeyUp = (e: KeyboardEvent) => {
      this.keys.delete(e.code);
      this.source.keyUp(e.code);
    };
    this.onMouseMove = (e: MouseEvent) => {
      // Intent look is not gated on pointer lock (R4); the legacy accumulator
      // below still is, because its consumers depend on that.
      this.source.look(e.movementX, e.movementY);
      if (!this.locked) return;
      this.mouseDx += e.movementX;
      this.mouseDy += e.movementY;
    };
    this.onMouseDown = (e: MouseEvent) => {
      if (e.button === 0) { this.leftClick = true; this.leftDown = true; }
      if (e.button === 2) { this.rightClick = true; this.rightDown = true; }
      this.source.mouseDown(e.button);
    };
    this.onMouseUp = (e: MouseEvent) => {
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
      if (!this.locked) {
        canvas.requestPointerLock();
      }
    };

    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    document.addEventListener("mousemove", this.onMouseMove);
    canvas.addEventListener("mousedown", this.onMouseDown);
    window.addEventListener("mouseup", this.onMouseUp);
    document.addEventListener("pointerlockchange", this.onPointerLockChange);
    canvas.addEventListener("click", this.onCanvasClick);

    // Prevent context menu on right-click
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
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
    if (this.locked && document.exitPointerLock) {
      document.exitPointerLock();
    }
  }
}
