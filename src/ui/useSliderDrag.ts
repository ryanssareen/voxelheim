"use client";

import { useRef } from "react";

/**
 * Drag handling for the settings sliders, on pointer events (R30, R31).
 *
 * The sliders used to drive on `onMouseDown` plus `window` `mousemove` /
 * `mouseup` listeners. A finger emits none of those, so render distance and
 * simulation distance — which the options modal is the only surface exposing —
 * were unreachable on a touch device, and R29's device defaults depend on
 * reaching them. Pointer events carry mouse, touch and pen through one path, so
 * this replaces both halves rather than adding a touch branch beside them.
 *
 * Two things the `window`-listener version got for free and have to be earned
 * back:
 *
 *  - **A drag that leaves the track keeps tracking.** `setPointerCapture`
 *    retargets every later move and the release to the element, which is what
 *    `window` listeners were there for. It also ends the drag deterministically
 *    instead of relying on a `mouseup` that a touch never sends.
 *  - **The browser must not claim the gesture.** The track needs
 *    `touch-action: none`; without it a horizontal drag is a candidate for
 *    pan-scroll and the browser cancels the pointer mid-slide.
 *
 * The geometry and the drag state machine are kept free of React and of the DOM
 * so they can be exercised in the node test environment (`vitest.config.ts` uses
 * `environment: "node"`), the same reason the input sources are shaped this way.
 */

/** The part of a `DOMRect` a horizontal track actually reads. */
export interface TrackRect {
  left: number;
  width: number;
}

/**
 * Value under a client x on the track: clamped to the ends, snapped to whole
 * steps.
 *
 * A track that has not been laid out yet has zero width, which would otherwise
 * divide to `NaN` and write a `NaN` straight into the settings store.
 */
export function sliderValueAt(
  clientX: number,
  rect: TrackRect,
  min: number,
  max: number,
): number {
  if (!(rect.width > 0)) return min;
  const t = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  return Math.round(min + t * (max - min));
}

/** The element methods a captured drag needs. A real `HTMLElement` satisfies it. */
export interface SliderPointerTarget {
  getBoundingClientRect(): TrackRect;
  setPointerCapture(pointerId: number): void;
  releasePointerCapture(pointerId: number): void;
}

/** The fields of a pointer event this reads. `React.PointerEvent` satisfies it. */
export interface SliderPointerEvent {
  clientX: number;
  pointerId: number;
  currentTarget: SliderPointerTarget;
}

/**
 * Range and sink, read at event time rather than captured, so the hook below can
 * keep one handler object alive across renders while `min`, `max` and `onChange`
 * stay current.
 */
export interface SliderRange {
  min: number;
  max: number;
  onChange: (value: number) => void;
}

export interface SliderDragHandlers {
  onPointerDown(e: SliderPointerEvent): void;
  onPointerMove(e: SliderPointerEvent): void;
  onPointerUp(e: SliderPointerEvent): void;
  onPointerCancel(e: SliderPointerEvent): void;
}

/**
 * One slider's drag, as a plain handler set.
 *
 * Exactly one pointer owns the track at a time: a second finger landing on it
 * mid-drag is ignored rather than fighting the first for the value, which is the
 * one multi-touch case a thumb on a phone actually produces.
 */
export function createSliderDrag(range: SliderRange): SliderDragHandlers {
  let activePointer: number | null = null;

  const apply = (e: SliderPointerEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    range.onChange(sliderValueAt(e.clientX, rect, range.min, range.max));
  };

  const release = (e: SliderPointerEvent) => {
    if (activePointer !== e.pointerId) return;
    activePointer = null;
    // Capture is an enhancement — it only decides whether moves past the track's
    // edge still arrive — so neither taking it nor giving it back may cost the
    // drag. Both throw on a pointer the browser no longer considers active.
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released with the pointer itself */
    }
  };

  return {
    onPointerDown(e) {
      if (activePointer !== null) return;
      activePointer = e.pointerId;
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* no capture: the drag still works, just not past the track's edge */
      }
      // Press alone sets the value, as the mouse path always did.
      apply(e);
    },
    onPointerMove(e) {
      if (activePointer !== e.pointerId) return;
      apply(e);
    },
    onPointerUp: release,
    // The browser took the gesture (a system edge swipe, a stylus lift). Ending
    // the drag here is what stops the track staying armed for a pointer that
    // will never send another event.
    onPointerCancel: release,
  };
}

/**
 * Live handlers for one slider.
 *
 * The handler object is created once and kept: re-creating it per render would
 * reset `activePointer` mid-drag. The range it reads is a mutable ref updated
 * every render instead, so a slider whose bounds or sink change still drags.
 */
export function useSliderDrag(
  min: number,
  max: number,
  onChange: (value: number) => void,
): SliderDragHandlers {
  const range = useRef<SliderRange>({ min, max, onChange });
  range.current.min = min;
  range.current.max = max;
  range.current.onChange = onChange;

  const handlers = useRef<SliderDragHandlers | null>(null);
  handlers.current ??= createSliderDrag(range.current);
  return handlers.current;
}
