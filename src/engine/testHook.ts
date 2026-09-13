import type { Engine } from "@engine/Engine";

/** Snapshot of runtime state the E2E macro polls. Dev-only, never shipped to production. */
export interface E2EState {
  position: { x: number; y: number; z: number };
  yaw: number;
  pitch: number;
  /**
   * Whether the game considers itself paused. A failed `requestPointerLock()`
   * (common in automated Chromium environments) can transiently toggle
   * `document.pointerLockElement`, which the engine treats as "lock lost" and
   * pauses on — the E2E macro checks this and clicks Resume when it happens.
   */
  isPaused: boolean;
  heldItem: { blockId: number; count: number } | null;
  hotbar: Array<{ blockId: number; count: number } | null>;
  inventory: Array<{ blockId: number; count: number } | null>;
  targetedBlock: { blockId: number; x: number; y: number; z: number } | null;
}

declare global {
  interface Window {
    __test?: {
      getState: () => E2EState;
      /**
       * Sets look direction directly, bypassing mouse-look. Exists because
       * some automated Chromium environments refuse pointer lock outright,
       * and mouse-look is gated behind lock — see Engine.setE2ELook.
       */
      setLook: (yaw: number, pitch: number) => void;
    };
  }
}

/**
 * Exposes `window.__test.getState()` for the Playwright E2E macro. Gated on
 * NODE_ENV rather than relying on tree-shaking, so a misconfigured production
 * build can't accidentally ship the hook.
 */
export function installE2ETestHook(engine: Engine): void {
  if (process.env.NODE_ENV === "production") return;
  if (typeof window === "undefined") return;

  window.__test = {
    getState: () => engine.getE2EState(),
    setLook: (yaw, pitch) => engine.setE2ELook(yaw, pitch),
  };
}
