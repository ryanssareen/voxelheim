import { describe, it, expect } from "vitest";
import { KEYBIND_GROUPS } from "@data/keybinds";

/**
 * Characterization test for R23 (docs/brainstorms/2026-09-11-mobile-tablet-support-requirements.md):
 * "Every action currently reachable only by keyboard has a touch affordance or
 * is explicitly listed as deferred."
 *
 * Keyboard handling is scattered across the codebase:
 *  - Most gameplay keys go through `InputManager.isKeyDown()`, polled each
 *    frame by `PlayerController` and `Engine`.
 *  - Several React components attach their OWN `window` "keydown" listeners
 *    and bypass InputManager entirely: chat (GameCanvas), debug info (HUD),
 *    minimap toggle (MinimapUI), and the keybinds popup's own Escape/Enter
 *    close handler (KeybindsPopup).
 *  - `Escape` for "Pause" is not read from any keydown handler at all: it
 *    relies on the BROWSER's native pointer-lock-exit behavior, observed via
 *    `InputManager.onPointerLockLost` (wired in `Engine.ts`).
 *
 * `src/data/keybinds.ts` is a display-only table with nothing enforcing it
 * matches reality. This test hand-encodes the actual inventory (found by
 * grepping the whole src/ tree for isKeyDown / keydown listeners / e.code
 * comparisons on 2026-09-11) and cross-checks it against keybinds.ts, so
 * that adding/removing/renaming a key handler without updating keybinds.ts,
 * or vice versa, fails this test.
 *
 * IMPORTANT: this inventory must be updated by hand alongside any change to
 * keyboard handling. It is intentionally NOT derived by scanning source code
 * at test time (too brittle/gameable) — it is a pinned snapshot of behavior.
 */

interface KeyHandlerEntry {
  /** KeyboardEvent.code value. */
  code: string;
  /** Short description of what the key does today. */
  action: string;
  /** file:line where the key is read/handled. */
  location: string;
  /** true = polled via InputManager.isKeyDown(); false = own window listener / native browser behavior. */
  viaInputManager: boolean;
}

/**
 * The complete, hand-audited inventory of key codes the game actually
 * responds to, as of this writing. See file header for how this was built.
 */
