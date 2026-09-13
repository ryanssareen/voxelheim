import type { EdgeIntent, HeldIntent, IntentEdge } from "@engine/input/intents";
import type { IntentSnapshot } from "@engine/input/snapshot";

/**
 * How the React overlays consume intents.
 *
 * Before U5, five components each attached their own `window` keydown listener
 * and each re-implemented a different subset of the same four guards — is the
 * player dead, is the game paused, is chat composing, is a panel open. Nothing
 * held those subsets still, so they drifted: the minimap checks two of them,
 * chat checks all four, the debug overlay checks none.
 *
 * This module keeps the drift but names it. Each consumer declares the blockers
 * that apply to *it*, one predicate decides, and the differences become a list
 * a reader can compare instead of four handlers to diff. The debug overlay's
 * empty list is the quirk the plan asks to preserve, stated out loud rather
 * than implied by an absence.
 *
 * Pure by construction: no store imports, no DOM. The React side
 * (`src/ui/useIntentEdge.ts`) supplies the state and owns the subscription.
 */

/** A reason a UI consumer declines to act on an edge it would otherwise take. */
export type UiBlocker = "dead" | "paused" | "chatComposing" | "panelOpen";

/** The four conditions the overlays guard on, sampled at the moment of press. */
export interface UiInputState {
  dead: boolean;
  paused: boolean;
  chatComposing: boolean;
  /** Inventory, crafting table, furnace or the creative screen is up. */
  panelOpen: boolean;
}

/** The first declared blocker that is currently true, or null to proceed. */
export function uiIntentBlocked(
  blockers: readonly UiBlocker[],
  state: UiInputState,
): UiBlocker | null {
  for (const blocker of blockers) {
    if (blocker === "dead" && state.dead) return "dead";
    if (blocker === "paused" && state.paused) return "paused";
    if (blocker === "chatComposing" && state.chatComposing) return "chatComposing";
    if (blocker === "panelOpen" && state.panelOpen) return "panelOpen";
  }
  return null;
}

/**
 * Chat guards on all four: typing into a panel, into chat itself, or while
 * dead or paused must not reopen the composer.
 *
 * The fifth guard chat used to carry — "the event target is a text field" — is
 * gone from here because it moved down a layer: `InputManager` drops keydowns
 * aimed at an INPUT/TEXTAREA/contentEditable before the source ever sees them,
 * so no edge exists to guard.
 */
export const CHAT_OPEN_BLOCKERS: readonly UiBlocker[] = [
  "dead",
  "paused",
  "chatComposing",
  "panelOpen",
];

/**
 * The minimap toggles while dead and while paused — it always has — but not
 * while chat is composing or a panel is up.
 */
export const MINIMAP_TOGGLE_BLOCKERS: readonly UiBlocker[] = ["chatComposing", "panelOpen"];

/**
 * Empty on purpose. F3 fires unconditionally today, including while the player
 * is typing in chat. That is a latent bug, and the plan's Scope Boundaries
 * defer fixing it: a behaviour-preserving refactor that quietly fixes things is
 * a refactor nothing can verify. Give this list its blockers in that follow-up.
 */
export const DEBUG_TOGGLE_BLOCKERS: readonly UiBlocker[] = [];

/**
 * Modal dismissal ignores every blocker: the controls popup closes on Escape
 * whatever else is happening, which is what its capture-phase listener did.
 */
export const MODAL_DISMISS_BLOCKERS: readonly UiBlocker[] = [];

/**
 * Dispatch order. Higher runs first.
 *
 * This is where the keybinds popup's capture-phase precedence went. It used to
 * register `window` keydown with `capture: true` and call `stopPropagation()`,
 * which is two statements — "I go first" and "nobody after me" — that only
 * happened to be spelled as one. Priority is the first; `exclusive` is the
 * second.
 */
export const UI_PRIORITY = {
  /** Modal overlays — the controls popup. */
  modal: 100,
  /** Ordinary HUD surfaces — chat, minimap, debug overlay. */
  hud: 0,
} as const;

export interface UiIntentHandler {
  intent: EdgeIntent;
  /** Conditions under which this consumer declines the edge. */
  blockers: readonly UiBlocker[];
  /** See {@link UI_PRIORITY}. */
  priority: number;
  /** When true and it fires, lower-priority handlers do not see this edge. */
  exclusive: boolean;
  run: () => void;
}

/**
 * Routes one edge to the UI consumers registered for it.
 *
 * Registration order decides ties, so two handlers at the same priority both
 * run in the order they mounted — the behaviour of the independent `window`
 * listeners this replaces. Only an `exclusive` handler cuts the chain.
 */
export class UiIntentRouter {
  private handlers: UiIntentHandler[] = [];

  /** Returns an unregister function; safe to call twice. */
  register(handler: UiIntentHandler): () => void {
    this.handlers.push(handler);
    return () => {
      const at = this.handlers.indexOf(handler);
      if (at >= 0) this.handlers.splice(at, 1);
    };
  }

  /**
   * @param readState sampled lazily, so an edge nobody is registered for costs
   *   nothing — every mouse click pushes one.
   */
  dispatch(edge: IntentEdge, readState: () => UiInputState): void {
    const matching = this.handlers.filter((h) => h.intent === edge.intent);
    if (matching.length === 0) return;

    // Array.prototype.sort is stable, so equal priorities keep mount order.
    const ordered = [...matching].sort((a, b) => b.priority - a.priority);
    const state = readState();
    for (const handler of ordered) {
      if (uiIntentBlocked(handler.blockers, state)) continue;
      handler.run();
      if (handler.exclusive) return;
    }
  }
}

const MOVEMENT_HELD_INTENTS: readonly HeldIntent[] = [
  "moveForward",
  "moveBack",
  "moveLeft",
  "moveRight",
];

/**
 * Is the player being asked to move right now?
 *
 * The walkthrough's movement step used to watch `keydown` for eight key codes,
 * which is a list that has to be kept in step with `PlayerController` by hand
 * and which counts a "w" typed into the chat box as walking. R24 puts the step
 * on intents instead, so a joystick (U6) advances it without the walkthrough
 * learning anything about touch — the `move` delta is read here for that
 * reason, even though the keyboard source never sets one.
 */
export function movementIntended(intents: IntentSnapshot): boolean {
  if (MOVEMENT_HELD_INTENTS.some((intent) => intents.isHeld(intent))) return true;
  const move = intents.delta("move");
  return move.x !== 0 || move.y !== 0;
}
