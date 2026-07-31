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
