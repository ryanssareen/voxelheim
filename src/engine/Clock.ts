/**
 * Simple frame clock using performance.now().
 * Returns delta time in seconds, capped to prevent physics explosions.
 */
export class Clock {
  private lastTime = 0;
  private started = false;

  /** Maximum delta time in seconds. Prevents physics explosions after tab-switch. */
  static readonly MAX_DELTA = 0.05;

  /** Returns seconds since last call, capped at {@link MAX_DELTA}. First call returns 0. */
  getDelta(): number {
    const now = performance.now();
    if (!this.started) {
      this.started = true;
      this.lastTime = now;
      return 0;
    }
    const delta = (now - this.lastTime) / 1000;
    this.lastTime = now;
    return Math.min(delta, Clock.MAX_DELTA);
  }
}
