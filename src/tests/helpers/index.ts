import { KeyboardMouseSource } from "@engine/input/keyboardMouseSource";
import { IntentState } from "@engine/input/snapshot";

/**
 * vitest runs in the node environment, so `window` does not exist. Tests that
 * exercise storage-backed code install a stub for the duration of the case.
 */

type StubStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function memoryStorage(backing: Map<string, string>): StubStorage {
  return {
    getItem: (k: string) => backing.get(k) ?? null,
    setItem: (k: string, v: string) => void backing.set(k, v),
    removeItem: (k: string) => void backing.delete(k),
  };
}

/** Storage whose every access throws, mimicking blocked site data. */
export function throwingStorage(): StubStorage {
  const boom = () => {
    throw new Error("SecurityError: site data blocked");
  };
  return { getItem: boom, setItem: boom, removeItem: boom };
}

/** Storage that reads fine but rejects every write, mimicking a full quota. */
export function readOnlyStorage(backing = new Map<string, string>()): StubStorage {
  return {
    getItem: (k: string) => backing.get(k) ?? null,
    setItem: () => {
      throw new Error("QuotaExceededError");
    },
    removeItem: (k: string) => void backing.delete(k),
  };
}

export interface InstalledWindow {
  local: Map<string, string>;
  session: Map<string, string>;
}

/**
 * Installs a stub `window` with in-memory storage. Pass an override to
 * simulate a browser that denies or fails storage access.
 */
export function installWindow(
  overrides: { localStorage?: StubStorage; sessionStorage?: StubStorage } = {}
): InstalledWindow {
  const local = new Map<string, string>();
  const session = new Map<string, string>();
  (globalThis as { window?: unknown }).window = {
    localStorage: overrides.localStorage ?? memoryStorage(local),
    sessionStorage: overrides.sessionStorage ?? memoryStorage(session),
  };
  return { local, session };
}

export function removeWindow() {
  delete (globalThis as { window?: unknown }).window;
}

/**
 * Intent snapshot with `codes` held, produced by driving the real
 * keyboard/mouse source rather than by hand-rolling a stub.
 *
 * Gameplay consumers read named intents now, but the behaviour worth pinning is
 * still "this key does that", so the tests keep speaking key codes and let the
 * real mapping translate. Each call is a fresh source, i.e. one press: for keys
 * that carry an edge (Space) that means calling it on consecutive frames reads
 * as press-release-press. Use {@link keyboardHarness} when a press has to be
 * held down across frames.
 */
export function heldKeys(...codes: string[]): IntentState {
  const state = new IntentState();
  const source = new KeyboardMouseSource(state);
  for (const code of codes) source.keyDown(code);
  return state;
}

export interface KeyboardHarness {
  /** The snapshot to hand to the consumer under test. */
  intents: IntentState;
  /** Presses keys. A key already down produces no second edge, as auto-repeat must not. */
  press(...codes: string[]): void;
  release(...codes: string[]): void;
}

/** Stateful keyboard whose presses persist across frames. */
export function keyboardHarness(now: () => number = () => performance.now()): KeyboardHarness {
  const intents = new IntentState();
  const source = new KeyboardMouseSource(intents, now);
  return {
    intents,
    press: (...codes: string[]) => codes.forEach((c) => source.keyDown(c)),
    release: (...codes: string[]) => codes.forEach((c) => source.keyUp(c)),
  };
}
