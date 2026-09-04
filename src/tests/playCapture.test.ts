import { afterEach, describe, expect, it, vi } from "vitest";
import { enterPlayCapture } from "@ui/playCapture";
import { useSettingsStore } from "@store/useSettingsStore";

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

  it("is a no-op for a null canvas", () => {
    vi.stubGlobal("document", { fullscreenEnabled: true, fullscreenElement: null });
    expect(() => enterPlayCapture(null)).not.toThrow();
  });
});
