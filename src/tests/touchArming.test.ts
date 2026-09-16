import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { IntentState } from "@engine/input/snapshot";
import {
  initialInputSource,
  noteTouchCapable,
  onTouchArmed,
  resetTouchArmingForTests,
  touchCapable,
} from "@engine/input/touchArming";
import { installWindow, removeWindow } from "./helpers";

/**
 * Arming touch mode from anywhere on the page, not only from the play canvas.
 *
 * The bug this closes was visible on the deployed site and invisible to every
 * test: the controls popup auto-opens the moment a world loads, before any
 * canvas contact exists, so a phone player's first screen listed `W A S D`,
 * `Left click` and `F3`. Dismissing it is a tap on a DOM button, which never
 * reaches the canvas either — so the layout stayed wrong for exactly as long as
 * anyone was reading it, then corrected itself on the first tap in the world,
 * a tap that also placed a block.
 *
 * Arming is therefore split from producing. This module answers only "has a
 * finger been seen"; `TouchSource` still owns every contact that means
 * something. The split is what lets the answer exist before the engine does.
 */

beforeEach(() => {
  installWindow();
  resetTouchArmingForTests();
});

afterEach(() => {
  resetTouchArmingForTests();
  removeWindow();
});

describe("arming", () => {
  it("starts disarmed", () => {
    expect(touchCapable()).toBe(false);
    expect(initialInputSource()).toBe("keyboardMouse");
  });

  it("arms on the first touch and stays armed", () => {
    noteTouchCapable();
    expect(touchCapable()).toBe(true);
    expect(initialInputSource()).toBe("touch");
  });

  it("notifies a listener on the transition, exactly once", () => {
    let calls = 0;
    onTouchArmed(() => calls++);
    expect(calls).toBe(0);

    noteTouchCapable();
    noteTouchCapable();
    noteTouchCapable();

    // Once, not once per contact: a session is full of touches and the engine
    // needs telling about the first one only.
    expect(calls).toBe(1);
  });

  it("fires immediately for a listener that subscribed too late", () => {
    // The case that actually broke. An engine built after the player tapped
    // Play has missed the event entirely, and polling for something that
    // happens at most once would cost a check on every frame forever.
    noteTouchCapable();

    let calls = 0;
    onTouchArmed(() => calls++);
    expect(calls).toBe(1);
  });

  it("stops notifying after unsubscribe", () => {
    let calls = 0;
    const stop = onTouchArmed(() => calls++);
    stop();
    noteTouchCapable();
    expect(calls).toBe(0);
  });
});

describe("IntentState seeding", () => {
  it("starts in keyboard mode when nothing has been touched", () => {
    expect(new IntentState().source).toBe("keyboardMouse");
  });

  it("starts in touch mode when the page was already touched", () => {
    // The title screen and `/game` are one document — the navigation between
    // them never reloads — so a tap on Play is still on the record by the time
    // the engine builds its intent state.
    noteTouchCapable();
    expect(new IntentState().source).toBe("touch");
  });

  it("still lets a keyboard take the session back (R28)", () => {
    // Arming is not a latch on the session. A tablet with a keyboard case
    // switches back on the next keypress, exactly as before.
    noteTouchCapable();
    const state = new IntentState();
    expect(state.source).toBe("touch");

    state.setSource("keyboardMouse");
    expect(state.source).toBe("keyboardMouse");
  });
});
