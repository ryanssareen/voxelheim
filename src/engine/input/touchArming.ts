/**
 * Notices that a finger is driving, anywhere on the page and at any time —
 * including before the engine exists.
 *
 * `TouchSource` arms touch mode from contacts on the play canvas, which is
 * correct for gameplay and too late for everything a player meets on the way
 * there. The controls popup auto-opens the moment a world loads, before any
 * canvas contact, so a phone player's very first screen listed `W A S D`,
 * `Left click` and `F3`; dismissing it is a tap on a DOM button, which never
 * reaches the canvas either. Touch then armed on the first tap *in the world* —
 * a tap that also placed a block.
 *
 * So arming is split from producing. This module answers only "has this session
 * ever been touched", from a passive document-level listener that reads events
 * and consumes none of them. `TouchSource` still owns every contact that means
 * something.
 *
 * Module state rather than a store: it is read during `IntentState`
 * construction, before React has mounted anything, and it must survive the
 * client-side navigation from the title screen into `/game` — which it does,
 * because that navigation never reloads the document.
 *
 * Still no user-agent string anywhere (R27). A touchscreen laptop arms when it
 * is touched and hands back to the keyboard on the next key (R28); a device
 * that is never touched never arms.
 */

import type { InputSource } from "@engine/input/intents";

let armed = false;
let installed = false;
const listeners = new Set<() => void>();

/** True once any touch has been seen in this session. */
export function touchCapable(): boolean {
  return armed;
}

/** The source a freshly built intent state should start in. */
export function initialInputSource(): InputSource {
  return armed ? "touch" : "keyboardMouse";
}

/**
 * Records that a finger is driving and notifies anything already listening.
 *
 * Idempotent: the listeners fire on the transition only, so a live engine is
 * told once rather than on every contact of a session.
 */
export function noteTouchCapable(): void {
  if (armed) return;
  armed = true;
  for (const listener of listeners) listener();
}

/**
 * Subscribes to the arming transition, and fires immediately if it has already
 * happened.
 *
 * The immediate call is the half that matters most: an engine built *after* the
 * player tapped Play has missed the event entirely, and polling for it would
 * mean a check on every frame for something that happens at most once.
 */
export function onTouchArmed(listener: () => void): () => void {
  if (armed) listener();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Installs the document-level listener. Safe to call more than once.
 *
 * Passive, and on the capture phase: passive because this only observes and
 * must never prevent a scroll or a tap on a button, capture so it still sees a
 * contact that a handler below stops propagating.
 */
export function installTouchArming(): () => void {
  if (typeof document === "undefined" || installed) return () => {};
  installed = true;

  const onTouch = () => noteTouchCapable();
  document.addEventListener("touchstart", onTouch, { passive: true, capture: true });

  return () => {
    document.removeEventListener("touchstart", onTouch, { capture: true });
    installed = false;
  };
}

/** Test seam. Not called by application code. */
export function resetTouchArmingForTests(): void {
  armed = false;
  installed = false;
  listeners.clear();
}
