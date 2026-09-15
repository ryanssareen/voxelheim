import type { InputSource } from "@engine/input/intents";

/**
 * What render and simulation distance a device should start at (R29).
 *
 * **The numbers below are unmeasured.** The plan's own execution note for U13
 * says to measure on a real mid-range device before choosing them, and that
 * measurement has not happened — nobody has run this game on a phone. What is
 * built here is the mechanism: a device default that a player's own choice
 * overrides and outlives. The constants are a conservative placeholder for the
 * measurement session to replace, and they are in one place precisely so that
 * replacing them is a two-line change rather than an investigation.
 *
 * There is a second, larger assumption underneath, inherited from the origin
 * document's first blocking question: that *distance* is the binding
 * constraint. It may not be. If a phone is limited by meshing throughput or by
 * garbage collection pauses rather than by how much is on screen, then lowering
 * the distance will cost draw distance and buy nothing, and R29 is aimed at the
 * wrong lever. `docs/solutions/` has no prior art on meshing budgets to settle
 * it from. The measurement session should check which of the two it is before
 * trusting these values at all — and record the answer, because it is the kind
 * of thing that is expensive to learn twice.
 */

export interface DistanceProfile {
  /** Chunks rendered around the player. */
  renderDistance: number;
  /** Chunks in which mobs and other simulation stay live. */
  simulationDistance: number;
}

/**
 * Desktop, unchanged. These are the values the game has always shipped, and
 * nothing in this work is allowed to move them — desktop parity is the
 * criterion the whole touch effort is verified against.
 */
export const DESKTOP_PROFILE: DistanceProfile = {
  renderDistance: 8,
  simulationDistance: 6,
};

/**
 * Touch, provisional.
 *
 * Chosen to be clearly conservative rather than precisely right: a phone that
 * runs smoothly at a short draw distance is a playable game, and a phone that
 * stutters at a long one is not. Five and four are roughly two thirds of the
 * desktop values, which is a guess at the shape of the gap and not a
 * measurement of it.
 */
export const TOUCH_PROFILE: DistanceProfile = {
  renderDistance: 5,
  simulationDistance: 4,
};

/** The profile a given input source starts at. */
export function deviceProfileFor(source: InputSource): DistanceProfile {
  return source === "touch" ? TOUCH_PROFILE : DESKTOP_PROFILE;
}

/** Distance settings a player can pin, overriding the device default. */
export type OverridableDistance = keyof DistanceProfile;

export const OVERRIDABLE_DISTANCES: readonly OverridableDistance[] = [
  "renderDistance",
  "simulationDistance",
];

/**
 * Resolves one distance setting for a device.
 *
 * The override flag is the whole point of this function existing, and it is
 * what the settings store could not express before. `saved ?? default` cannot
 * tell "the player has never touched this" from "the player chose exactly the
 * old default" — and since the store persists every field on any change, moving
 * the music slider was enough to make a render distance look deliberate.
 * A device profile applied on top of that would either never apply or would
 * silently discard a choice the player did make.
 *
 * So the override is recorded separately, and a value is only ever replaced by
 * a device default when the player has not pinned it.
 */
export function resolveDistance(
  setting: OverridableDistance,
  source: InputSource,
  saved: number | undefined,
  overridden: boolean,
): number {
  if (overridden && typeof saved === "number" && Number.isFinite(saved)) return saved;
  return deviceProfileFor(source)[setting];
}
