import { create } from "zustand";
import { readLocal, writeLocal } from "@lib/storage";

const STORAGE_KEY = "voxelheim-keybinds-seen";

function loadSeen(): boolean {
  return readLocal(STORAGE_KEY) === "true";
}

function persistSeen() {
  writeLocal(STORAGE_KEY, "true");
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
