import { create } from "zustand";

const STORAGE_KEY = "voxelheim-keybinds-seen";

function loadSeen(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function persistSeen() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, "true");
  } catch {}
}

interface KeybindsState {
  isOpen: boolean;
  /** True once the popup has been shown, so it never auto-opens again. */
  seen: boolean;
  /** Auto-open on demo entry. No-op once seen. */
  showOnce: () => void;
  /** Pause-menu entry: opens regardless of seen. */
  open: () => void;
  close: () => void;
}

export const useKeybindsStore = create<KeybindsState>((set, get) => ({
  isOpen: false,
  seen: loadSeen(),

  showOnce: () => {
    if (get().seen || get().isOpen) return;
    persistSeen();
    set({ isOpen: true, seen: true });
  },

  open: () => set({ isOpen: true }),

  close: () => set({ isOpen: false }),
}));
