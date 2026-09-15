import {
  clampMoveVector,
  type EdgeIntent,
  type HeldIntent,
  type Vec2,
} from "@engine/input/intents";
import type { IntentState } from "@engine/input/snapshot";

/**
 * Translates finger contacts into the same intents the keyboard and mouse
 * produce.
 *
 * Like {@link import("@engine/input/keyboardMouseSource").KeyboardMouseSource}
 * this is a pure mapping layer owning no DOM listeners: `InputManager` stays the
 * one place that attaches to the canvas and forwards normalised contacts here.
 * That keeps the listener lifecycle and the compatibility-mouse suppression in
 * one file and lets the gesture grammar be exercised headlessly, which matters
 * more here than anywhere else — `vitest.config.ts` runs `environment: "node"`,
 * and the in-app browser refuses pointer lock, so there is no interactive way to
 * check this short of a real phone.
 *
 * The surface is split in two, and which half a contact lands in decides what it
 * means for its whole life:
 *
 *  - **Left region** — the movement joystick. It anchors wherever the thumb
 *    first lands (R6) rather than sitting at a fixed spot, because a thumb that
 *    has to find a fixed pad first is a thumb that is not moving the player.
 *  - **Everything else** — the play surface, which carries all three of look,
 *    mine and place with no buttons of its own (R7, R8). A contact there starts
 *    undecided and resolves into exactly one of:
 *      - *tap* — lifted before either threshold: one `secondary` edge, the same
 *        edge a right-click pushes, so placing runs the identical engine path.
 *      - *hold* — still past the hold threshold: `primary` held for as long as
 *        the finger stays down, which is mine-or-attack resolved by what is
 *        targeted exactly as a held left button is. Keep holding past the
 *        longer eat threshold and `secondary` is asserted alongside it, which
 *        is the level read the eat gate consumes — desktop's two buttons
 *        separated in time rather than across controls.
 *      - *look* — moved past the look threshold: `look` deltas, and any hold it
 *        had already earned is released so break progress stops accruing.
 *
 * A contact never revisits that decision except in the one direction the player
 * can feel — a hold that starts sliding becomes a look — so a finger resting
 * while the player reads the screen cannot silently turn into a mine.
 *
 * Three contacts coexist without interference (R12): the joystick, the play
 * surface, and the on-screen buttons U7 renders, which reach this through
 * {@link TouchSource.holdButton} and {@link TouchSource.pressButton} rather than
 * through the canvas — they are their own DOM elements and their touches never
 * arrive here as contacts.
 */

/** One contact, in client coordinates. The play canvas is full-bleed. */
export interface TouchPoint {
  /** `Touch.identifier` — stable for the life of one contact. */
  id: number;
  x: number;
  y: number;
}

export interface TouchSourceConfig {
  /**
   * Fraction of the surface width, measured from the left edge, in which a new
   * contact anchors the movement joystick instead of joining the play surface.
   */
  leftRegionFraction: number;
  /** Distance from the anchor, in px, at which the stick reads full deflection. */
  joystickRadiusPx: number;
  /**
   * How far a play-surface contact may wander before it is a look rather than a
   * tap or a hold. Small enough that a deliberate drag converts immediately,
   * large enough that the roll of a thumb during a tap does not.
   */
  lookThresholdPx: number;
  /**
   * How long a still contact must last before it becomes a mine/attack hold.
   *
   * This is the one place touch cannot match desktop: a left button mines on the
   * press, where a finger cannot be told apart from a tap until either the
   * threshold passes or it lifts. Shorter reads as a hair-trigger that places
   * blocks while mining; longer reads as lag.
   */
  holdThresholdMs: number;
  /**
   * How long a still contact must last before it *also* asserts `secondary` as
   * a level read — the reading the eat gate consumes.
   *
   * Touch has one hold to spend and desktop spends two buttons, so the two
   * meanings are separated in time rather than across controls: a short hold is
   * mine/attack, and a hold that outlasts this is additionally a bite. Both
   * intents stay asserted, which is safe because `secondary`'s *edge* is what
   * places a block and a hold never pushes one, and because the eat gate is
   * already closed whenever the player is aiming at a block — so the gesture
   * that mines and the gesture that eats can never both resolve.
   *
   * Necessarily longer than {@link holdThresholdMs}: arming both at once would
   * make every mine attempt in open air a bite. It is dead time in front of the
   * food's own eat duration, so it buys cancellability at the cost of felt
   * latency, and like every threshold here the number is reasoned rather than
   * measured on a device.
   */
  eatHoldThresholdMs: number;
}

