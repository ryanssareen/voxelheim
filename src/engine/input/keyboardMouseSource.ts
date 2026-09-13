import type { EdgeIntent, HeldIntent } from "@engine/input/intents";
import type { IntentState } from "@engine/input/snapshot";

/**
 * Translates keyboard and mouse events into intents.
 *
 * This is a pure mapping layer: it owns no DOM listeners. `InputManager` stays
 * the single place that attaches to `window`/`document`/canvas and forwards
 * normalised events here, which keeps the typing guard, the pointer-lock
 * bookkeeping and the listener lifecycle in one file and lets this module be
 * exercised headlessly (`vitest.config.ts` runs `environment: "node"`).
 *
 * Two rules shape the mapping:
 *
 *  - **A press is an edge; a hold is a level.** Keyboard auto-repeat fires
 *    `keydown` over and over while a key is down, so an edge is emitted only on
 *    the up→down transition. The held set is what repeats are for, and it is
 *    already idempotent.
 *  - **Aliased keys are OR-ed, not last-write-wins.** `ShiftLeft` and
 *    `ShiftRight` both mean sprint; releasing one while the other is still down
 *    must leave sprint held, which is what `InputManager.isKeyDown()` gives
 *    today by keying on the code rather than the meaning.
 */

/**
 * `KeyboardEvent.code` → the intents that are true while it is down.
 *
 * Mirrors the call sites this replaces: `PlayerController.update()` for
 * movement/jump/sneak/sprint and `Engine.updateZoom()` for hold-V zoom.
 *
 * NOTE (resolved in U3): `CapsLock` maps to `sneak` alongside
 * `ControlLeft`/`ControlRight`. Before the intent layer, `PlayerController`
 * read CapsLock for crouching only — its flight-descend branch checked the two
 * Control codes alone, so CapsLock did not fly down. The vocabulary has one
 * `sneak` control (touch has one crouch button, by design) and the controller
 * reads it for both, so CapsLock now descends as well, matching what
 * `src/data/keybinds.ts` advertises. Pinned in
 * `src/tests/playerControllerInput.test.ts` and noted in
 * `src/tests/keyboardActionInventory.test.ts`.
 */
export const KEY_HELD_INTENTS: Readonly<Record<string, readonly HeldIntent[]>> = {
  KeyW: ["moveForward"],
  ArrowUp: ["moveForward"],
  KeyS: ["moveBack"],
  ArrowDown: ["moveBack"],
  KeyA: ["moveLeft"],
  ArrowLeft: ["moveLeft"],
  KeyD: ["moveRight"],
  ArrowRight: ["moveRight"],
  Space: ["jump"],
  ShiftLeft: ["sprint"],
  ShiftRight: ["sprint"],
  ControlLeft: ["sneak"],
  ControlRight: ["sneak"],
  CapsLock: ["sneak"],
  KeyV: ["zoom"],
};

/**
 * `KeyboardEvent.code` → the intent emitted once per press.
 *
 * `Space` appears here *and* in the held table: creative flight toggles on a
 * double-tap inside a 300 ms window while the same key is held-ascend during
 * flight, so both readings of one physical key have to be available together.
 *
 * `Escape` produces a `pause` edge even though nothing consumes it yet — pause
 * rides the browser's native pointer-lock exit today (`onPointerLockLost`). U8
 * decouples the two; when it does, note that a locked-then-Escape press yields
 * *both* this edge and the lock-loss callback, so pause must be idempotent
 * rather than a toggle.
 */
export const KEY_EDGE_INTENTS: Readonly<Record<string, EdgeIntent>> = {
  Space: "jump",
  KeyE: "openInventory",
  KeyQ: "drop",
  KeyP: "toggleCamera",
  KeyT: "openChat",
  KeyM: "toggleMinimap",
  F3: "toggleDebug",
  Escape: "pause",
  Digit1: "hotbar1",
  Digit2: "hotbar2",
  Digit3: "hotbar3",
  Digit4: "hotbar4",
  Digit5: "hotbar5",
  Digit6: "hotbar6",
  Digit7: "hotbar7",
  Digit8: "hotbar8",
  Digit9: "hotbar9",
};

