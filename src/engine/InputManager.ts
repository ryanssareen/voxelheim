/**
 * Captures keyboard, mouse movement, mouse buttons, and pointer lock state.
 * Call init(canvas) to attach listeners; dispose() to remove them.
 */
export class InputManager {
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

  /** Attaches all event listeners. */
  init(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;

    this.onKeyDown = (e: KeyboardEvent) => {
      this.keys.add(e.code);
    };
    this.onKeyUp = (e: KeyboardEvent) => {
      this.keys.delete(e.code);
    };
    this.onMouseMove = (e: MouseEvent) => {
      if (!this.locked) return;
      this.mouseDx += e.movementX;
      this.mouseDy += e.movementY;
    };
    this.onMouseDown = (e: MouseEvent) => {
      if (e.button === 0) { this.leftClick = true; this.leftDown = true; }
      if (e.button === 2) { this.rightClick = true; this.rightDown = true; }
    };
    this.onMouseUp = (e: MouseEvent) => {
      if (e.button === 0) this.leftDown = false;
      if (e.button === 2) this.rightDown = false;
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
