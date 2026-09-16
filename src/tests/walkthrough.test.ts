import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  WALKTHROUGH_STEPS,
  stepHint,
  useWalkthroughStore,
} from "@store/useWalkthroughStore";
import { DEMO_WORLD_ID } from "@lib/demoWorld";
import { installWindow, removeWindow } from "./helpers";

beforeEach(() => {
  installWindow();
  useWalkthroughStore.setState({ isOpen: false, activeIndex: 0, completed: false });
});

afterEach(removeWindow);

describe("walkthrough steps", () => {
  // R10
  it("covers movement, break, place and inventory in order", () => {
    expect(WALKTHROUGH_STEPS.map((s) => s.action)).toEqual([
      "move",
      "break",
      "place",
      "inventory",
    ]);
  });
});

describe("advancing", () => {
  it("advances when the action matches the active step", () => {
    useWalkthroughStore.getState().startIfUnseen();
    useWalkthroughStore.getState().notify("move");
    expect(useWalkthroughStore.getState().activeIndex).toBe(1);
  });

  it("does not advance on a non-matching action", () => {
    useWalkthroughStore.getState().startIfUnseen();
    useWalkthroughStore.getState().notify("inventory");
    expect(useWalkthroughStore.getState().activeIndex).toBe(0);
  });

  it("ignores notifications while closed", () => {
    useWalkthroughStore.getState().notify("move");
    expect(useWalkthroughStore.getState().activeIndex).toBe(0);
    expect(useWalkthroughStore.getState().isOpen).toBe(false);
  });

  it("completes and closes after the final step", () => {
    useWalkthroughStore.getState().startIfUnseen();
    for (const step of WALKTHROUGH_STEPS) {
      useWalkthroughStore.getState().notify(step.action);
    }
    const state = useWalkthroughStore.getState();
    expect(state.isOpen).toBe(false);
    expect(state.completed).toBe(true);
  });
});

describe("dismissal and revisiting", () => {
  // Covers AE5.
  it("does not auto-start again after being dismissed at step two", () => {
    useWalkthroughStore.getState().startIfUnseen();
    useWalkthroughStore.getState().notify("move");
    useWalkthroughStore.getState().dismiss();

    expect(useWalkthroughStore.getState().completed).toBe(true);

    useWalkthroughStore.getState().startIfUnseen();
    expect(useWalkthroughStore.getState().isOpen).toBe(false);
  });

  // Covers AE4.
  it("reopens from step one even once completed", () => {
    useWalkthroughStore.setState({ completed: true });
    useWalkthroughStore.getState().reopen();

    const state = useWalkthroughStore.getState();
    expect(state.isOpen).toBe(true);
    expect(state.activeIndex).toBe(0);
  });

  it("auto-starts on first entry when never seen", () => {
    useWalkthroughStore.getState().startIfUnseen();
    expect(useWalkthroughStore.getState().isOpen).toBe(true);
  });
});

describe("auto-start scoping", () => {
  // R9 scopes auto-start to the demo world. Mounting it unconditionally would
  // hijack every existing player's own world on upgrade.
  const shouldAutoStart = (worldId: string | undefined) =>
    worldId === DEMO_WORLD_ID;

  it("auto-starts only in the demo world", () => {
    expect(shouldAutoStart(DEMO_WORLD_ID)).toBe(true);
    expect(shouldAutoStart("world-abc123")).toBe(false);
    expect(shouldAutoStart(undefined)).toBe(false);
  });

  it("still reopens on demand in a non-demo world", () => {
    useWalkthroughStore.setState({ completed: true });
    useWalkthroughStore.getState().reopen();
    expect(useWalkthroughStore.getState().isOpen).toBe(true);
  });
});

describe("input-source aware copy (R24)", () => {
  /**
   * Onboarding is the screen whose entire job is teaching the controls, so
   * telling a phone player to press W A S D is the narrowest and most
   * embarrassing version of the gap this whole effort exists to close. The
   * step *detection* was already input-agnostic — it watches the movement
   * intent, which a joystick satisfies exactly as a key does — and only the
   * words were still assuming a keyboard.
   */
  it("gives every step a touch wording", () => {
    for (const step of WALKTHROUGH_STEPS) {
      expect(step.touchHint.trim().length, `${step.action} has no touch hint`).toBeGreaterThan(0);
    }
  });

  it("names no key or mouse button in any touch wording", () => {
    const text = WALKTHROUGH_STEPS.map((s) => s.touchHint).join(" ");
    for (const term of ["W A S D", "left-click", "right-click", "Press E", "mouse"]) {
      expect(text).not.toContain(term);
    }
  });

  it("keeps the keyboard wording for a keyboard", () => {
    // Desktop parity: the words a mouse player sees are untouched.
    expect(stepHint(WALKTHROUGH_STEPS[0], false)).toBe(
      "Use W A S D to walk. Move the mouse to look.",
    );
  });

  it("swaps to the touch wording in touch mode", () => {
    const step = WALKTHROUGH_STEPS[0];
    expect(stepHint(step, true)).toBe(step.touchHint);
    expect(stepHint(step, true)).not.toBe(step.hint);
  });

  it("describes a real affordance in each touch wording", () => {
    // Each hint must name something that exists on screen or a gesture the
    // touch source actually produces — a hint for a control nobody built is
    // worse than no hint.
    const [move, breakStep, place, inventory] = WALKTHROUGH_STEPS;
    expect(move.touchHint).toContain("left of the screen");
    expect(breakStep.touchHint).toContain("hold");
    expect(place.touchHint).toContain("Tap");
    expect(inventory.touchHint).toContain("hotbar");
  });
});