export const DEFAULT_TOUCH_CONFIG: TouchSourceConfig = {
  leftRegionFraction: 0.4,
  joystickRadiusPx: 56,
  lookThresholdPx: 10,
  holdThresholdMs: 200,
  eatHoldThresholdMs: 500,
};

/** What a play-surface contact has resolved into so far. */
type PlayPhase = "pending" | "hold" | "look";

interface JoystickContact {
  id: number;
  anchorX: number;
  anchorY: number;
  x: number;
  y: number;
}

interface PlayContact {
  id: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  /** Press timestamp, for both hold thresholds. */
  at: number;
  phase: PlayPhase;
  /** Whether this contact has outlasted the eat threshold and holds `secondary`. */
  eating: boolean;
}

/** Read-only view of the live joystick, for the U7 overlay to draw. */
export interface JoystickView {
  anchorX: number;
  anchorY: number;
  x: number;
  y: number;
  /** The clamped stick vector, in the same frame as the `move` delta. */
  vector: Vec2;
}

export class TouchSource {
  private joystick: JoystickContact | null = null;
  private play: PlayContact | null = null;
  /** Held intents this source is currently asserting, via on-screen buttons. */
  private readonly buttonsHeld = new Set<HeldIntent>();
  private surfaceWidth = 0;

  /**
   * @param state the intent state to write into.
   * @param now press-timestamp clock. `performance.now()` in the browser;
   *   injectable so tests can drive the hold threshold deterministically.
   * @param config gesture thresholds; see {@link DEFAULT_TOUCH_CONFIG}.
   */
  constructor(
    private readonly state: IntentState,
    private readonly now: () => number = () => performance.now(),
    private readonly config: TouchSourceConfig = DEFAULT_TOUCH_CONFIG,
  ) {}

  /**
   * Tells the source how wide the play surface is, so the left region can be a
   * fraction of it rather than a fixed strip.
   *
   * Until this is called the surface is zero-wide and nothing lands in the left
   * region, so every contact is a play-surface contact. That is the safe
   * degradation: the player can still look, mine and place, they just cannot
   * walk, which is visible immediately — where the opposite default would be a
   * joystick swallowing taps across the whole screen.
   */
  setSurfaceWidth(width: number): void {
    this.surfaceWidth = width;
  }

  /** The live joystick, or null when no thumb is on it. */
  getJoystick(): JoystickView | null {
    const stick = this.joystick;
    if (!stick) return null;
    return {
      anchorX: stick.anchorX,
      anchorY: stick.anchorY,
      x: stick.x,
      y: stick.y,
      vector: this.stickVector(stick),
    };
  }

  /** True while a play-surface contact has resolved into a mine/attack hold. */
  isMining(): boolean {
    return this.play?.phase === "hold";
  }

  // ------------------------------------------------------------- contacts

  /**
   * New contacts landed.
   *
   * Arms touch mode (R27) — the first touch event is the signal, never a
   * user-agent string, so a touchscreen laptop and a tablet with a keyboard both
   * behave correctly with no detection list to maintain.
   */
  touchStart(points: readonly TouchPoint[]): void {
    this.state.setSource("touch");

    for (const point of points) {
      if (!this.joystick && this.isInLeftRegion(point.x)) {
        this.joystick = {
          id: point.id,
          anchorX: point.x,
          anchorY: point.y,
          x: point.x,
          y: point.y,
        };
        // Anchored means centred: the stick reads zero until the thumb slides.
        this.state.setDelta("move", { x: 0, y: 0 });
        continue;
      }

      if (!this.play) {
        this.play = {
          id: point.id,
          startX: point.x,
          startY: point.y,
          lastX: point.x,
          lastY: point.y,
          at: this.now(),
          phase: "pending",
          eating: false,
        };
        continue;
      }

      // A third contact on the canvas with both roles already taken is ignored
      // rather than stealing one. Buttons are their own DOM elements and never
      // arrive here.
    }
  }

