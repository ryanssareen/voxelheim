import { create } from "zustand";
import type { InputSource } from "@engine/input/intents";
import {
  OVERRIDABLE_DISTANCES,
  deviceProfileFor,
  resolveDistance,
  type OverridableDistance,
} from "@engine/world/deviceProfile";
import { readLocalJson, writeLocalJson } from "@lib/storage";

const STORAGE_KEY = "voxelheim-settings";

/** Which distance settings the player has pinned by choosing a value (R29). */
export type DistanceOverrides = Partial<Record<OverridableDistance, boolean>>;

interface SettingsState {
  musicVolume: number;
  musicEnabled: boolean;
  renderDistance: number;
  simulationDistance: number;
  fov: number;
  /** Step up one-block ledges automatically while walking. */
  autoJump: boolean;
  /** Request browser fullscreen when the player clicks into the game. */
  fullscreenOnPlay: boolean;
  /**
   * Distance settings the player has set by hand, which no device profile may
   * overwrite.
   *
   * Tracked separately because `saved ?? default` cannot tell an untouched
   * setting from one deliberately set to the old default — and this store
   * persists every field on any change, so moving the music slider used to be
   * enough to make a render distance look chosen. Without this flag a device
   * profile would either never apply or would quietly discard a real choice.
   */
  distanceOverrides: DistanceOverrides;
  setMusicVolume: (v: number) => void;
  setMusicEnabled: (e: boolean) => void;
  setRenderDistance: (d: number) => void;
  setSimulationDistance: (d: number) => void;
  setFov: (f: number) => void;
  setAutoJump: (enabled: boolean) => void;
  setFullscreenOnPlay: (enabled: boolean) => void;
  /**
   * Re-resolves the distance defaults for the device now driving (R28, R29).
   *
   * Called when the input source changes rather than at load, because touch
   * arms on the first touch event (R27) — which happens well after this store
   * is constructed, and can happen again in either direction on a tablet with a
   * keyboard. Settings the player has pinned are left alone.
   */
  applyDeviceProfile: (source: InputSource) => void;
}

function loadSettings(): Partial<SettingsState> {
  return readLocalJson<Partial<SettingsState>>(STORAGE_KEY, {});
}

function persistSettings(state: SettingsState) {
  writeLocalJson(STORAGE_KEY, {
    musicVolume: state.musicVolume,
    musicEnabled: state.musicEnabled,
    renderDistance: state.renderDistance,
    simulationDistance: state.simulationDistance,
    fov: state.fov,
    autoJump: state.autoJump,
    fullscreenOnPlay: state.fullscreenOnPlay,
    // Persisted alongside the values, so a pinned distance survives a reload
    // as a *pin* and not merely as a number the next device profile overwrites.
    distanceOverrides: state.distanceOverrides,
  });
}

const defaults = {
  musicVolume: 50,
  musicEnabled: true,
  // The desktop profile, which is what a session starts as: touch arms on the
  // first touch event, never on a user-agent string, so there is nothing to
  // detect at construction time.
  ...deviceProfileFor("keyboardMouse"),
  fov: 75,
  autoJump: true,
  fullscreenOnPlay: true,
};

export const useSettingsStore = create<SettingsState>((set, get) => {
  const saved = loadSettings();
  const savedOverrides: DistanceOverrides = saved.distanceOverrides ?? {};
  return {
    musicVolume: saved.musicVolume ?? defaults.musicVolume,
    musicEnabled: saved.musicEnabled ?? defaults.musicEnabled,
    renderDistance: resolveDistance(
      "renderDistance",
      "keyboardMouse",
      saved.renderDistance,
      savedOverrides.renderDistance === true,
    ),
    simulationDistance: resolveDistance(
      "simulationDistance",
      "keyboardMouse",
      saved.simulationDistance,
      savedOverrides.simulationDistance === true,
    ),
    distanceOverrides: savedOverrides,
    fov: saved.fov ?? defaults.fov,
    autoJump: saved.autoJump ?? defaults.autoJump,
    fullscreenOnPlay: saved.fullscreenOnPlay ?? defaults.fullscreenOnPlay,
    setMusicVolume: (v: number) => {
      set({ musicVolume: Math.max(0, Math.min(100, v)) });
      persistSettings(get());
    },
    setMusicEnabled: (e: boolean) => {
      set({ musicEnabled: e });
      persistSettings(get());
    },
    // Setting a distance by hand pins it. Every later device profile leaves it
    // alone, in both directions — a player who wants a long draw distance on a
    // phone keeps it, and one who turned it down on a laptop is not handed the
    // desktop default back the next time they pick up a mouse.
    setRenderDistance: (d: number) => {
      set((s) => ({
        renderDistance: Math.max(2, Math.min(32, d)),
        distanceOverrides: { ...s.distanceOverrides, renderDistance: true },
      }));
      persistSettings(get());
    },
    setSimulationDistance: (d: number) => {
      set((s) => ({
        simulationDistance: Math.max(2, Math.min(16, d)),
        distanceOverrides: { ...s.distanceOverrides, simulationDistance: true },
      }));
      persistSettings(get());
    },
    setFov: (f: number) => {
      set({ fov: Math.max(60, Math.min(110, f)) });
      persistSettings(get());
    },
    setAutoJump: (enabled: boolean) => {
      set({ autoJump: enabled });
      persistSettings(get());
    },
    setFullscreenOnPlay: (enabled: boolean) => {
      set({ fullscreenOnPlay: enabled });
      persistSettings(get());
    },

    applyDeviceProfile: (source: InputSource) => {
      const state = get();
      const next: Partial<SettingsState> = {};

      for (const setting of OVERRIDABLE_DISTANCES) {
        if (state.distanceOverrides[setting] === true) continue;
        const value = deviceProfileFor(source)[setting];
        if (state[setting] !== value) next[setting] = value;
      }

      // Nothing to do is the common case — this runs on a source change, and a
      // source change with every distance pinned should not touch storage.
      if (Object.keys(next).length === 0) return;
      set(next);
      persistSettings(get());
    },
  };
});
