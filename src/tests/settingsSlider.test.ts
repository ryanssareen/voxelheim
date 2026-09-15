import { describe, it, expect, vi, afterEach } from "vitest";
import {
  createSliderDrag,
  sliderValueAt,
  type SliderPointerEvent,
  type SliderPointerTarget,
  type TrackRect,
} from "@ui/useSliderDrag";

/**
 * Settings sliders on touch (U11 — R30, R31).
 *
 * The sliders were the one pre-game control a finger could not work: they drove
 * on `onMouseDown` plus `window` `mousemove` / `mouseup`, none of which a touch
 * emits, and the options modal is the only surface exposing render distance and
 * simulation distance. So the tests here are about two things — that a drag is
 * resolved from pointer events with no `window` listener behind it, and that
 * every value in those two ranges is actually reachable on a phone-width track.
 *
 * `vitest.config.ts` runs `environment: "node"`, so the element and the events
 * are hand-stubbed in the style of `src/tests/InputManager.test.ts`. That is not
 * a workaround: the geometry and the drag state machine are deliberately free of
 * React and of the DOM, which is what makes them checkable at all.
 */

/** A laid-out track. Left is non-zero so a bare `clientX` cannot pass by luck. */
const TRACK: TrackRect = { left: 100, width: 300 };

interface StubTrack {
  target: SliderPointerTarget;
  captured: number[];
  released: number[];
}

/**
 * A track element with the capture bookkeeping a browser does.
 *
 * `releasePointerCapture` throwing for a pointer that was never captured is
 * real behaviour (`InvalidPointerId`), and the drag has to survive it.
 */
function makeTrack(rect: TrackRect = TRACK, allowCapture = true): StubTrack {
  const captured: number[] = [];
  const released: number[] = [];
  return {
    captured,
    released,
    target: {
      getBoundingClientRect: () => rect,
      setPointerCapture: (id: number) => {
        if (!allowCapture) throw new Error("NotFoundError");
        captured.push(id);
      },
      releasePointerCapture: (id: number) => {
        if (!captured.includes(id)) throw new Error("InvalidPointerId");
        released.push(id);
      },
    },
  };
}

interface StubPointerEvent extends SliderPointerEvent {
  pointerType: "mouse" | "touch";
}

function pointerAt(
  track: StubTrack,
  clientX: number,
  pointerId = 1,
  pointerType: "mouse" | "touch" = "touch",
): StubPointerEvent {
  return { clientX, pointerId, pointerType, currentTarget: track.target };
}

