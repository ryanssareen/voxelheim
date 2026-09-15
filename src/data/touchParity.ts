import { KEYBIND_GROUPS } from "@data/keybinds";

/**
 * How every desktop action is reached with a finger — the answer to R23, kept
 * as data rather than as a claim in a plan document.
 *
 * One table, two consumers. The controls popup renders it in touch mode, and
 * `src/tests/keyboardActionInventory.test.ts` asserts that every bind in
 * {@link KEYBIND_GROUPS} appears here exactly once. That pairing is the point:
 * a new keyboard bind added without a touch answer fails the test, and a
 * deferral has to be written down as a deferral rather than simply forgotten.
 *
 * The distinction between a *gesture* and a *control* is worth keeping. A
 * control is a thing on screen a player can find by looking; a gesture is not,
 * which is why the three play-surface gestures get a one-time hint card (R13)
 * and the buttons do not.
 */

/** What a finger does instead, or why it does nothing. */
export type TouchResolution =
  /** An unlabelled movement of the finger on a surface that shows no control. */
  | { kind: "gesture"; how: string }
  /** A button, icon or slot the player can see. */
  | { kind: "control"; how: string }
  /** Deliberately unavailable on touch, with the reason recorded. */
  | { kind: "deferred"; why: string };

export interface ParityAction {
  /** The action text, matching {@link KEYBIND_GROUPS} exactly. */
  action: string;
  touch: TouchResolution;
}

/**
 * Every action, in the order the controls popup shows them.
 *
 * Two actions appear in `KEYBIND_GROUPS` twice — "Walk" is bound to both WASD
 * and the arrow keys — so this is keyed by action rather than by key, and the
 * inventory test accounts for the duplication rather than requiring a row per
 * bind.
 */
export const TOUCH_PARITY: readonly ParityAction[] = [
  {
    action: "Walk",
    touch: { kind: "control", how: "Joystick — drag from the left of the screen" },
  },
  {
    action: "Look around",
    touch: { kind: "gesture", how: "Drag anywhere on the right of the screen" },
  },
  { action: "Jump / fly up", touch: { kind: "control", how: "Jump button, bottom right" } },
  {
    action: "Sprint / fly faster",
    touch: { kind: "gesture", how: "Double-tap the joystick and keep holding" },
  },
  { action: "Sneak / fly down", touch: { kind: "control", how: "Crouch button, bottom right" } },
  {
    action: "Toggle flying (creative)",
    touch: { kind: "control", how: "Double-tap the Jump button" },
  },
  { action: "Break block", touch: { kind: "gesture", how: "Hold on the block" } },
  { action: "Place block", touch: { kind: "gesture", how: "Tap where it goes" } },
  { action: "Pick hotbar slot", touch: { kind: "control", how: "Tap the slot" } },
  { action: "Inventory", touch: { kind: "control", how: "Grid button at the end of the hotbar" } },
  { action: "Drop held item", touch: { kind: "control", how: "Press and hold a hotbar slot" } },
  { action: "Zoom", touch: { kind: "control", how: "Zoom icon — tap to toggle, tap again to clear" } },
  { action: "Change camera", touch: { kind: "control", how: "Change camera, in the pause menu" } },
  { action: "Toggle minimap", touch: { kind: "control", how: "Map icon, left edge" } },
  { action: "Chat", touch: { kind: "control", how: "Chat icon, left edge" } },
  { action: "Debug info", touch: { kind: "control", how: "Debug info, in the pause menu" } },
  { action: "Pause", touch: { kind: "control", how: "Pause icon, left edge" } },
];

/**
 * Actions deliberately left without a touch affordance.
 *
 * Empty today, and kept as an exported constant anyway so a future deferral has
 * somewhere to be written down. The inventory test reads it, so a deferral
 * added here is accounted for rather than silently passing.
 */
export const TOUCH_DEFERRED: readonly ParityAction[] = TOUCH_PARITY.filter(
  (row) => row.touch.kind === "deferred",
);

/** Every distinct action the keyboard exposes. */
export function keyboardActions(): readonly string[] {
  const seen = new Set<string>();
  for (const group of KEYBIND_GROUPS) {
    for (const bind of group.binds) seen.add(bind.action);
  }
  return [...seen];
}

/** Actions with a keyboard bind and no row in {@link TOUCH_PARITY}. */
export function unresolvedKeyboardActions(): readonly string[] {
  const resolved = new Set(TOUCH_PARITY.map((row) => row.action));
  return keyboardActions().filter((action) => !resolved.has(action));
}

/** Rows in {@link TOUCH_PARITY} that no keyboard bind produces — a stale entry. */
export function orphanedParityRows(): readonly string[] {
  const actions = new Set(keyboardActions());
  return TOUCH_PARITY.filter((row) => !actions.has(row.action)).map((row) => row.action);
}

export interface TouchControlGroup {
  title: string;
  rows: ReadonlyArray<{ how: string; action: string }>;
}

/**
 * The parity table grouped the way the controls popup draws it, mirroring
 * `KEYBIND_GROUPS`' own three headings so a player who has seen one layout
 * recognises the other.
 *
 * Grouping is derived from where each action sits in `KEYBIND_GROUPS` rather
 * than restated, so a bind that moves between groups moves here with it.
 */
export function touchControlGroups(): readonly TouchControlGroup[] {
  const byAction = new Map(TOUCH_PARITY.map((row) => [row.action, row.touch]));
  const groups: TouchControlGroup[] = [];

  for (const group of KEYBIND_GROUPS) {
    const rows: Array<{ how: string; action: string }> = [];
    const seen = new Set<string>();

    for (const bind of group.binds) {
      if (seen.has(bind.action)) continue;
      seen.add(bind.action);
      const touch = byAction.get(bind.action);
      if (!touch || touch.kind === "deferred") continue;
      rows.push({ how: touch.how, action: bind.action });
    }

    if (rows.length > 0) groups.push({ title: group.title, rows });
  }

  return groups;
}
