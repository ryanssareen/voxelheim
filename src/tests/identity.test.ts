import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  __resetIdentityCache,
  MAX_PLAYER_NAME_LENGTH,
  PLAYER_ID_STORAGE_KEY,
  generateName,
  readPlayerNameOverride,
  resolvePlayerId,
  resolvePlayerName,
  writePlayerNameOverride,
} from "@lib/identity";
import { useAuthStore } from "@store/useAuthStore";

// vitest runs in the node environment, so window is installed per-test.
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

function removeWindow() {
  delete (globalThis as { window?: unknown }).window;
  __resetIdentityCache();
}

describe("resolvePlayerId", () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null });
  });

  afterEach(removeWindow);

  it("returns the auth uid when signed in", () => {
    installWindow();
    useAuthStore.setState({
      user: { uid: "uid-123", email: "kid@example.com", idToken: "", refreshToken: "" },
    });
    expect(resolvePlayerId()).toBe("uid-123");
  });

  it("mints and persists a guest id when signed out and persist is requested", () => {
    const store = installWindow();
    const id = resolvePlayerId(true);
    expect(id).toMatch(/^guest-/);
    expect(store.get(PLAYER_ID_STORAGE_KEY)).toBe(id);
  });

  it("returns the same guest id on a second call", () => {
    installWindow();
    expect(resolvePlayerId()).toBe(resolvePlayerId());
  });

  it("does not throw when window is undefined", () => {
    removeWindow();
    expect(() => resolvePlayerId()).not.toThrow();
    expect(resolvePlayerId()).toBe("offline-player");
  });
});

describe("storage denial", () => {
  afterEach(removeWindow);

  it("does not throw when localStorage access itself throws", () => {
    (globalThis as { window?: unknown }).window = {
      localStorage: {
        getItem: () => {
          throw new Error("SecurityError: site data blocked");
        },
        setItem: () => {
          throw new Error("SecurityError: site data blocked");
        },
        removeItem: () => {},
      },
    };
    useAuthStore.setState({ user: null });

    expect(() => resolvePlayerId()).not.toThrow();
    expect(() => resolvePlayerName()).not.toThrow();
  });

  it("returns a stable id across calls when the write fails", () => {
    (globalThis as { window?: unknown }).window = {
      localStorage: {
        getItem: () => null,
        setItem: () => {
          throw new Error("QuotaExceededError");
        },
        removeItem: () => {},
      },
    };
    useAuthStore.setState({ user: null });

    expect(resolvePlayerId(true)).toBe(resolvePlayerId(true));
  });
});

describe("lazy minting", () => {
  afterEach(removeWindow);

  // R5: loading a page must not write a durable identifier.
  it("does not persist an id until persist is requested", () => {
    const store = installWindow();
    useAuthStore.setState({ user: null });

    resolvePlayerId();
    expect(store.has(PLAYER_ID_STORAGE_KEY)).toBe(false);

    resolvePlayerId(true);
    expect(store.has(PLAYER_ID_STORAGE_KEY)).toBe(true);
  });
});

describe("generateName", () => {
  it("is stable for the same player id", () => {
    expect(generateName("guest-abc123")).toBe(generateName("guest-abc123"));
  });

  it("produces distinct names across different ids", () => {
    const ids = Array.from({ length: 24 }, (_, i) => `guest-${i}`);
    const names = new Set(ids.map(generateName));
    // Collisions are possible in a 32x32 space; require broad distinctness.
    expect(names.size).toBeGreaterThan(ids.length * 0.8);
  });

  it("never returns the old shared Guest constant", () => {
    const ids = Array.from({ length: 24 }, (_, i) => `guest-${i}`);
    expect(ids.map(generateName)).not.toContain("Guest");
  });

  it("never exceeds the max name length", () => {
    const ids = Array.from({ length: 200 }, (_, i) => `player-${i}`);
    for (const name of ids.map(generateName)) {
      expect(name.length).toBeLessThanOrEqual(MAX_PLAYER_NAME_LENGTH);
    }
  });
});

describe("player name override", () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null });
  });

  afterEach(removeWindow);

  it("takes precedence over the generated name", () => {
    installWindow();
    writePlayerNameOverride("Ryan");
    expect(resolvePlayerName()).toBe("Ryan");
  });

  it("truncates an override longer than the max length", () => {
    installWindow();
    writePlayerNameOverride("ABCDEFGHIJKLMNOPQRSTUVWXYZ");
    expect(readPlayerNameOverride()).toHaveLength(MAX_PLAYER_NAME_LENGTH);
  });

  it("clears back to the generated name when set to empty", () => {
    installWindow();
    writePlayerNameOverride("Ryan");
    writePlayerNameOverride("   ");
    expect(readPlayerNameOverride()).toBeNull();
    expect(resolvePlayerName()).toBe(generateName(resolvePlayerId()));
  });

  it("falls back to a generated name, not Guest, with no override", () => {
    installWindow();
    expect(resolvePlayerName()).not.toBe("Guest");
  });

  // R8: the email must not reach session data even for signed-in users.
  it("never derives the name from a signed-in user's email", () => {
    installWindow();
    useAuthStore.setState({
      user: { uid: "uid-9", email: "ryansareen@example.com", idToken: "", refreshToken: "" },
    });
    const name = resolvePlayerName();
    expect(name).not.toContain("ryansareen");
    expect(name).toBe(generateName("uid-9"));
  });
});