/** Runs one press-drag-release and returns every value the slider reported. */
function dragThrough(
  xs: number[],
  opts: { min?: number; max?: number; rect?: TrackRect; pointerType?: "mouse" | "touch" } = {},
): number[] {
  const { min = 0, max = 100, rect = TRACK, pointerType = "touch" } = opts;
  const track = makeTrack(rect);
  const values: number[] = [];
  const drag = createSliderDrag({ min, max, onChange: (v) => values.push(v) });

  const [first, ...rest] = xs;
  drag.onPointerDown(pointerAt(track, first, 1, pointerType));
  for (const x of rest) drag.onPointerMove(pointerAt(track, x, 1, pointerType));
  drag.onPointerUp(pointerAt(track, xs[xs.length - 1], 1, pointerType));
  return values;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

describe("sliderValueAt", () => {
  it("maps the track ends to the range ends and the middle to the middle", () => {
    expect(sliderValueAt(100, TRACK, 2, 16)).toBe(2);
    expect(sliderValueAt(400, TRACK, 2, 16)).toBe(16);
    expect(sliderValueAt(250, TRACK, 2, 16)).toBe(9);
  });

  it("clamps a pointer dragged past either end of the track", () => {
    expect(sliderValueAt(-5000, TRACK, 2, 16)).toBe(2);
    expect(sliderValueAt(5000, TRACK, 2, 16)).toBe(16);
  });

  it("snaps to whole steps", () => {
    for (let x = TRACK.left; x <= TRACK.left + TRACK.width; x += 1) {
      const v = sliderValueAt(x, TRACK, 2, 16);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(2);
      expect(v).toBeLessThanOrEqual(16);
    }
  });

  it("yields the minimum, not NaN, for a track that has not been laid out", () => {
    expect(sliderValueAt(140, { left: 0, width: 0 }, 2, 16)).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Drag
// ---------------------------------------------------------------------------

describe("slider drag", () => {
  it("resolves a touch drag with no mouse event and no window listener", () => {
    // The defect this unit exists for: the old slider only moved because it
    // attached `window` mousemove/mouseup, which a finger never fires. If the
    // module ever reaches for a global again, this fails.
    const addEventListener = vi.fn();
    vi.stubGlobal("window", { addEventListener, removeEventListener: vi.fn() });
    vi.stubGlobal("document", { addEventListener, removeEventListener: vi.fn() });

    const values = dragThrough([100, 175, 250, 400], { min: 2, max: 16 });

    expect(values).toEqual([2, 6, 9, 16]);
    expect(addEventListener).not.toHaveBeenCalled();
  });

  it("gives a mouse drag the identical values", () => {
    const xs = [130, 200, 275, 390];
    expect(dragThrough(xs, { min: 2, max: 16, pointerType: "mouse" })).toEqual(
      dragThrough(xs, { min: 2, max: 16, pointerType: "touch" }),
    );
  });

  it("sets the value on press alone, before any movement", () => {
    const track = makeTrack();
    const values: number[] = [];
    const drag = createSliderDrag({ min: 0, max: 100, onChange: (v) => values.push(v) });

    drag.onPointerDown(pointerAt(track, 250));

    expect(values).toEqual([50]);
  });

  it("keeps tracking a drag that leaves the track, and clamps it", () => {
    // What pointer capture buys: moves past the element still arrive.
    const values = dragThrough([250, -400, 1200, 250], { min: 0, max: 100 });
    expect(values).toEqual([50, 0, 100, 50]);
  });

  it("captures the pointer on press and releases it on lift", () => {
    const track = makeTrack();
    const drag = createSliderDrag({ min: 0, max: 100, onChange: () => {} });

    drag.onPointerDown(pointerAt(track, 250, 7));
    expect(track.captured).toEqual([7]);
    expect(track.released).toEqual([]);

    drag.onPointerUp(pointerAt(track, 250, 7));
    expect(track.released).toEqual([7]);
  });

  it("ignores movement after the finger lifts", () => {
    const track = makeTrack();
    const values: number[] = [];
    const drag = createSliderDrag({ min: 0, max: 100, onChange: (v) => values.push(v) });

    drag.onPointerDown(pointerAt(track, 250));
    drag.onPointerUp(pointerAt(track, 250));
    drag.onPointerMove(pointerAt(track, 400));

    expect(values).toEqual([50]);
  });

  it("starts a fresh drag after a clean release", () => {
    const track = makeTrack();
    const values: number[] = [];
    const drag = createSliderDrag({ min: 0, max: 100, onChange: (v) => values.push(v) });

    drag.onPointerDown(pointerAt(track, 250));
    drag.onPointerUp(pointerAt(track, 250));
    drag.onPointerDown(pointerAt(track, 400, 2));
    drag.onPointerMove(pointerAt(track, 100, 2));

    expect(values).toEqual([50, 100, 0]);
  });

  it("ignores a second finger landing on the track mid-drag", () => {
    const track = makeTrack();
    const values: number[] = [];
    const drag = createSliderDrag({ min: 0, max: 100, onChange: (v) => values.push(v) });

    drag.onPointerDown(pointerAt(track, 250, 1));
    drag.onPointerDown(pointerAt(track, 400, 2));
    drag.onPointerMove(pointerAt(track, 400, 2));
    drag.onPointerMove(pointerAt(track, 175, 1));

    expect(values).toEqual([50, 25]);
  });

  it("ends the drag when the browser cancels the pointer", () => {
    const track = makeTrack();
    const values: number[] = [];
    const drag = createSliderDrag({ min: 0, max: 100, onChange: (v) => values.push(v) });

    drag.onPointerDown(pointerAt(track, 250));
    drag.onPointerCancel(pointerAt(track, 250));
    drag.onPointerMove(pointerAt(track, 400));

    expect(values).toEqual([50]);
    expect(track.released).toEqual([1]);
  });

  it("still drags when the browser refuses pointer capture", () => {
    // Capture only decides whether moves past the edge arrive; losing it must
    // not cost the drag itself, and neither call may throw out of a handler.
    const track = makeTrack(TRACK, false);
    const values: number[] = [];
    const drag = createSliderDrag({ min: 0, max: 100, onChange: (v) => values.push(v) });

    expect(() => {
      drag.onPointerDown(pointerAt(track, 100));
      drag.onPointerMove(pointerAt(track, 250));
      drag.onPointerUp(pointerAt(track, 250));
    }).not.toThrow();
    expect(values).toEqual([0, 50]);
  });
});

// ---------------------------------------------------------------------------
// R31: the two distance settings, on a phone
// ---------------------------------------------------------------------------

describe("render and simulation distance on a touch viewport", () => {
  /** Track inside the options modal on a 375px-wide device: 375 minus px-4. */
  const PHONE_TRACK: TrackRect = { left: 16, width: 343 };

  /** As wired in the options modal. */
  const RANGES: Array<[string, number, number]> = [
    ["render distance", 2, 16],
    ["simulation distance", 2, 8],
    ["fov", 60, 110],
    ["music volume", 0, 100],
  ];

  it("reaches every whole value by sliding across the track", () => {
    for (const [name, min, max] of RANGES) {
      const seen = new Set<number>();
      for (let x = PHONE_TRACK.left; x <= PHONE_TRACK.left + PHONE_TRACK.width; x += 1) {
        seen.add(sliderValueAt(x, PHONE_TRACK, min, max));
      }
      for (let v = min; v <= max; v += 1) {
        expect(seen.has(v), `${name}: ${v} unreachable on a phone-width track`).toBe(true);
      }
    }
  });

  it("never moves backwards as the finger moves forwards", () => {
    for (const [name, min, max] of RANGES) {
      let previous = min;
      for (let x = PHONE_TRACK.left; x <= PHONE_TRACK.left + PHONE_TRACK.width; x += 1) {
        const v = sliderValueAt(x, PHONE_TRACK, min, max);
        expect(v, `${name} at x=${x}`).toBeGreaterThanOrEqual(previous);
        previous = v;
      }
      expect(previous, name).toBe(max);
    }
  });

  it("settles on the exact value the finger lifted over", () => {
    // A drag across the whole track, then back to a specific step: the last
    // value reported is what the store keeps.
    const values = dragThrough([16, 359, 200], { min: 2, max: 16, rect: PHONE_TRACK });
    expect(values[0]).toBe(2);
    expect(values[1]).toBe(16);
    expect(values[values.length - 1]).toBe(sliderValueAt(200, PHONE_TRACK, 2, 16));
  });
});