/**
 * `MouseEvent.button` → intent. Left is mine/attack, right is place/use.
 *
 * Both buttons carry a held *and* an edge reading, because the engine already
 * runs both temporal models on the right button within a single frame: the
 * press places a block (edge) and the hold feeds the eat gate (level). Middle
 * click and the browser-back buttons are deliberately absent — an unrecognised
 * button touches nothing.
 */
export const MOUSE_BUTTON_INTENTS: Readonly<
  Record<number, { held: HeldIntent; edge: EdgeIntent }>
> = {
  0: { held: "primary", edge: "primary" },
  2: { held: "secondary", edge: "secondary" },
};

/** Reverse of {@link KEY_HELD_INTENTS}: intent → every code that produces it. */
const CODES_BY_HELD_INTENT: ReadonlyMap<HeldIntent, readonly string[]> = (() => {
  const map = new Map<HeldIntent, string[]>();
  for (const [code, intents] of Object.entries(KEY_HELD_INTENTS)) {
    for (const intent of intents) {
      const codes = map.get(intent);
      if (codes) codes.push(code);
      else map.set(intent, [code]);
    }
  }
  return map;
})();

export class KeyboardMouseSource {
  /** Codes currently down, as seen by this source. Drives edge de-duplication. */
  private readonly downCodes = new Set<string>();
  private readonly downButtons = new Set<number>();

  /**
   * @param state the intent state to write into.
   * @param now press-timestamp clock. `performance.now()` in the browser;
   *   injectable so tests can produce deterministic double-tap windows.
   */
  constructor(
    private readonly state: IntentState,
    private readonly now: () => number = () => performance.now(),
  ) {}

  /**
   * A key went down. Safe to call for auto-repeat: a code already down sets no
   * intent and queues no second edge.
   */
  keyDown(code: string): void {
    if (this.downCodes.has(code)) return;
    this.downCodes.add(code);

    for (const intent of KEY_HELD_INTENTS[code] ?? []) this.state.setHeld(intent, true);

    const edge = KEY_EDGE_INTENTS[code];
    if (edge) this.state.pushEdge(edge, this.now());
  }

  /**
   * A key came up. A code this source never saw go down (the keydown was
   * swallowed by the typing guard, say) is a no-op.
   */
  keyUp(code: string): void {
    if (!this.downCodes.delete(code)) return;

    for (const intent of KEY_HELD_INTENTS[code] ?? []) {
      if (!this.isIntentStillDown(intent)) this.state.setHeld(intent, false);
    }
  }

  /** A mouse button went down: sets the held reading and queues one edge. */
  mouseDown(button: number): void {
    const mapping = MOUSE_BUTTON_INTENTS[button];
    if (!mapping || this.downButtons.has(button)) return;
    this.downButtons.add(button);
    this.state.setHeld(mapping.held, true);
    this.state.pushEdge(mapping.edge, this.now());
  }

  /** A mouse button came up. Clears the held reading; queued edges survive. */
  mouseUp(button: number): void {
    const mapping = MOUSE_BUTTON_INTENTS[button];
    if (!mapping) return;
    this.downButtons.delete(button);
    this.state.setHeld(mapping.held, false);
  }

  /**
   * Pointer movement. Accumulated ungated by pointer lock (R4): look is a
   * continuous delta wherever it comes from, and the frame loop's `drain()` is
   * what discards movement made while input was suppressed.
   */
  look(dx: number, dy: number): void {
    if (dx === 0 && dy === 0) return;
    this.state.addDelta("look", dx, dy);
  }

  /**
   * Clears accumulated deltas. The frame loop calls this once per frame *after*
   * every consumer has read, so a delta describes one frame.
   *
   * Only look is cleared in practice here: this source expresses movement as
   * held intents rather than as a `move` delta, deliberately. A `move` vector
   * parked in the delta map would be wiped by `drain()` — which the engine runs
   * on panel-open frames, where the player can still walk away from a crafting
   * table — and would not come back until the next key transition.
   */
  endFrame(): void {
    this.state.clearDeltas();
  }

  /** Drops every held reading, e.g. when the listeners go away. */
  releaseAll(): void {
    this.downCodes.clear();
    this.downButtons.clear();
    this.state.releaseAll();
  }

  private isIntentStillDown(intent: HeldIntent): boolean {
    const codes = CODES_BY_HELD_INTENT.get(intent);
    if (!codes) return false;
    return codes.some((code) => this.downCodes.has(code));
  }
}