  /** Contacts moved. */
  touchMove(points: readonly TouchPoint[]): void {
    for (const point of points) {
      if (this.joystick && this.joystick.id === point.id) {
        this.joystick.x = point.x;
        this.joystick.y = point.y;
        this.state.setDelta("move", this.stickVector(this.joystick));
        continue;
      }

      const play = this.play;
      if (!play || play.id !== point.id) continue;

      const travelled = Math.hypot(point.x - play.startX, point.y - play.startY);
      if (play.phase !== "look" && travelled > this.config.lookThresholdPx) {
        // A hold that starts sliding is a look. Dropping `primary` here is what
        // stops break progress accruing (BlockInteraction resets the moment the
        // level read goes false) — the finger is aiming now, not mining.
        if (play.phase === "hold") this.releaseHold(play);
        play.phase = "look";
        // The movement that crossed the threshold is deliberately not looked
        // with: it is the slop a tap is allowed, and spending it would make
        // every gesture start with a small camera jerk.
        play.lastX = point.x;
        play.lastY = point.y;
        continue;
      }

      if (play.phase === "look") {
        this.state.addDelta("look", point.x - play.lastX, point.y - play.lastY);
      }

      play.lastX = point.x;
      play.lastY = point.y;
    }

    // A contact can cross the hold threshold during a sequence of tiny moves
    // that never reach the look threshold — a thumb pressing harder.
    this.promoteHold();
  }

  /**
   * Contacts lifted.
   *
   * The tap → place edge is decided here rather than on press, because until the
   * finger leaves there is no way to know it was a tap.
   */
  touchEnd(points: readonly TouchPoint[]): void {
    for (const point of points) {
      if (this.joystick && this.joystick.id === point.id) {
        this.joystick = null;
        this.state.setDelta("move", { x: 0, y: 0 });
        continue;
      }

      const play = this.play;
      if (!play || play.id !== point.id) continue;

      if (play.phase === "pending") {
        // Neither threshold reached: a tap. One `secondary` edge, the same one a
        // right-click pushes, so place runs the identical engine path.
        //
        // Note it pushes the edge only, never the `secondary` *level* read the
        // eat gate consumes: a tap must not smuggle a bite in. Eating is the
        // separate, longer hold above, cancellable by lifting the finger — the
        // gate closes the moment `secondary` goes false and the engine resets
        // the timer.
        this.state.pushEdge("secondary", this.now());
      } else if (play.phase === "hold") {
        this.releaseHold(play);
      }

      this.play = null;
    }
  }

  /**
   * Contacts the browser took away — a system gesture, a call arriving, the
   * finger sliding off the canvas.
   *
   * Identical to a lift except that a cancelled pending contact is *not* a tap.
   * The player did not complete the gesture, so placing a block off the back of
   * it would be the browser building for them.
   */
  touchCancel(points: readonly TouchPoint[]): void {
    for (const point of points) {
      if (this.joystick && this.joystick.id === point.id) {
        this.joystick = null;
        this.state.setDelta("move", { x: 0, y: 0 });
        continue;
      }

      const play = this.play;
      if (!play || play.id !== point.id) continue;
      if (play.phase === "hold") this.releaseHold(play);
      this.play = null;
    }
  }

  // -------------------------------------------------------------- buttons

  /**
   * An on-screen button (U7) went down or came up — jump, crouch.
   *
   * Separate from the contact machinery on purpose: buttons are their own DOM
   * elements, so their touches never reach the canvas, which is exactly what
   * makes moving, looking and pressing a button three independent simultaneous
   * touches (R12) rather than three claims on one gesture.
   */
  holdButton(intent: HeldIntent, down: boolean): void {
    this.state.setSource("touch");
    if (down) this.buttonsHeld.add(intent);
    else this.buttonsHeld.delete(intent);
    this.state.setHeld(intent, down);
  }

  /** An on-screen button that means one press — pause, inventory, a hotbar slot. */
  pressButton(intent: EdgeIntent): void {
    this.state.setSource("touch");
    this.state.pushEdge(intent, this.now());
  }

  // ---------------------------------------------------------------- frame

