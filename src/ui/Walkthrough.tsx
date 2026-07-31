"use client";

import { useEffect } from "react";
import {
  WALKTHROUGH_STEPS,
  useWalkthroughStore,
} from "@store/useWalkthroughStore";
import { useInventoryStore } from "@store/useInventoryStore";
import { DEMO_WORLD_ID } from "@lib/demoWorld";
import { useKeybindsStore } from "@store/useKeybindsStore";

// Mirrors PlayerController, which also accepts the arrow keys.
const MOVE_KEYS = new Set([
  "KeyW", "KeyA", "KeyS", "KeyD",
  "ArrowUp", "ArrowLeft", "ArrowDown", "ArrowRight",
]);

export function Walkthrough({ worldId }: { worldId?: string }) {
  const isOpen = useWalkthroughStore((s) => s.isOpen);
  const activeIndex = useWalkthroughStore((s) => s.activeIndex);
  const notify = useWalkthroughStore((s) => s.notify);
  const dismiss = useWalkthroughStore((s) => s.dismiss);
  const startIfUnseen = useWalkthroughStore((s) => s.startIfUnseen);
  const keybindsOpen = useKeybindsStore((s) => s.isOpen);
  const keybindsSeen = useKeybindsStore((s) => s.seen);

  // R9 scopes auto-start to the demo world. Existing players loading their own
  // worlds must not have the overlay appear unasked; they reach it from pause.
  // Gated on the controls popup being seen and closed, so the two never stack
  // on first entry. Keyed on state rather than mount order, which is why it
  // checks `seen` too -- this effect can run before the popup's own.
  useEffect(() => {
    if (worldId === DEMO_WORLD_ID && keybindsSeen && !keybindsOpen) {
      startIfUnseen();
    }
  }, [worldId, keybindsSeen, keybindsOpen, startIfUnseen]);

  // Movement is observed here; break/place are notified from BlockInteraction.
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (MOVE_KEYS.has(e.code)) notify("move");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, notify]);

  useEffect(() => {
    if (!isOpen) return;
    return useInventoryStore.subscribe((state, prev) => {
      if (state.isOpen && !prev.isOpen) notify("inventory");
    });
  }, [isOpen, notify]);

  if (!isOpen) return null;

  const step = WALKTHROUGH_STEPS[activeIndex];
  if (!step) return null;

  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 pointer-events-none">
      <div
        className="flex flex-col gap-1 px-4 py-3 w-[300px] pointer-events-auto"
        style={{
          background: "linear-gradient(to bottom, rgba(40,40,40,0.95) 0%, rgba(24,24,24,0.95) 100%)",
          border: "3px solid #1a1a1a",
          boxShadow: "inset 0 2px 0 rgba(255,255,255,0.1), 0 3px 6px rgba(0,0,0,0.5)",
        }}
      >
        <div className="flex items-center justify-between">
          <span className="text-yellow-400 font-mono text-[10px] tracking-widest">
            STEP {activeIndex + 1} / {WALKTHROUGH_STEPS.length}
          </span>
          <button
            onClick={dismiss}
            className="text-white/40 hover:text-white/80 font-mono text-[10px] underline"
          >
            Skip
          </button>
        </div>
        <p
          className="text-white font-mono text-sm font-bold"
          style={{ textShadow: "2px 2px 0 #2a2a2a" }}
        >
          {step.title}
        </p>
        <p className="text-white/70 font-mono text-[11px] leading-snug">{step.hint}</p>
      </div>
    </div>
  );
}
