import { describe, it, expect } from "vitest";
import { KEYBIND_GROUPS } from "@data/keybinds";
import {
  TOUCH_DEFERRED,
  TOUCH_PARITY,
  keyboardActions,
  orphanedParityRows,
  touchControlGroups,
  unresolvedKeyboardActions,
} from "@data/touchParity";
import { TOUCH_CORNER_CONTROLS, TOUCH_HOLD_CONTROLS } from "@ui/TouchControls";

/**
 * R23: every keyboard-only action has a touch affordance or an explicit
 * deferral.
 *
 * This is the unit's whole verification, and it is a test rather than a
 * checklist because the failure it guards against is one nobody notices. Every
 * gap this work has turned up — eating with no producer, fullscreen with no
 * route, flight with no edge — was silent: the action simply did not happen,
 * and an absent action looks exactly like a player who did not try it. A list
 * in a plan document cannot fail; this can.
 *
 * It does not check that an affordance *works* — that is the job of the source
 * and component tests, and ultimately of R32's human on a real phone. It checks
 * that one was decided on at all.
 */

describe("keyboard action inventory (R23)", () => {
  it("resolves every keyboard action to a touch affordance or a recorded deferral", () => {
    expect(unresolvedKeyboardActions()).toEqual([]);
  });

  it("has no parity row for an action the keyboard no longer binds", () => {
    // The other direction. A bind removed from `KEYBIND_GROUPS` leaves a row
    // here describing a control that may no longer exist, and the controls
    // popup would go on advertising it.
    expect(orphanedParityRows()).toEqual([]);
  });

  it("covers every action exactly once", () => {
    const actions = TOUCH_PARITY.map((row) => row.action);
    expect(new Set(actions).size).toBe(actions.length);
  });

  it("gives every resolution a non-empty explanation", () => {
    for (const row of TOUCH_PARITY) {
      const text = row.touch.kind === "deferred" ? row.touch.why : row.touch.how;
      expect(text.trim().length, `${row.action} has an empty resolution`).toBeGreaterThan(0);
    }
  });

  it("defers nothing today, and would say so if it did", () => {
    // Not a requirement that the list stay empty — a deferral is a legitimate
    // answer under R23. The assertion is that the constant reflects the table,
    // so a future deferral shows up here instead of being lost.
    expect(TOUCH_DEFERRED.map((row) => row.action)).toEqual(
      TOUCH_PARITY.filter((r) => r.touch.kind === "deferred").map((r) => r.action),
    );
  });

  it("names the six actions the plan called out by hand", () => {
    // Sprint, creative fly, drop, zoom, minimap toggle, debug info — the list
    // U12 was written to close. Spelled out so a future edit that quietly drops
    // one fails here rather than in a player's hands.
    const resolved = new Set(TOUCH_PARITY.map((row) => row.action));
    for (const action of [
      "Sprint / fly faster",
      "Toggle flying (creative)",
      "Drop held item",
      "Zoom",
      "Toggle minimap",
      "Debug info",
      "Change camera",
    ]) {
      expect(resolved.has(action), `${action} has no touch resolution`).toBe(true);
    }
  });
});

describe("touch controls popup content (R24)", () => {
  it("groups under the same headings the keyboard layout uses", () => {
    const keyboardTitles = KEYBIND_GROUPS.map((g) => g.title);
    for (const group of touchControlGroups()) {
      expect(keyboardTitles).toContain(group.title);
    }
  });

  it("shows every action the keyboard popup shows, minus deferrals", () => {
    const shown = touchControlGroups().flatMap((g) => g.rows.map((r) => r.action));
    const deferred = new Set(TOUCH_DEFERRED.map((r) => r.action));
    const expected = keyboardActions().filter((a) => !deferred.has(a));

    expect(new Set(shown)).toEqual(new Set(expected));
  });

  it("lists an action bound to two key sets only once", () => {
    // "Walk" is both WASD and the arrow keys. A keyboard popup showing it twice
    // is showing two real alternatives; a touch popup showing "Joystick" twice
    // is just noise.
    const shown = touchControlGroups().flatMap((g) => g.rows.map((r) => r.action));
    expect(shown.filter((a) => a === "Walk")).toHaveLength(1);
  });

  it("never renders a key cap in the touch layout", () => {
    // The failure this guards is the one R24 exists for: a phone player told to
    // press W A S D learns only that the game was not built for them.
    const text = touchControlGroups()
      .flatMap((g) => g.rows.map((r) => r.how))
      .join(" ");
    for (const cap of ["W A S D", "Right click", "Left click", "F3", "Esc"]) {
      expect(text).not.toContain(cap);
    }
  });
});

describe("on-screen controls back the parity table", () => {
  it("draws an icon for each corner-control action the table promises", () => {
    const icons = new Set(TOUCH_CORNER_CONTROLS.map((c) => c.intent));
    expect(icons.has("pause")).toBe(true);
    expect(icons.has("openChat")).toBe(true);
    expect(icons.has("toggleMinimap")).toBe(true);
    expect(icons.has("zoom")).toBe(true);
  });

  it("gives jump a press edge so creative flight is reachable", () => {
    // `PlayerController` toggles flight on two `jump` *edges* in a 300 ms
    // window. A hold button that only set the held state would leave flight
    // unreachable on touch while every other jump behaviour kept working —
    // which is precisely how it would go unnoticed.
    const jump = TOUCH_HOLD_CONTROLS.find((c) => c.intent === "jump");
    expect(jump?.edgeOnPress).toBe("jump");
  });

  it("does not give crouch a press edge", () => {
    // Nothing consumes a `sneak` edge, and pushing one would put a press into
    // every consumer's queue for no reader to take — the shape of bug the
    // per-consumer cursors exist to make impossible to ignore.
    const crouch = TOUCH_HOLD_CONTROLS.find((c) => c.intent === "sneak");
    expect(crouch?.edgeOnPress).toBeUndefined();
  });
});
