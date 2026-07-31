import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { KEYBIND_GROUPS } from "@data/keybinds";
import { useKeybindsStore } from "@store/useKeybindsStore";
import { PlayerController } from "@engine/player/PlayerController";
import type { InputManager } from "@engine/InputManager";
import type { Camera } from "@engine/player/Camera";
import type { BlockRegistry } from "@engine/world/BlockRegistry";
import { installWindow, removeWindow } from "./helpers";

beforeEach(() => {
  installWindow();
  useKeybindsStore.setState({ isOpen: false, seen: false });
});

afterEach(removeWindow);

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

/**
 * The popup is only useful if it describes what the game actually does. These
 * tests drive PlayerController with the keys the popup advertises and assert the
 * documented effect happens — the structural checks above passed happily while
 * Sneak and Sprint were labelled on each other's keys.
 */
describe("advertised movement binds match PlayerController", () => {
  const registry = { isSolid: () => false } as unknown as BlockRegistry;
  const camera = {
    getForward: () => ({ x: 0, y: 0, z: -1 }),
    getRight: () => ({ x: 1, y: 0, z: 0 }),
  } as unknown as Camera;
  const noBlocks = () => 0;

  /** Maps a label shown in the popup to the KeyboardEvent codes it stands for. */
  const CODES: Record<string, string[]> = {
    Ctrl: ["ControlLeft", "ControlRight"],
    Shift: ["ShiftLeft", "ShiftRight"],
    CapsLock: ["CapsLock"],
  };

  function keysFor(actionFragment: string): string[] {
    const moving = KEYBIND_GROUPS.find((g) => g.title === "Moving");
    const bind = moving?.binds.find((b) =>
      b.action.toLowerCase().includes(actionFragment.toLowerCase())
    );
    if (!bind) throw new Error(`no "Moving" bind advertises "${actionFragment}"`);
    return bind.keys.split("/").flatMap((label) => CODES[label.trim()] ?? []);
  }

  /** Runs one frame with `code` held and reports the resulting movement state. */
  function stateWith(code: string) {
    const player = new PlayerController(0, 10, 0);
    const input = {
      isKeyDown: (k: string) => k === code,
    } as unknown as InputManager;
    player.update(1 / 60, input, camera, noBlocks, registry);
    return { crouching: player.isCrouching, sprinting: player.isSprinting };
  }

  it("every key advertised for Sneak actually crouches", () => {
    const codes = keysFor("sneak");
    expect(codes.length).toBeGreaterThan(0);
    for (const code of codes) {
      expect(stateWith(code).crouching, `${code} should sneak`).toBe(true);
    }
  });

  it("every key advertised for Sprint actually sprints", () => {
    const codes = keysFor("sprint");
    expect(codes.length).toBeGreaterThan(0);
    for (const code of codes) {
      expect(stateWith(code).sprinting, `${code} should sprint`).toBe(true);
    }
  });

  it("does not advertise the same key for both Sneak and Sprint", () => {
    const overlap = keysFor("sneak").filter((k) => keysFor("sprint").includes(k));
    expect(overlap).toEqual([]);
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
    const { local } = installWindow();
    useKeybindsStore.getState().showOnce();
    expect(local.get("voxelheim-keybinds-seen")).toBe("true");
  });
});

describe("manual open", () => {
  it("opens from the pause menu even once seen", () => {
    useKeybindsStore.setState({ seen: true, isOpen: false });
    useKeybindsStore.getState().open();
    expect(useKeybindsStore.getState().isOpen).toBe(true);
  });
});
