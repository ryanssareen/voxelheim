import { create } from "zustand";
import { readLocal, writeLocal } from "@lib/storage";

export type WalkthroughAction = "move" | "break" | "place" | "inventory";

export interface WalkthroughStep {
  action: WalkthroughAction;
  title: string;
  /** What to do, on a keyboard and mouse. */
  hint: string;
  /**
   * The same instruction for a finger (R24).
   *
   * Separate copy rather than a rewrite that covers both, because a hint that
   * hedges — "walk forward, however your device does that" — teaches nobody.
   * The step *detection* is already input-agnostic: it watches the movement
   * intent, which a joystick satisfies exactly as WASD does. Only the words
   * were still assuming a keyboard, which is the narrower and more embarrassing
   * failure: a phone player was told to press keys they do not have, by the
   * screen whose entire job is teaching them the controls.
   */
  touchHint: string;
}

/** R10 order: movement, break, place, inventory. */
export const WALKTHROUGH_STEPS: readonly WalkthroughStep[] = [
  {
    action: "move",
    title: "Move around",
    hint: "Use W A S D to walk. Move the mouse to look.",
    touchHint: "Drag your thumb on the left of the screen to walk. Drag on the right to look.",
  },
  {
    action: "break",
    title: "Break a block",
    hint: "Hold left-click on a block until it breaks.",
    touchHint: "Press and hold on a block until it breaks.",
  },
  {
    action: "place",
    title: "Place a block",
    hint: "Pick a block from your hotbar, then right-click to place it.",
    touchHint: "Tap a hotbar slot to pick a block, then tap where you want it.",
  },
  {
    action: "inventory",
    title: "Open your inventory",
    hint: "Press E to open your inventory and crafting grid.",
    touchHint: "Tap the grid button at the right end of the hotbar.",
  },
];

/** The wording for the device currently driving. */
export function stepHint(step: WalkthroughStep, touch: boolean): string {
  return touch ? step.touchHint : step.hint;
}

const STORAGE_KEY = "voxelheim-walkthrough-completed";

function loadCompleted(): boolean {
  return readLocal(STORAGE_KEY) === "true";
}

function persistCompleted(completed: boolean) {
  writeLocal(STORAGE_KEY, String(completed));
}

interface WalkthroughState {
  isOpen: boolean;
  activeIndex: number;
  completed: boolean;
  /** Auto-starts only when never completed or dismissed (R12). */
  startIfUnseen: () => void;
  /** Pause-menu entry: replays from step one in any world (R11). */
  reopen: () => void;
  /** Advances only when the action matches the active step. */
  notify: (action: WalkthroughAction) => void;
  dismiss: () => void;
}

export const useWalkthroughStore = create<WalkthroughState>((set, get) => ({
  isOpen: false,
  activeIndex: 0,
  completed: loadCompleted(),

  startIfUnseen: () => {
    if (get().completed || get().isOpen) return;
    set({ isOpen: true, activeIndex: 0 });
  },

  reopen: () => set({ isOpen: true, activeIndex: 0 }),

  notify: (action: WalkthroughAction) => {
    const { isOpen, activeIndex } = get();
    if (!isOpen) return;
    if (WALKTHROUGH_STEPS[activeIndex]?.action !== action) return;

    const next = activeIndex + 1;
    if (next >= WALKTHROUGH_STEPS.length) {
      persistCompleted(true);
      set({ isOpen: false, activeIndex: 0, completed: true });
      return;
    }
    set({ activeIndex: next });
  },

  dismiss: () => {
    persistCompleted(true);
    set({ isOpen: false, activeIndex: 0, completed: true });
  },
}));

/** Safe to call from the engine; a no-op when the walkthrough is closed. */
export function notifyWalkthrough(action: WalkthroughAction) {
  useWalkthroughStore.getState().notify(action);
}
