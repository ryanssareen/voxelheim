import { create } from "zustand";
import { readLocalJson, writeLocalJson } from "@lib/storage";

const STORAGE_KEY = "voxelheim-settings";

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
  setMusicVolume: (v: number) => void;
  setMusicEnabled: (e: boolean) => void;
  setRenderDistance: (d: number) => void;
  setSimulationDistance: (d: number) => void;
  setFov: (f: number) => void;
  setAutoJump: (enabled: boolean) => void;
  setFullscreenOnPlay: (enabled: boolean) => void;
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
  });
}

const defaults = {
  musicVolume: 50,
  musicEnabled: true,
  renderDistance: 8,
  simulationDistance: 6,
  fov: 75,
  autoJump: true,
  fullscreenOnPlay: true,
};

export const useSettingsStore = create<SettingsState>((set, get) => {
  const saved = loadSettings();
  return {
    musicVolume: saved.musicVolume ?? defaults.musicVolume,
    musicEnabled: saved.musicEnabled ?? defaults.musicEnabled,
    renderDistance: saved.renderDistance ?? defaults.renderDistance,
    simulationDistance: saved.simulationDistance ?? defaults.simulationDistance,
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
    setRenderDistance: (d: number) => {
      set({ renderDistance: Math.max(2, Math.min(32, d)) });
      persistSettings(get());
    },
    setSimulationDistance: (d: number) => {
      set({ simulationDistance: Math.max(2, Math.min(16, d)) });
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
  };
});
