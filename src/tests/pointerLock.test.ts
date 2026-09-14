import { afterEach, describe, expect, it, vi } from "vitest";
import { attemptPointerLock, requestPlayPointerLock } from "@engine/input/pointerLock";
import { useGameStore } from "@store/useGameStore";

/**
 * The reason this module exists is that a denied lock used to surface as an
 * unhandled rejection with no indication of which call site produced it. These
 * pin the swallowing, because a regression there is invisible until it fills
 * someone's console.
 */

function fakeCanvas(lock: unknown): HTMLCanvasElement {
  return { requestPointerLock: lock } as unknown as HTMLCanvasElement;
}

afterEach(() => {
  useGameStore.setState({ inputSource: "keyboardMouse" });
});

describe("attemptPointerLock", () => {
  it("requests the lock on a canvas that supports it", () => {
    const lock = vi.fn();
    attemptPointerLock(fakeCanvas(lock));
    expect(lock).toHaveBeenCalledTimes(1);
  });

  it("swallows a rejected promise without an unhandled rejection", async () => {
    const lock = vi.fn(() => Promise.reject(new Error("not valid for pointer lock")));

    expect(() => attemptPointerLock(fakeCanvas(lock))).not.toThrow();

    // Let the rejection settle inside the module's own .catch().
    await Promise.resolve();
    await Promise.resolve();
    expect(lock).toHaveBeenCalledTimes(1);
  });

  it("swallows a synchronous throw from an older implementation", () => {
    const lock = vi.fn(() => {
      throw new Error("denied");
    });
    expect(() => attemptPointerLock(fakeCanvas(lock))).not.toThrow();
  });

  it("tolerates an implementation returning undefined rather than a promise", () => {
    const lock = vi.fn(() => undefined);
    expect(() => attemptPointerLock(fakeCanvas(lock))).not.toThrow();
    expect(lock).toHaveBeenCalledTimes(1);
  });

  it("no-ops on a null canvas", () => {
    expect(() => attemptPointerLock(null)).not.toThrow();
  });

  it("no-ops when the canvas has no requestPointerLock", () => {
    expect(() => attemptPointerLock(fakeCanvas(undefined))).not.toThrow();
  });
});

describe("requestPlayPointerLock", () => {
  it("requests the lock under keyboard and mouse", () => {
    useGameStore.setState({ inputSource: "keyboardMouse" });
    const lock = vi.fn();

    requestPlayPointerLock(fakeCanvas(lock));

    expect(lock).toHaveBeenCalledTimes(1);
  });

  it("skips the request entirely in touch mode", () => {
    useGameStore.setState({ inputSource: "touch" });
    const lock = vi.fn();

    requestPlayPointerLock(fakeCanvas(lock));

    // A finger has nothing to capture, and a touchscreen laptop granting the
    // lock would trap the player in a capture with no obvious way out.
    expect(lock).not.toHaveBeenCalled();
  });

  it("still swallows a denial when it does request", async () => {
    useGameStore.setState({ inputSource: "keyboardMouse" });
    const lock = vi.fn(() => Promise.reject(new Error("denied")));

    expect(() => requestPlayPointerLock(fakeCanvas(lock))).not.toThrow();

    await Promise.resolve();
    await Promise.resolve();
  });
});