const KEY_HANDLER_INVENTORY: readonly KeyHandlerEntry[] = [
  // --- Movement: key codes are mapped to intents in keyboardMouseSource.ts and
  // consumed by PlayerController.update(), which no longer sees codes at all.
  // InputManager still owns the listeners, so these remain viaInputManager. ---
  { code: "KeyW", action: "Walk forward", location: "src/engine/input/keyboardMouseSource.ts:40 -> PlayerController.ts:139", viaInputManager: true },
  { code: "ArrowUp", action: "Walk forward", location: "src/engine/input/keyboardMouseSource.ts:41 -> PlayerController.ts:139", viaInputManager: true },
  { code: "KeyS", action: "Walk backward", location: "src/engine/input/keyboardMouseSource.ts:42 -> PlayerController.ts:140", viaInputManager: true },
  { code: "ArrowDown", action: "Walk backward", location: "src/engine/input/keyboardMouseSource.ts:43 -> PlayerController.ts:140", viaInputManager: true },
  { code: "KeyA", action: "Walk left", location: "src/engine/input/keyboardMouseSource.ts:44 -> PlayerController.ts:142", viaInputManager: true },
  { code: "ArrowLeft", action: "Walk left", location: "src/engine/input/keyboardMouseSource.ts:45 -> PlayerController.ts:142", viaInputManager: true },
  { code: "KeyD", action: "Walk right", location: "src/engine/input/keyboardMouseSource.ts:46 -> PlayerController.ts:141", viaInputManager: true },
  { code: "ArrowRight", action: "Walk right", location: "src/engine/input/keyboardMouseSource.ts:47 -> PlayerController.ts:141", viaInputManager: true },
  { code: "Space", action: "Jump / fly up / double-tap toggles flying (creative)", location: "src/engine/input/keyboardMouseSource.ts:48,71 -> PlayerController.ts:107,185,201", viaInputManager: true },
  { code: "ShiftLeft", action: "Sprint / fly faster", location: "src/engine/input/keyboardMouseSource.ts:49 -> PlayerController.ts:129", viaInputManager: true },
  { code: "ShiftRight", action: "Sprint / fly faster", location: "src/engine/input/keyboardMouseSource.ts:50 -> PlayerController.ts:129", viaInputManager: true },
  { code: "ControlLeft", action: "Sneak / fly down", location: "src/engine/input/keyboardMouseSource.ts:51 -> PlayerController.ts:126,187", viaInputManager: true },
  { code: "ControlRight", action: "Sneak / fly down", location: "src/engine/input/keyboardMouseSource.ts:52 -> PlayerController.ts:126,187", viaInputManager: true },
  // CHANGED in U3 (intent layer): CapsLock used to sneak but NOT fly down,
  // because the flight-descend branch listed the two Control codes only. All
  // three codes now produce the one `sneak` intent the controller reads for
  // both, so CapsLock descends too — which is what keybinds.ts has always
  // advertised ("Ctrl / CapsLock" -> "Sneak / fly down"). Pinned behaviourally
  // in src/tests/playerControllerInput.test.ts.
  { code: "CapsLock", action: "Sneak / fly down", location: "src/engine/input/keyboardMouseSource.ts:53 -> PlayerController.ts:126,187", viaInputManager: true },

  // --- Building / hotbar. Since U4 the engine reads named edges, not codes:
  // keyboardMouseSource maps the code to an edge intent and Engine.update()
  // takes one frame's worth through readEngineFrameEdges(). InputManager still
  // owns the listeners, so these stay viaInputManager. ---
  { code: "Digit1", action: "Pick hotbar slot 1", location: "src/engine/input/keyboardMouseSource.ts:81 -> frameIntents.ts:94 -> Engine.ts:967", viaInputManager: true },
  { code: "Digit2", action: "Pick hotbar slot 2", location: "src/engine/input/keyboardMouseSource.ts:82 -> frameIntents.ts:94 -> Engine.ts:967", viaInputManager: true },
  { code: "Digit3", action: "Pick hotbar slot 3", location: "src/engine/input/keyboardMouseSource.ts:83 -> frameIntents.ts:94 -> Engine.ts:967", viaInputManager: true },
  { code: "Digit4", action: "Pick hotbar slot 4", location: "src/engine/input/keyboardMouseSource.ts:84 -> frameIntents.ts:94 -> Engine.ts:967", viaInputManager: true },
  { code: "Digit5", action: "Pick hotbar slot 5", location: "src/engine/input/keyboardMouseSource.ts:85 -> frameIntents.ts:94 -> Engine.ts:967", viaInputManager: true },
  { code: "Digit6", action: "Pick hotbar slot 6", location: "src/engine/input/keyboardMouseSource.ts:86 -> frameIntents.ts:94 -> Engine.ts:967", viaInputManager: true },
  { code: "Digit7", action: "Pick hotbar slot 7", location: "src/engine/input/keyboardMouseSource.ts:87 -> frameIntents.ts:94 -> Engine.ts:967", viaInputManager: true },
  { code: "Digit8", action: "Pick hotbar slot 8", location: "src/engine/input/keyboardMouseSource.ts:88 -> frameIntents.ts:94 -> Engine.ts:967", viaInputManager: true },
  { code: "Digit9", action: "Pick hotbar slot 9", location: "src/engine/input/keyboardMouseSource.ts:89 -> frameIntents.ts:94 -> Engine.ts:967", viaInputManager: true },
  { code: "KeyE", action: "Open inventory", location: "src/engine/input/keyboardMouseSource.ts:74 -> frameIntents.ts:77 -> Engine.ts:894", viaInputManager: true },
  { code: "KeyQ", action: "Drop held item", location: "src/engine/input/keyboardMouseSource.ts:75 -> frameIntents.ts:83 -> Engine.ts:972", viaInputManager: true },

  // --- View (Engine, read from the intent snapshot; V is a held intent, P an edge) ---
  { code: "KeyV", action: "Zoom", location: "src/engine/input/keyboardMouseSource.ts:56 -> Engine.ts:761", viaInputManager: true },
  { code: "KeyP", action: "Change camera mode", location: "src/engine/input/keyboardMouseSource.ts:76 -> frameIntents.ts:80 -> Engine.ts:964", viaInputManager: true },

  // --- View: components that bypass InputManager with their own window listener ---
  { code: "KeyM", action: "Toggle minimap", location: "src/ui/MinimapUI.tsx:166", viaInputManager: false },
  { code: "KeyT", action: "Open chat", location: "src/ui/GameCanvas.tsx:78", viaInputManager: false },
  { code: "F3", action: "Toggle debug info", location: "src/ui/HUD.tsx:178", viaInputManager: false },

  // --- Escape: no keydown handler drives "Pause" at all. It rides the
  // browser's native pointer-lock-exit, observed via onPointerLockLost. ---
  { code: "Escape", action: "Pause (via native pointer-lock release, not a keydown listener)", location: "src/engine/Engine.ts:224 (InputManager.onPointerLockLost)", viaInputManager: false },
] as const;

