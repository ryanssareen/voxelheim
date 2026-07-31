import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { KEYBIND_GROUPS } from "@data/keybinds";
import { useKeybindsStore } from "@store/useKeybindsStore";

function installWindow() {
  const store = new Map<string, string>();
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  };
  return store;
}

beforeEach(() => {
  installWindow();
  useKeybindsStore.setState({ isOpen: false, seen: false });
});

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

describe("keybind data", () => {
  it("lists the movement, building and view groups", () => {
    expect(KEYBIND_GROUPS.map((g) => g.title)).toEqual([
      "Moving",
      "Building",
      "View",
    ]);
  });

  it("gives every bind both keys and an action", () => {
    for (const group of KEYBIND_GROUPS) {
      expect(group.binds.length).toBeGreaterThan(0);
      for (const b of group.binds) {
        expect(b.keys.trim()).not.toBe("");
        expect(b.action.trim()).not.toBe("");
      }
    }
  });
});

describe("showOnce", () => {
  it("opens the first time and marks it seen", () => {
    useKeybindsStore.getState().showOnce();
    const s = useKeybindsStore.getState();
    expect(s.isOpen).toBe(true);
    expect(s.seen).toBe(true);
  });

  // The whole point: once, and only once.
  it("does not reopen after being closed", () => {
    useKeybindsStore.getState().showOnce();
    useKeybindsStore.getState().close();
    useKeybindsStore.getState().showOnce();
    expect(useKeybindsStore.getState().isOpen).toBe(false);
  });

  it("does not reopen for a browser that already saw it", () => {
    useKeybindsStore.setState({ seen: true, isOpen: false });
    useKeybindsStore.getState().showOnce();
    expect(useKeybindsStore.getState().isOpen).toBe(false);
  });

  it("persists seen so a later page load does not auto-open", () => {
    const store = installWindow();
    useKeybindsStore.getState().showOnce();
    expect(store.get("voxelheim-keybinds-seen")).toBe("true");
  });
});

describe("manual open", () => {
  it("opens from the pause menu even once seen", () => {
    useKeybindsStore.setState({ seen: true, isOpen: false });
    useKeybindsStore.getState().open();
    expect(useKeybindsStore.getState().isOpen).toBe(true);
  });
});