  /**
   * Ends the intent frame for this source. Called by `InputManager.endFrame()`
   * *after* the keyboard source has cleared the delta map.
   *
   * Two jobs, both of which only a frame boundary can do:
   *
   *  - **Promote a hold.** A finger held still emits no further touch events, so
   *    nothing else would ever notice the threshold passing.
   *  - **Re-assert the stick.** `move` is a level reading of where the thumb is,
   *    not something that accumulates, but it lives in the same delta map that
   *    `clearDeltas()` and `drain()` wipe. Writing it again each frame is what
   *    keeps a motionless thumb walking.
   *
   * Known gap, deliberately left for the touch-UI tier: `drain()` runs *inside*
   * a panel-open frame, before `PlayerController` reads, so the joystick does not
   * walk the player away from an open crafting table where WASD does. Closing it
   * means either a frame-start hook in `Engine` (U8's file, and its ordering
   * couplings are load-bearing) or changing what `drain()` discards (U1's
   * committed contract). Neither belongs in a source module.
   */
  endFrame(): void {
    this.promoteHold();
    if (this.joystick) this.state.setDelta("move", this.stickVector(this.joystick));
  }

  /**
   * Drops everything this source is asserting, leaving other sources alone.
   *
   * Deliberately narrower than `IntentState.releaseAll()`: the keyboard may be
   * holding intents of its own, and a touch source tearing down must not take
   * them with it.
   */
  releaseAll(): void {
    if (this.play?.phase === "hold") this.releaseHold(this.play);
    for (const intent of this.buttonsHeld) this.state.setHeld(intent, false);
    this.buttonsHeld.clear();
    this.joystick = null;
    this.play = null;
    this.state.setDelta("move", { x: 0, y: 0 });
  }

  // ---------------------------------------------------------------- internals

  private isInLeftRegion(x: number): boolean {
    return x < this.surfaceWidth * this.config.leftRegionFraction;
  }

  /**
   * The stick as a movement vector in the camera's local frame.
   *
   * Screen Y grows downward and `move.y` pushes forward, so the vertical axis is
   * negated: sliding the thumb up walks the player forward. Magnitude is clamped
   * to 1 (`IntentState.setDelta` clamps too, belt and braces) so the existing
   * speed constants stay the only scalar — a larger magnitude would change
   * per-frame displacement, which sub-stepping and auto-jump both derive from.
   */
  private stickVector(stick: JoystickContact): Vec2 {
    const radius = this.config.joystickRadiusPx;
    return clampMoveVector({
      x: (stick.x - stick.anchorX) / radius,
      // Anchor minus current, rather than negating current minus anchor: the
      // two differ only when the thumb is exactly on the anchor, where negating
      // yields -0. Nothing downstream divides by it today, but a movement
      // vector that is not `Object.is`-equal to a zero vector is a trap laid
      // for whoever compares one later.
      y: (stick.anchorY - stick.y) / radius,
    });
  }

  /**
   * Advances a still contact through both hold thresholds.
   *
   * Two promotions rather than one, in order: pending → hold asserts `primary`,
   * and a hold that keeps going past the longer threshold additionally asserts
   * `secondary` so the eat gate can open. A contact that has already converted
   * to a look is past both — it is aiming, not pressing.
   */
  private promoteHold(): void {
    const play = this.play;
    if (!play || play.phase === "look") return;

    const elapsed = this.now() - play.at;

    if (play.phase === "pending") {
      if (elapsed < this.config.holdThresholdMs) return;
      play.phase = "hold";
      this.state.setHeld("primary", true);
    }

    if (!play.eating && elapsed >= this.config.eatHoldThresholdMs) {
      play.eating = true;
      this.state.setHeld("secondary", true);
    }
  }

  /**
   * Drops whatever level reads a hold contact had earned.
   *
   * One place rather than four, because `secondary` is only ever asserted
   * alongside `primary` and releasing one without the other would leave the eat
   * gate open on a finger that is no longer down — a bite the player cannot
   * see, cancel, or explain.
   */
  private releaseHold(play: PlayContact): void {
    this.state.setHeld("primary", false);
    if (play.eating) {
      this.state.setHeld("secondary", false);
      play.eating = false;
    }
  }
}