/** Maps a keybinds.ts key label to the KeyboardEvent.code values it stands for. */
const LABEL_TO_CODES: Record<string, string[]> = {
  W: ["KeyW"],
  A: ["KeyA"],
  S: ["KeyS"],
  D: ["KeyD"],
  Arrows: ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"],
  Space: ["Space"],
  "Double-tap Space": ["Space"],
  Shift: ["ShiftLeft", "ShiftRight"],
  Ctrl: ["ControlLeft", "ControlRight"],
  CapsLock: ["CapsLock"],
  "1": ["Digit1"],
  "9": ["Digit9"],
  E: ["KeyE"],
  Q: ["KeyQ"],
  V: ["KeyV"],
  P: ["KeyP"],
  M: ["KeyM"],
  T: ["KeyT"],
  F3: ["F3"],
  Esc: ["Escape"],
};

/** Non-keyboard binds in keybinds.ts (mouse) that this inventory intentionally excludes. */
const NON_KEYBOARD_LABELS = new Set(["Mouse", "Left click", "Right click"]);

/** Parses a keybinds.ts "keys" cell (e.g. "Ctrl / CapsLock", "1 - 9", "W A S D") into codes. */
function labelsToCodes(keys: string): string[] {
  // Exact-match multi-word labels must be checked before generic
  // dash/slash/space decomposition below.
  if (NON_KEYBOARD_LABELS.has(keys)) return [];
  if (LABEL_TO_CODES[keys]) return LABEL_TO_CODES[keys];
  if (keys.includes(" - ")) {
    // Range shorthand, e.g. "1 - 9" -> Digit1..Digit9
    const [start, end] = keys.split(" - ").map((s) => s.trim());
    const codes: string[] = [];
    for (const label of [start, end]) {
      if (!LABEL_TO_CODES[label]) throw new Error(`no code mapping for range endpoint "${label}"`);
    }
    const startNum = Number(start);
    const endNum = Number(end);
    for (let i = startNum; i <= endNum; i++) codes.push(`Digit${i}`);
    return codes;
  }
  if (keys.includes("/")) {
    // Alternatives, e.g. "Ctrl / CapsLock"
    return keys.split("/").flatMap((label) => labelsToCodes(label.trim()));
  }
  if (keys.includes(" ")) {
    // Space-separated list, e.g. "W A S D"
    return keys.split(" ").flatMap((label) => labelsToCodes(label));
  }
  if (NON_KEYBOARD_LABELS.has(keys)) return [];
  const codes = LABEL_TO_CODES[keys];
  if (!codes) throw new Error(`no code mapping for keybinds.ts label "${keys}"`);
  return codes;
}

