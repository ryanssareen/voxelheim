import { describe, it, expect, vi } from "vitest";
import { Clock } from "@engine/Clock";

describe("Clock", () => {
  it("returns 0 on the first call", () => {
    const clock = new Clock();
    expect(clock.getDelta()).toBe(0);
  });

  it("returns positive delta on subsequent calls", () => {
    const clock = new Clock();
    clock.getDelta(); // first call
    // Small busy wait to ensure some time passes
    const start = performance.now();
    while (performance.now() - start < 5) {
      /* wait ~5ms */
    }
    const delta = clock.getDelta();
    expect(delta).toBeGreaterThan(0);
  });

  it("caps delta at MAX_DELTA", () => {
    const clock = new Clock();
    clock.getDelta(); // first call

    // Mock performance.now to simulate a large gap
    const originalNow = performance.now;
    let mockTime = originalNow.call(performance);
    vi.spyOn(performance, "now").mockImplementation(() => {
      mockTime += 200; // 200ms jump
      return mockTime;
    });

    const delta = clock.getDelta();
    expect(delta).toBeLessThanOrEqual(Clock.MAX_DELTA);

    vi.restoreAllMocks();
  });
});
