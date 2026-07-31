import { describe, it, expect, afterEach } from "vitest";
import {
  readLocal,
  readLocalJson,
  readSessionJson,
  removeLocal,
  writeLocal,
  writeLocalJson,
  writeSessionJson,
} from "@lib/storage";
import {
  installWindow,
  readOnlyStorage,
  removeWindow,
  throwingStorage,
} from "./helpers";

afterEach(removeWindow);

describe("with working storage", () => {
  it("round-trips a string", () => {
    installWindow();
    expect(writeLocal("k", "v")).toBe(true);
    expect(readLocal("k")).toBe("v");
  });

  it("round-trips JSON", () => {
    installWindow();
    writeLocalJson("k", { a: 1, b: "two" });
    expect(readLocalJson("k", null)).toEqual({ a: 1, b: "two" });
  });

  it("removes a key", () => {
    installWindow();
    writeLocal("k", "v");
    removeLocal("k");
    expect(readLocal("k")).toBeNull();
  });

  it("keeps local and session separate", () => {
    installWindow();
    writeLocalJson("k", "local");
    writeSessionJson("k", "session");
    expect(readLocalJson("k", null)).toBe("local");
    expect(readSessionJson("k", null)).toBe("session");
  });

  it("returns the fallback for a missing key", () => {
    installWindow();
    expect(readLocalJson("nope", { fallback: true })).toEqual({ fallback: true });
  });

  it("returns the fallback for malformed JSON", () => {
    installWindow();
    writeLocal("k", "{not json");
    expect(readLocalJson("k", "fallback")).toBe("fallback");
  });
});

describe("without a window (SSR)", () => {
  it("reads fall back and writes report failure instead of throwing", () => {
    removeWindow();
    expect(readLocal("k")).toBeNull();
    expect(readLocalJson("k", "fallback")).toBe("fallback");
    expect(writeLocal("k", "v")).toBe(false);
    expect(() => removeLocal("k")).not.toThrow();
  });
});

describe("when storage access throws", () => {
  // Blocked site data and sandboxed iframes throw on mere property access.
  it("degrades instead of propagating", () => {
    installWindow({ localStorage: throwingStorage() });
    expect(readLocal("k")).toBeNull();
    expect(readLocalJson("k", "fallback")).toBe("fallback");
    expect(writeLocal("k", "v")).toBe(false);
    expect(() => removeLocal("k")).not.toThrow();
  });
});

describe("when writes are rejected", () => {
  it("reports failure but keeps reads working", () => {
    installWindow({ localStorage: readOnlyStorage(new Map([["k", "existing"]])) });
    expect(writeLocal("k", "new")).toBe(false);
    expect(readLocal("k")).toBe("existing");
  });

  it("reports failure for unserializable values", () => {
    installWindow();
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(writeLocalJson("k", cyclic)).toBe(false);
  });
});