const INVENTORY_CODES = new Set(KEY_HANDLER_INVENTORY.map((e) => e.code));

describe("keyboard action inventory (R23 audit)", () => {
  it("every keyboard bind advertised in keybinds.ts maps to a code the codebase actually handles", () => {
    for (const group of KEYBIND_GROUPS) {
      for (const bind of group.binds) {
        const codes = labelsToCodes(bind.keys);
        for (const code of codes) {
          expect(
            INVENTORY_CODES.has(code),
            `keybinds.ts advertises "${bind.action}" (${bind.keys} -> ${code}), but no handler for ${code} is in the pinned inventory`
          ).toBe(true);
        }
      }
    }
  });

  it("the pinned inventory has no unexplained extra codes beyond what keybinds.ts advertises", () => {
    const advertisedCodes = new Set(
      KEYBIND_GROUPS.flatMap((g) => g.binds.flatMap((b) => labelsToCodes(b.keys)))
    );
    for (const entry of KEY_HANDLER_INVENTORY) {
      expect(
        advertisedCodes.has(entry.code),
        `${entry.code} (${entry.action}, ${entry.location}) is handled in code but not advertised anywhere in keybinds.ts`
      ).toBe(true);
    }
  });

  it("pins which codes bypass InputManager (own window listeners or native browser behavior)", () => {
    const bypassing = KEY_HANDLER_INVENTORY.filter((e) => !e.viaInputManager)
      .map((e) => e.code)
      .sort();
    expect(bypassing).toEqual(["Escape", "F3", "KeyM", "KeyT"]);
  });

  it("pins the total set of handled key codes, so a new/removed handler must update this file", () => {
    const codes = [...INVENTORY_CODES].sort();
    expect(codes).toEqual(
      [
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
        "ArrowUp",
        "CapsLock",
        "ControlLeft",
        "ControlRight",
        "Digit1",
        "Digit2",
        "Digit3",
        "Digit4",
        "Digit5",
        "Digit6",
        "Digit7",
        "Digit8",
        "Digit9",
        "Escape",
        "F3",
        "KeyA",
        "KeyD",
        "KeyE",
        "KeyM",
        "KeyP",
        "KeyQ",
        "KeyS",
        "KeyT",
        "KeyV",
        "KeyW",
        "ShiftLeft",
        "ShiftRight",
        "Space",
      ].sort()
    );
  });

  /**
   * R23 (docs/brainstorms/2026-09-11-mobile-tablet-support-requirements.md line 75)
   * requires every keyboard-only action to have a touch affordance OR be
   * explicitly deferred. Line 178 of that doc names the actions still
   * missing one: sprint, creative fly toggle, drop, zoom, minimap toggle,
   * and debug info. This test does not (and cannot) verify touch UI exists —
   * that's out of scope for a src/ keyboard audit — but it pins that these
   * actions are keyboard-only today, so the requirement stays checkable
   * against a concrete list instead of vague recollection.
   */
  it("pins the actions R23 flags as currently keyboard-only with no touch affordance", () => {
    const keyboardOnlyNoTouchAffordance = [
      "Sprint / fly faster (Shift)",
      "Sneak / fly down (Ctrl / CapsLock)",
      "Double-tap Space (toggle flying, creative)",
      "Drop held item (Q)",
      "Zoom (V)",
      "Toggle minimap (M)",
      "Chat (T)",
      "Debug info (F3)",
    ];
    // This is a documentation pin, not a behavioral assertion — it exists so
    // that shrinking or growing this list requires a deliberate edit here.
    expect(keyboardOnlyNoTouchAffordance).toHaveLength(8);
  });
});
