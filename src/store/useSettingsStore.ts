import { create } from "zustand";

const STORAGE_KEY = "voxelheim-settings";

interface SettingsState {
  musicVolume: number;
  musicEnabled: boolean;
  renderDistance: number;
  simulationDistance: number;
  fov: number;
  setMusicVolume: (v: number) => void;
  setMusicEnabled: (e: boolean) => void;
  setRenderDistance: (d: number) => void;
  setSimulationDistance: (d: number) => void;
  setFov: (f: number) => void;
}

function loadSettings(): Partial<SettingsState> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

function persistSettings(state: SettingsState) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        musicVolume: state.musicVolume,
        musicEnabled: state.musicEnabled,
        renderDistance: state.renderDistance,
        simulationDistance: state.simulationDistance,
        fov: state.fov,
      })
    );
  } catch {}
}

const defaults = {
  musicVolume: 50,
  musicEnabled: true,
  renderDistance: 4,
  simulationDistance: 4,
  fov: 75,
};

export const useSettingsStore = create<SettingsState>((set, get) => {
  const saved = loadSettings();
  return {
    musicVolume: saved.musicVolume ?? defaults.musicVolume,
    musicEnabled: saved.musicEnabled ?? defaults.musicEnabled,
    renderDistance: saved.renderDistance ?? defaults.renderDistance,
    simulationDistance: saved.simulationDistance ?? defaults.simulationDistance,
    fov: saved.fov ?? defaults.fov,
    setMusicVolume: (v: number) => {
      set({ musicVolume: Math.max(0, Math.min(100, v)) });
      persistSettings(get());
    },
    setMusicEnabled: (e: boolean) => {
      set({ musicEnabled: e });
      persistSettings(get());
    },
    setRenderDistance: (d: number) => {
      set({ renderDistance: Math.max(2, Math.min(16, d)) });
      persistSettings(get());
    },
    setSimulationDistance: (d: number) => {
      set({ simulationDistance: Math.max(2, Math.min(8, d)) });
      persistSettings(get());
    },
    setFov: (f: number) => {
      set({ fov: Math.max(60, Math.min(110, f)) });
      persistSettings(get());
    },
  };
});
