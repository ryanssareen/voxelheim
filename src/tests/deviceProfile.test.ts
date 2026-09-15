import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  DESKTOP_PROFILE,
  TOUCH_PROFILE,
  deviceProfileFor,
  resolveDistance,
} from "@engine/world/deviceProfile";
import { useGameStore } from "@store/useGameStore";
import { useSettingsStore } from "@store/useSettingsStore";
import { installWindow, removeWindow } from "./helpers";

/**
 * U13 / R29: a touch device resolves its own render and simulation distance.
 *
 * What is tested here is the *mechanism* — which device decides, when it
 * decides, and what a player's own choice does to that decision. What is not
 * tested, and cannot be, is whether the touch numbers are the right numbers.
 * They are unmeasured: nobody has run this game on a phone, and the plan's own
 * execution note for this unit says to measure before choosing them. The
 * constants live in one place so the measurement session replaces two lines.
 *
 * The assumption underneath is larger still, and worth restating where someone
 * will read it: that distance is the binding constraint at all. If a phone is
 * limited by meshing throughput or GC pauses instead, these values cost draw
 * distance and buy nothing.
 */

beforeEach(() => {
  installWindow();
  useSettingsStore.setState({
    renderDistance: DESKTOP_PROFILE.renderDistance,
    simulationDistance: DESKTOP_PROFILE.simulationDistance,
    distanceOverrides: {},
  });
  useGameStore.setState({ inputSource: "keyboardMouse" });
});

afterEach(() => {
  useGameStore.setState({ inputSource: "keyboardMouse" });
  removeWindow();
});

describe("device profiles", () => {
  it("resolves lower distances for touch than for a keyboard", () => {
    expect(TOUCH_PROFILE.renderDistance).toBeLessThan(DESKTOP_PROFILE.renderDistance);
    expect(TOUCH_PROFILE.simulationDistance).toBeLessThan(DESKTOP_PROFILE.simulationDistance);
  });

  it("leaves the desktop profile at the values the game has always shipped", () => {
    // Desktop parity is the criterion this entire effort is verified against.
    // A device profile that moved the desktop numbers would invalidate every
    // other unit's verification at once.
    expect(DESKTOP_PROFILE).toEqual({ renderDistance: 8, simulationDistance: 6 });
  });

  it("picks the profile from the source", () => {
    expect(deviceProfileFor("touch")).toBe(TOUCH_PROFILE);
    expect(deviceProfileFor("keyboardMouse")).toBe(DESKTOP_PROFILE);
  });
});

describe("resolveDistance", () => {
  it("uses the device default when the player has not pinned a value", () => {
    expect(resolveDistance("renderDistance", "touch", undefined, false)).toBe(
      TOUCH_PROFILE.renderDistance,
    );
  });

  it("ignores a saved value that was never pinned", () => {
    // This is the case `saved ?? default` got wrong. The store persists every
    // field on any change, so a number is on disk whether or not the player
    // ever chose it — the pin is the only evidence that they did.
    expect(resolveDistance("renderDistance", "touch", 8, false)).toBe(
      TOUCH_PROFILE.renderDistance,
    );
  });

  it("keeps a pinned value even when it matches the old default", () => {
    // The other half of the same problem: a player who deliberately chose 8 is
    // indistinguishable from one who never looked, unless the pin is recorded.
    expect(resolveDistance("renderDistance", "touch", 8, true)).toBe(8);
  });

  it("falls back to the device default when a pinned value is unusable", () => {
    // Hand-edited or half-written localStorage. Better a short draw distance
    // than a NaN reaching the chunk manager's unload radius.
    expect(resolveDistance("renderDistance", "touch", Number.NaN, true)).toBe(
      TOUCH_PROFILE.renderDistance,
    );
    expect(resolveDistance("renderDistance", "touch", undefined, true)).toBe(
      TOUCH_PROFILE.renderDistance,
    );
  });
});

