import { afterEach, describe, expect, it, vi } from "vitest";
import { installE2ETestHook, type E2EState } from "@engine/testHook";
import type { Engine } from "@engine/Engine";

const SAMPLE_STATE: E2EState = {
  position: { x: 1, y: 2, z: 3 },
  yaw: 0.5,
  pitch: -0.1,
  isPaused: false,
  heldItem: { blockId: 4, count: 1 },
  hotbar: Array(9).fill(null),
  inventory: Array(27).fill(null),
  targetedBlock: null,
};

function fakeEngine(state: E2EState = SAMPLE_STATE): Engine {
  return { getE2EState: () => state, setE2ELook: () => {} } as unknown as Engine;
}

describe("installE2ETestHook", () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    vi.stubEnv("NODE_ENV", originalEnv ?? "test");
    vi.unstubAllGlobals();
  });

  it("exposes window.__test.getState() reflecting the engine's current state outside production", () => {
    vi.stubEnv("NODE_ENV", "development");
    const win: { __test?: { getState: () => E2EState } } = {};
    vi.stubGlobal("window", win);

    installE2ETestHook(fakeEngine());

    expect(win.__test?.getState()).toEqual(SAMPLE_STATE);
  });

  it("does not attach the hook when NODE_ENV is production", () => {
    vi.stubEnv("NODE_ENV", "production");
    const win: { __test?: { getState: () => E2EState } } = {};
    vi.stubGlobal("window", win);

    installE2ETestHook(fakeEngine());

    expect(win.__test).toBeUndefined();
  });

  it("forwards setLook to the engine's setE2ELook", () => {
    vi.stubEnv("NODE_ENV", "development");
    const win: { __test?: { getState: () => E2EState; setLook: (yaw: number, pitch: number) => void } } = {};
    vi.stubGlobal("window", win);
    const setE2ELook = vi.fn();
    const engine = { getE2EState: () => SAMPLE_STATE, setE2ELook } as unknown as Engine;

    installE2ETestHook(engine);
    win.__test?.setLook(1.2, -0.4);

    expect(setE2ELook).toHaveBeenCalledWith(1.2, -0.4);
  });

  it("polls the engine each call rather than snapshotting once", () => {
    vi.stubEnv("NODE_ENV", "development");
    const win: { __test?: { getState: () => E2EState } } = {};
    vi.stubGlobal("window", win);
    let calls = 0;
    const engine = { getE2EState: () => ({ ...SAMPLE_STATE, yaw: calls++ }) } as unknown as Engine;

    installE2ETestHook(engine);

    expect(win.__test?.getState().yaw).toBe(0);
    expect(win.__test?.getState().yaw).toBe(1);
  });
});
