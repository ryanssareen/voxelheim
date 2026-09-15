import { afterEach, describe, expect, it, vi } from "vitest";
import { enterPlayCapture } from "@ui/playCapture";
import { useSettingsStore } from "@store/useSettingsStore";
import { useGameStore } from "@store/useGameStore";

function fakeCanvas(overrides: { parentElement?: unknown } = {}) {
  return {
    requestPointerLock: vi.fn(),
    parentElement:
      "parentElement" in overrides
        ? overrides.parentElement
        : { requestFullscreen: vi.fn(() => Promise.resolve()) },
  } as unknown as HTMLCanvasElement;
}

describe("enterPlayCapture", () => {
  afterEach(() => {
    useSettingsStore.setState({ fullscreenOnPlay: true });
    useGameStore.setState({ inputSource: "keyboardMouse" });
    vi.unstubAllGlobals();
  });

  it("locks the pointer before requesting fullscreen on the parent, not the canvas", () => {
    vi.stubGlobal("document", { fullscreenEnabled: true, fullscreenElement: null });
    const canvas = fakeCanvas();

    enterPlayCapture(canvas);

    expect(canvas.requestPointerLock).toHaveBeenCalledTimes(1);
    const parentFullscreen = (canvas.parentElement as unknown as { requestFullscreen: ReturnType<typeof vi.fn> })
      .requestFullscreen;
    expect(parentFullscreen).toHaveBeenCalledTimes(1);

    const lockOrder = (canvas.requestPointerLock as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0];
    const fullscreenOrder = parentFullscreen.mock.invocationCallOrder[0];
    expect(lockOrder).toBeLessThan(fullscreenOrder);
  });

  it("requests pointer lock but skips fullscreen when the setting is off", () => {
    vi.stubGlobal("document", { fullscreenEnabled: true, fullscreenElement: null });
    useSettingsStore.setState({ fullscreenOnPlay: false });
    const canvas = fakeCanvas();

    enterPlayCapture(canvas);

    expect(canvas.requestPointerLock).toHaveBeenCalledTimes(1);
    const parentFullscreen = (canvas.parentElement as unknown as { requestFullscreen: ReturnType<typeof vi.fn> })
      .requestFullscreen;
    expect(parentFullscreen).not.toHaveBeenCalled();
  });

  it("does not request fullscreen when one is already active", () => {
    vi.stubGlobal("document", { fullscreenEnabled: true, fullscreenElement: {} });
    const canvas = fakeCanvas();

    expect(() => enterPlayCapture(canvas)).not.toThrow();
    const parentFullscreen = (canvas.parentElement as unknown as { requestFullscreen: ReturnType<typeof vi.fn> })
      .requestFullscreen;
    expect(parentFullscreen).not.toHaveBeenCalled();
  });

  it("does not request fullscreen when the browser disallows it", () => {
    vi.stubGlobal("document", { fullscreenEnabled: false, fullscreenElement: null });
    const canvas = fakeCanvas();

    expect(() => enterPlayCapture(canvas)).not.toThrow();
    const parentFullscreen = (canvas.parentElement as unknown as { requestFullscreen: ReturnType<typeof vi.fn> })
      .requestFullscreen;
    expect(parentFullscreen).not.toHaveBeenCalled();
  });

  it("no-ops fullscreen when the parent has no requestFullscreen", () => {
    vi.stubGlobal("document", { fullscreenEnabled: true, fullscreenElement: null });
    const canvas = fakeCanvas({ parentElement: {} });

    expect(() => enterPlayCapture(canvas)).not.toThrow();
  });

  it("no-ops fullscreen when the canvas has no parent", () => {
    vi.stubGlobal("document", { fullscreenEnabled: true, fullscreenElement: null });
    const canvas = fakeCanvas({ parentElement: null });

    expect(() => enterPlayCapture(canvas)).not.toThrow();
    expect(canvas.requestPointerLock).toHaveBeenCalledTimes(1);
  });

  it("swallows a fullscreen rejection without an unhandled rejection", async () => {
    vi.stubGlobal("document", { fullscreenEnabled: true, fullscreenElement: null });
    const canvas = fakeCanvas({
      parentElement: { requestFullscreen: vi.fn(() => Promise.reject(new Error("denied"))) },
    });

    expect(() => enterPlayCapture(canvas)).not.toThrow();
    // Let the rejected promise's .catch() run before the test finishes.
    await Promise.resolve();
    await Promise.resolve();
  });

  it("skips the pointer lock in touch mode but still goes fullscreen", () => {
    // The half of this that is worth the most is on the device that cannot ask
    // for it with a mouse. A finger has nothing to capture, so the lock is
    // skipped — but a full-bleed canvas matters more on a phone than anywhere
    // else, so fullscreen still applies. `GameCanvas` reaches this from the
    // canvas's `onTouchEnd`, because suppressing the compatibility mouse burst
    // suppresses the synthesized `click` that the mouse path rides.
    vi.stubGlobal("document", { fullscreenEnabled: true, fullscreenElement: null });
    useGameStore.setState({ inputSource: "touch" });
    const canvas = fakeCanvas();

    enterPlayCapture(canvas);

    expect(canvas.requestPointerLock).not.toHaveBeenCalled();
    const parentFullscreen = (canvas.parentElement as unknown as { requestFullscreen: ReturnType<typeof vi.fn> })
      .requestFullscreen;
    expect(parentFullscreen).toHaveBeenCalledTimes(1);
  });

  it("is a no-op for a null canvas", () => {
    vi.stubGlobal("document", { fullscreenEnabled: true, fullscreenElement: null });
    expect(() => enterPlayCapture(null)).not.toThrow();
  });
});
