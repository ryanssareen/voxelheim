import type { IntentSnapshot } from "@engine/input/snapshot";

/**
 * How `Engine.update()` turns one frame's intent snapshot into the actions it
 * performs.
 *
 * The frame loop's ordering couplings produce no error when they break — place
 * silently stops working, or attack and mine both fire on the same swing — so
 * the pieces that can be stated as a function live here, named, where a test can
 * hold them still. `Engine` calls these rather than keeping a second copy of the
 * rule: duplicated logic is where fixes go to die
 * (docs/solutions/logic-errors/aabb-max-edge-phantom-block-collision.md).
 *
 * What deliberately stays inline in `Engine.update()` is the *sequence* — panel
 * toggle before the panel-open check, drain before any other consumption, camera
 * before the look direction feeds the raycast, entity hit-test before mining,
 * eat gate after place has resolved. A sequence is not a value, and hoisting it
 * out of the loop would only move it somewhere it is read less often.
 */

/**
 * Cursor name the frame loop reads edges under.
 *
 * Edges are delivered through per-consumer cursors, so this name has to be
 * unique to this call site and stable across frames: reusing
 * `PlayerController`'s name would make each of the two swallow half the
 * other's presses, with nothing to show for it but a jump that fires every
 * other time.
 */
export const ENGINE_EDGE_CONSUMER = "engineFrame";

/** One frame's presses, as the actions the frame loop performs from them. */
export interface EngineFrameEdges {
  /** Open, or close, whichever panel is up. Formerly the `KeyE` rising edge. */
  togglePanel: boolean;
  /** Cycle first/third person. Formerly the `KeyP` rising edge. */
  cycleCamera: boolean;
  /** Drop the selected stack. Formerly the `KeyQ` rising edge. */
  dropItem: boolean;
  /**
   * Place or use — the *edge* half of the secondary control. The level half
   * (`isHeld("secondary")`) feeds the eat gate later in the same frame, which
   * is why the two readings have to stay separate all the way down.
   */
  place: boolean;
  /**
   * Flip the zoom latch.
   *
   * Zoom is a level read on a keyboard — the FOV lerps toward the zoom target
   * for as long as V is down — and touch has no hold to spend on it, so the
   * same control is also expressed as an edge. `Engine` keeps the latch; this
   * only reports that the player asked for it to flip.
   */
  toggleZoom: boolean;
  /** Hotbar index (0-based) to select, or null. */
  hotbarSlot: number | null;
}

const HOTBAR_EDGE = /^hotbar([1-9])$/;

/**
 * Reads this frame's presses under the frame loop's own cursor.
 *
 * Called **once** per live frame, before the panel-open check, because the
 * panel toggle has to resolve in time for that check to see the state it just
 * changed. Edges the frame loop has no use for (`jump`, `openChat`, `pause`,
 * …) are still taken here and dropped: this only advances *this* consumer's
 * cursor, so the controller and the React listeners are unaffected.
 *
 * Frames that return before this — dead, paused, chat composing — leave the
 * queue untouched on purpose. That is what makes a click made during pause fire
 * on the frame after resuming, a desktop quirk this refactor preserves rather
 * than fixes (see the plan's Scope Boundaries).
 */
export function readEngineFrameEdges(intents: IntentSnapshot): EngineFrameEdges {
  const frame: EngineFrameEdges = {
    togglePanel: false,
    cycleCamera: false,
    dropItem: false,
    place: false,
    toggleZoom: false,
    hotbarSlot: null,
  };

  for (const edge of intents.takeEdges(ENGINE_EDGE_CONSUMER)) {
    switch (edge.intent) {
      case "openInventory":
        frame.togglePanel = true;
        break;
      case "toggleCamera":
        frame.cycleCamera = true;
        break;
      case "drop":
        frame.dropItem = true;
        break;
      case "secondary":
        frame.place = true;
        break;
      case "zoom":
        frame.toggleZoom = true;
        break;
      default: {
        // Hotbar presses are one intent per slot. Two in a frame is a human
        // rolling across the number row, so the last one wins — the old
        // `Digit1..Digit9` scan resolved that tie by the highest slot held
        // instead, which nobody could have noticed either way.
        const slot = HOTBAR_EDGE.exec(edge.intent);
        if (slot) frame.hotbarSlot = Number(slot[1]) - 1;
        break;
      }
    }
  }

  return frame;
}

/**
 * Whether the primary-held intent breaks blocks this frame.
 *
 * Mining and attacking are one control (R3), told apart by what is in front of
 * the player, and the frame loop resolves that by hit-testing mobs and remote
 * players *first*. Whichever entity is closest claims the swing, and mining only
 * gets what is left over — which is the only reason a swing at a mob standing
 * against a wall does not also chew through the wall.
 *
 * @param primaryHeld `isHeld("primary")` for this frame.
 * @param entityClaimed a mob or remote player took the swing already.
 */
export function primaryResolvesToMining(primaryHeld: boolean, entityClaimed: boolean): boolean {
  return primaryHeld && !entityClaimed;
}

/** Everything the eat gate weighs, in the order the frame resolves it. */
export interface EatGateInput {
  /** Hunger the held item restores; 0 for anything that is not food. */
  hungerRestore: number;
  /**
   * `isHeld("secondary")` — read *after* the place edge has been spent, so one
   * press of the same physical button both places a block and keeps feeding the
   * bite. Reading it earlier would be harmless today and wrong the moment
   * placing starts consuming the level reading too.
   */
  secondaryHeld: boolean;
  hunger: number;
  maxHunger: number;
  /** The raycast found a block — aiming at the world beats eating. */
  targetingBlock: boolean;
}

/** Whether a bite may accrue progress this frame. */
export function eatGateOpen(input: EatGateInput): boolean {
  return (
    input.hungerRestore > 0 &&
    input.secondaryHeld &&
    input.hunger < input.maxHunger &&
    !input.targetingBlock
  );
}
