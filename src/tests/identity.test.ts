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

import {
  installWindow as installStubWindow,
  readOnlyStorage,
  removeWindow as removeStubWindow,
  throwingStorage,
} from "./helpers";

const installWindow = () => installStubWindow().local;

function removeWindow() {
  removeStubWindow();
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
    installStubWindow({ localStorage: throwingStorage() });
    useAuthStore.setState({ user: null });

    expect(() => resolvePlayerId()).not.toThrow();
    expect(() => resolvePlayerName()).not.toThrow();
  });

  it("returns a stable id across calls when the write fails", () => {
    installStubWindow({ localStorage: readOnlyStorage() });
    useAuthStore.setState({ user: null });

    expect(resolvePlayerId(true)).toBe(resolvePlayerId(true));
  });
});

describe("lazy minting", () => {
  afterEach(removeWindow);

  // R5: loading a page must not write a durable identifier.
  it("does not persist an id until persist is requested", () => {
    const { local } = installStubWindow();
    useAuthStore.setState({ user: null });

    resolvePlayerId();
    expect(local.has(PLAYER_ID_STORAGE_KEY)).toBe(false);

    resolvePlayerId(true);
    expect(local.has(PLAYER_ID_STORAGE_KEY)).toBe(true);
  });

  // Without this the generated name changes on every reload, so a visitor who
  // never sets a name sees a different identity each time.
  it("keeps the id stable across reloads via sessionStorage", () => {
    const { session } = installStubWindow();
    useAuthStore.setState({ user: null });

    const first = resolvePlayerId();
    expect(session.get(PLAYER_ID_STORAGE_KEY)).toBe(first);

    // Simulate a reload: same tab storage, fresh module cache.
    __resetIdentityCache();
    expect(resolvePlayerId()).toBe(first);
  });

  it("promotes a per-visit id to durable on the first persisting action", () => {
    const { local, session } = installStubWindow();
    useAuthStore.setState({ user: null });

    const visitId = resolvePlayerId();
    expect(local.has(PLAYER_ID_STORAGE_KEY)).toBe(false);

    expect(resolvePlayerId(true)).toBe(visitId);
    expect(local.get(PLAYER_ID_STORAGE_KEY)).toBe(visitId);
    expect(session.get(PLAYER_ID_STORAGE_KEY)).toBe(visitId);
  });

  it("prefers a durable id over the per-visit one", () => {
    const { local, session } = installStubWindow();
    useAuthStore.setState({ user: null });
    session.set(PLAYER_ID_STORAGE_KEY, "guest-session");
    local.set(PLAYER_ID_STORAGE_KEY, "guest-durable");

    expect(resolvePlayerId()).toBe("guest-durable");
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