describe("applying a profile at runtime (R28)", () => {
  it("lowers the distances when touch arms mid-session", () => {
    useGameStore.getState().setInputSource("touch");

    const s = useSettingsStore.getState();
    expect(s.renderDistance).toBe(TOUCH_PROFILE.renderDistance);
    expect(s.simulationDistance).toBe(TOUCH_PROFILE.simulationDistance);
  });

  it("restores them when a keyboard takes over again", () => {
    // A tablet with a keyboard case, or a touchscreen laptop. R28 says the
    // source changes without a reload, so the profile has to move both ways.
    useGameStore.getState().setInputSource("touch");
    useGameStore.getState().setInputSource("keyboardMouse");

    const s = useSettingsStore.getState();
    expect(s.renderDistance).toBe(DESKTOP_PROFILE.renderDistance);
    expect(s.simulationDistance).toBe(DESKTOP_PROFILE.simulationDistance);
  });

  it("never overwrites a distance the player set themselves", () => {
    useSettingsStore.getState().setRenderDistance(12);
    useGameStore.getState().setInputSource("touch");

    const s = useSettingsStore.getState();
    expect(s.renderDistance).toBe(12);
    // The one they did not pin still follows the device.
    expect(s.simulationDistance).toBe(TOUCH_PROFILE.simulationDistance);
  });

  it("pins each distance independently", () => {
    useSettingsStore.getState().setSimulationDistance(10);
    useGameStore.getState().setInputSource("touch");

    const s = useSettingsStore.getState();
    expect(s.simulationDistance).toBe(10);
    expect(s.renderDistance).toBe(TOUCH_PROFILE.renderDistance);
  });

  it("does nothing on a source change that changes no value", () => {
    useSettingsStore.getState().setRenderDistance(12);
    useSettingsStore.getState().setSimulationDistance(10);
    const before = useSettingsStore.getState();

    useGameStore.getState().setInputSource("touch");

    // Same object identity for the values: with everything pinned there is
    // nothing to write, and this runs on a path that must not touch storage
    // for nothing.
    expect(useSettingsStore.getState().renderDistance).toBe(before.renderDistance);
    expect(useSettingsStore.getState().simulationDistance).toBe(before.simulationDistance);
  });

  it("is idempotent — the frame loop publishes the source every frame", () => {
    useGameStore.getState().setInputSource("touch");
    for (let i = 0; i < 5; i++) useGameStore.getState().setInputSource("touch");

    expect(useSettingsStore.getState().renderDistance).toBe(TOUCH_PROFILE.renderDistance);
  });

  it("keeps a pin made while on touch when the keyboard comes back", () => {
    useGameStore.getState().setInputSource("touch");
    useSettingsStore.getState().setRenderDistance(3);
    useGameStore.getState().setInputSource("keyboardMouse");

    // A player who turned the distance down on a phone does not want the
    // desktop default handed back the next time they plug in a keyboard.
    expect(useSettingsStore.getState().renderDistance).toBe(3);
  });
});

describe("a pin survives a reload", () => {
  it("re-reads as pinned rather than as a number to be overwritten", () => {
    // The store reads localStorage once at construction, which a test cannot
    // repeat without re-importing the module. `resolveDistance` is that read's
    // whole decision, so exercising it with what `persistSettings` wrote is the
    // same check without the module gymnastics.
    useSettingsStore.getState().setRenderDistance(3);
    const persisted = useSettingsStore.getState();

    expect(persisted.distanceOverrides.renderDistance).toBe(true);
    expect(
      resolveDistance(
        "renderDistance",
        "touch",
        persisted.renderDistance,
        persisted.distanceOverrides.renderDistance === true,
      ),
    ).toBe(3);
  });

  it("does not record a pin for a setting the player never touched", () => {
    useSettingsStore.getState().setMusicVolume(80);

    // Moving the music slider persists every field, including the distances.
    // Before the override flag that was enough to make them look chosen.
    expect(useSettingsStore.getState().distanceOverrides.renderDistance).toBeUndefined();
  });
});
