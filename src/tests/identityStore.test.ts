import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { __resetIdentityCache, generateName } from "@lib/identity";
import { useAuthStore } from "@store/useAuthStore";

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

// The store snapshots at module evaluation, so window must exist before import.
installWindow();
const { useIdentityStore } = await import("@store/useIdentityStore");

beforeEach(() => {
  installWindow();
  __resetIdentityCache();
  useAuthStore.setState({ user: null });
});

afterEach(() => {
  useAuthStore.setState({ user: null });
  delete (globalThis as { window?: unknown }).window;
  __resetIdentityCache();
});

describe("useIdentityStore auth reactivity", () => {
  // Auth hydrates in an effect after this module is evaluated. Without the
  // subscription the store keeps a guest identity while MultiplayerManager
  // (constructed later) resolves the auth uid -- two names for one player.
  it("recomputes identity when a user signs in", () => {
    const before = useIdentityStore.getState().playerName;

    useAuthStore.setState({
      user: { uid: "uid-signed-in", email: "kid@example.com", idToken: "", refreshToken: "" },
    });

    const after = useIdentityStore.getState();
    expect(after.playerId).toBe("uid-signed-in");
    expect(after.playerName).toBe(generateName("uid-signed-in"));
    expect(after.playerName).not.toBe(before);
  });

  it("never exposes the email local-part as the display name", () => {
    useAuthStore.setState({
      user: { uid: "uid-9", email: "ryansareen@example.com", idToken: "", refreshToken: "" },
    });
    expect(useIdentityStore.getState().playerName).not.toContain("ryansareen");
  });

  it("reverts to a guest identity on sign-out", () => {
    useAuthStore.setState({
      user: { uid: "uid-9", email: "kid@example.com", idToken: "", refreshToken: "" },
    });
    expect(useIdentityStore.getState().playerId).toBe("uid-9");

    useAuthStore.setState({ user: null });
    expect(useIdentityStore.getState().playerId).not.toBe("uid-9");
  });
});
