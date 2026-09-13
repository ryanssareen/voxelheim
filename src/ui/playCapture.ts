import { useSettingsStore } from "@store/useSettingsStore";

/**
 * Enters the "playing" input capture state a canvas click (or a pause-menu
 * re-lock) should produce: pointer lock first, then browser fullscreen on
 * the canvas's container element -- never the canvas itself, so the React
 * HUD overlays stay visible -- when the `fullscreenOnPlay` setting is on.
 *
 * Order matters: a single user activation can drive both pointer lock and
 * fullscreen, but fullscreen consumes that activation, so the lock request
 * must go first or it silently fails (w3c.github.io/pointerlock). Pointer
 * lock itself is unconditional and does not depend on the setting.
 *
 * Every fullscreen precondition is guarded, and a rejection (denied,
 * unsupported, iframe without allowfullscreen) is swallowed -- the game
 * keeps playing windowed rather than throwing.
 */
export function enterPlayCapture(canvas: HTMLCanvasElement | null): void {
  if (!canvas) return;

  canvas.requestPointerLock();

  if (!useSettingsStore.getState().fullscreenOnPlay) return;

  const target = canvas.parentElement as WebkitFullscreenElement | null;
  if (!target) return;

  const doc = document as WebkitFullscreenDocument;
  const enabled = doc.fullscreenEnabled ?? doc.webkitFullscreenEnabled ?? false;
  const active = doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
  if (!enabled || active) return;

  const request = target.requestFullscreen ?? target.webkitRequestFullscreen;
  if (typeof request !== "function") return;

  try {
    // Prefixed WebKit returns undefined rather than a promise, so the rejection
    // handler has to be attached conditionally.
    const result = request.call(target);
    if (result && typeof result.then === "function") {
      result.catch(() => {
        // Denied, unsupported, or blocked by permissions policy: stay windowed.
      });
    }
  } catch {
    // Synchronous throw from a prefixed implementation: stay windowed.
  }
}

type WebkitFullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

type WebkitFullscreenDocument = Document & {
  webkitFullscreenEnabled?: boolean;
  webkitFullscreenElement?: Element | null;
};
