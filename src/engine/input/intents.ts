/**
 * The vocabulary gameplay code reads instead of key codes and mouse buttons.
 *
 * Three temporal models, because the engine already relies on all three and
 * collapsing them loses behaviour:
 *
 *  - **Held** — true for as long as the control is down. Mining, attacking and
 *    the eat gate are all level reads.
 *  - **Edge** — one entry per press, carrying the timestamp. Placing is an edge.
 *    Timestamps are load-bearing: creative flight toggles on a double-tap of
 *    jump inside a 300 ms window, which a boolean cannot express.
 *  - **Delta** — continuous, accumulating. Look is the only one.
 *
 * Sources produce these; consumers read them. Neither keyboard/mouse nor touch
 * is privileged, and adding a third source requires no gameplay change.
 */

/** Controls that are meaningful for as long as they are held. */
export type HeldIntent =
  | "moveForward"
  | "moveBack"
  | "moveLeft"
  | "moveRight"
  | "jump"
  | "sneak"
  | "sprint"
  /** Mine or attack — resolved by what is targeted, not by the control. */
  | "primary"
  /** Place or use — the level read the eat gate consumes. */
  | "secondary"
  /**
   * Narrowed field of view while held. The engine lerps the FOV toward the zoom
   * target for as long as this is true, so it is a level read; the `zoom` edge
   * is the same control expressed as a toggle for a source that has no hold.
   */
  | "zoom";

/** Controls that matter at the moment of press. */
export type EdgeIntent =
  | "jump"
  | "primary"
  | "secondary"
  | "openInventory"
  | "openChat"
  | "pause"
  | "toggleDebug"
  | "toggleMinimap"
  | "toggleCamera"
  | "drop"
  | "zoom"
  | "toggleFly"
  | `hotbar${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}`;

/**
 * Continuous two-axis input.
 *
 * `look` is a pointer/drag delta in screen space. `move` is an analog stick in
 * the camera's local frame — `x` strafes right, `y` pushes forward — which is
 * the frame `PlayerController` adds the four held movement intents on, so a key
 * and a stick compose instead of fighting.
 */
export type DeltaIntent = "look" | "move";

/** A single press, with the moment it happened. */
export interface IntentEdge {
  intent: EdgeIntent;
  /** `performance.now()` at the press. Double-tap detection depends on this. */
  at: number;
}

export interface Vec2 {
  x: number;
  y: number;
}

/**
 * Why gameplay input is being ignored this frame.
 *
 * An explicit state rather than an absence of intents: the engine has a
 * paused/chat-composing branch that still runs gravity, so "nothing is held"
 * and "input is suppressed" are genuinely different and must stay so.
 */
export type SuppressionReason = "paused" | "chatComposing" | "panelOpen" | "dead";

/** Which device is currently driving. Touch arms on the first touch event. */
export type InputSource = "keyboardMouse" | "touch";

/**
 * Movement arrives as an analog vector from a joystick and as discrete keys
 * from a keyboard. Magnitude is clamped to 1 so the existing speed constants
 * stay the only scalar — feeding a larger magnitude through would change
 * per-frame displacement, which sub-stepping and auto-jump both derive from.
 */
export function clampMoveVector(v: Vec2): Vec2 {
  const len = Math.hypot(v.x, v.y);
  if (len <= 1 || len === 0) return { x: v.x, y: v.y };
  return { x: v.x / len, y: v.y / len };
}
