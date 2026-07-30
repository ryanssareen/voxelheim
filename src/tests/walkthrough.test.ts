import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  WALKTHROUGH_STEPS,
  useWalkthroughStore,
} from "@store/useWalkthroughStore";

function installWindow() {
  const store = new Map<string, string>();
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  };
}

beforeEach(() => {
  installWindow();
  useWalkthroughStore.setState({ isOpen: false, activeIndex: 0, completed: false });
});

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

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
