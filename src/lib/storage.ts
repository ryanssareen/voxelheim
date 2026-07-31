/**
 * SSR-safe, throw-safe access to Web Storage.
 *
 * Two failure modes make bare `localStorage` calls unsafe here: this code runs
 * during SSR where `window` does not exist, and browsers throw on mere property
 * access when site data is blocked or the page is a sandboxed iframe. Every
 * read degrades to a fallback and every write reports success rather than
 * throwing, so a locked-down browser loses persistence but still plays.
 */

type Kind = "local" | "session";

function store(kind: Kind): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return kind === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

function read(kind: Kind, key: string): string | null {
  try {
    return store(kind)?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

/** Returns false when the value could not be persisted (blocked or quota). */
function write(kind: Kind, key: string, value: string): boolean {
  try {
    const s = store(kind);
    if (!s) return false;
    s.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function remove(kind: Kind, key: string): void {
  try {
    store(kind)?.removeItem(key);
  } catch {}
}

function readJson<T>(kind: Kind, key: string, fallback: T): T {
  const raw = read(kind, key);
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(kind: Kind, key: string, value: unknown): boolean {
  try {
    return write(kind, key, JSON.stringify(value));
  } catch {
    // Value was not serializable.
    return false;
  }
}

export const readLocal = (key: string) => read("local", key);
export const writeLocal = (key: string, value: string) => write("local", key, value);
export const removeLocal = (key: string) => remove("local", key);
export const readLocalJson = <T,>(key: string, fallback: T) => readJson("local", key, fallback);
export const writeLocalJson = (key: string, value: unknown) => writeJson("local", key, value);

export const readSession = (key: string) => read("session", key);
export const writeSession = (key: string, value: string) => write("session", key, value);
export const removeSession = (key: string) => remove("session", key);
export const readSessionJson = <T,>(key: string, fallback: T) => readJson("session", key, fallback);
export const writeSessionJson = (key: string, value: unknown) => writeJson("session", key, value);
