"use client";

import { useEffect } from "react";
import { installTouchArming } from "@engine/input/touchArming";

/**
 * Starts watching for the first touch of the session, from the first page the
 * player loads.
 *
 * It sits in the root layout rather than inside the game because the screens
 * that need the answer come *before* the game: the title screen, and the
 * controls popup that opens the moment a world loads. `TouchSource` arms from
 * contacts on the play canvas, which by then has not been touched — so a phone
 * player's first screen listed `W A S D`, `Left click` and `F3`.
 *
 * Renders nothing, consumes nothing. The listener is passive and only records
 * that a finger exists; every contact that *means* something still goes through
 * the touch source.
 */
export function TouchArmer() {
  useEffect(installTouchArming, []);
  return null;
}
