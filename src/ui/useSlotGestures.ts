"use client";

import { useCallback, useEffect, useRef } from "react";
import type { SlotAction } from "@ui/useSlotInteractions";

/**
 * Turns pointer events on a slot into a {@link SlotAction}, so the same three
 * actions reach the store whether a cursor or a thumb produced them.
 *
 * Mouse is immediate: click is primary, shift-click quick-moves, right-click
 * splits. Touch has to disambiguate a tap from the first half of a double-tap,
 * and a long-press from the start of a panel scroll.
 *
 * The hook is called once per screen and returns a factory, because a screen
 * renders dozens of slots in a loop and a hook cannot be called inside one.
 * Per-slot state lives in a map keyed by the caller's slot key.
 */

/** Two taps closer together than this are one double-tap. */
export const DOUBLE_TAP_MS = 260;
/** A contact held longer than this, without moving, is a long-press. */
export const LONG_PRESS_MS = 420;
/**
 * Movement past this cancels a pending long-press and lets the panel scroll.
 *
 * Without it, every attempt to scroll an inventory begins as a stationary
 * finger on a slot and would split whatever it happened to land on — and the
 * panel scrolls precisely when slots are large enough not to all fit.
 */
export const MOVE_CANCEL_PX = 10;

export interface SlotGestureHandlers {
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerCancel: () => void;
  onContextMenu: (e: React.MouseEvent<HTMLDivElement>) => void;
}

interface SlotState {
  x: number;
  y: number;
  longPress: number | null;
  /** A long-press already fired, so the lift must not also act. */
  consumed: boolean;
  tapTimer: number | null;
  lastTapAt: number;
}

function blank(): SlotState {
  return { x: 0, y: 0, longPress: null, consumed: false, tapTimer: null, lastTapAt: 0 };
}

export type SlotGestureFactory = (
  key: string,
  act: (action: SlotAction) => void
) => SlotGestureHandlers;

/**
 * @param cursorEmpty whether the player is holding nothing. Decides whether a
 *                    tap has to wait out the double-tap window.
 */
export function useSlotGestures(cursorEmpty: boolean): SlotGestureFactory {
  const states = useRef(new Map<string, SlotState>());

  useEffect(() => {
    const map = states.current;
    return () => {
      for (const st of map.values()) {
        if (st.longPress !== null) window.clearTimeout(st.longPress);
        if (st.tapTimer !== null) window.clearTimeout(st.tapTimer);
      }
      map.clear();
    };
  }, []);

  return useCallback(
    (key, act) => {
      const get = (): SlotState => {
        let st = states.current.get(key);
        if (!st) {
          st = blank();
          states.current.set(key, st);
        }
        return st;
      };

      return {
        onPointerDown: (e) => {
          const st = get();
          st.x = e.clientX;
          st.y = e.clientY;
          st.consumed = false;
          if (e.pointerType !== "touch") {
            st.longPress = null;
            return;
          }
          st.longPress = window.setTimeout(() => {
            const cur = states.current.get(key);
            if (!cur) return;
            cur.consumed = true;
            cur.longPress = null;
            act("split");
          }, LONG_PRESS_MS);
        },

        onPointerMove: (e) => {
          const st = states.current.get(key);
          if (!st || st.longPress === null) return;
          if (Math.hypot(e.clientX - st.x, e.clientY - st.y) <= MOVE_CANCEL_PX) return;
          // Became a scroll. Drop the long-press, and the tap with it.
          window.clearTimeout(st.longPress);
          st.longPress = null;
          st.consumed = true;
        },

        onPointerUp: (e) => {
          const st = get();
          if (st.longPress !== null) {
            window.clearTimeout(st.longPress);
            st.longPress = null;
          }
          if (st.consumed) {
            st.consumed = false;
            return;
          }

          if (e.pointerType !== "touch") {
            act(e.shiftKey ? "quickMove" : "primary");
            return;
          }

          const now = e.timeStamp;
          if (st.tapTimer !== null && now - st.lastTapAt < DOUBLE_TAP_MS) {
            window.clearTimeout(st.tapTimer);
            st.tapTimer = null;
            st.lastTapAt = now;
            act("quickMove");
            return;
          }
          st.lastTapAt = now;

          // Holding an item, a tap can only mean "put it down" — a double-tap
          // has nothing left to quick-move — so it resolves immediately and
          // placing stays snappy. Only picking up pays the disambiguation wait.
          if (!cursorEmpty) {
            act("primary");
            return;
          }

          st.tapTimer = window.setTimeout(() => {
            const cur = states.current.get(key);
            if (cur) cur.tapTimer = null;
            act("primary");
          }, DOUBLE_TAP_MS);
        },

        onPointerCancel: () => {
          const st = states.current.get(key);
          if (!st) return;
          if (st.longPress !== null) {
            window.clearTimeout(st.longPress);
            st.longPress = null;
          }
          st.consumed = false;
        },

        onContextMenu: (e) => {
          // The desktop half of split. Right-click is free here: the slot grid
          // has never had a context menu, and the button is not otherwise bound
          // while a panel is open.
          e.preventDefault();
          act("split");
        },
      };
    },
    [cursorEmpty]
  );
}

/**
 * Styles a slot needs so the browser's own touch behaviours do not pre-empt the
 * gestures above: double-tap zoom, the long-press callout, and text selection
 * all fire on exactly the interactions this reads.
 */
export const SLOT_TOUCH_STYLE: React.CSSProperties = {
  touchAction: "none",
  WebkitUserSelect: "none",
  userSelect: "none",
  WebkitTouchCallout: "none",
} as React.CSSProperties;
