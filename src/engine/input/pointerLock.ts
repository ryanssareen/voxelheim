import { useGameStore } from "@store/useGameStore";

/**
 * Pointer lock, requested in the one place that knows how it is allowed to fail.
 *
 * `requestPointerLock()` returns a promise in current browsers, and a denial
 * rejects it. Every call site in this codebase used to fire it bare, so a denial
 * surfaced as an unhandled rejection — "The root document of this element is not
 * valid for pointer lock" — with no indication of which of the six call sites
 * produced it or whether anything was actually broken.
 *
 * A denial is usually not a fault. The game runs inside an iframe without
 * `allow="pointer-lock"` during preview work, and the document has to be focused
 * for the request to be granted at all. Since mouse-look stopped requiring a
 * lock (R4) and pause stopped riding lock-loss (R22), windowed play is a correct
 * outcome rather than a failure worth logging.
 */

/**
 * Availability-guarded, rejection-swallowing request. Says nothing about whether
 * a lock is *wanted* — callers that can tell a finger from a mouse should prefer
 * {@link requestPlayPointerLock}.
 */
export function attemptPointerLock(canvas: HTMLCanvasElement | null): void {
  if (!canvas || typeof canvas.requestPointerLock !== "function") return;

  try {
    // Typed void in older lib.dom, Promise<void> in newer — probe rather than
    // assume, so this compiles and behaves under both.
    const result: unknown = canvas.requestPointerLock();
    if (result && typeof (result as Promise<void>).catch === "function") {
      (result as Promise<void>).catch(() => {
        // Denied, unfocused document, or an iframe without the permission.
      });
    }
  } catch {
    // Older implementations throw synchronously instead of rejecting.
  }
}

/**
 * The request the game should make when returning to play — after closing a
 * panel, or on the click that starts a session.
 *
 * Skipped outright in touch mode: a finger has nothing to capture, and a
 * touchscreen laptop that granted the lock would hand the player a capture they
 * never asked for with no obvious way out.
 */
export function requestPlayPointerLock(canvas: HTMLCanvasElement | null): void {
  if (useGameStore.getState().inputSource === "touch") return;
  attemptPointerLock(canvas);
}
