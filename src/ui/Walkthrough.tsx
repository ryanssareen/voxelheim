"use client";

import { useCallback, useEffect } from "react";
import type { Engine } from "@engine/Engine";
import {
  WALKTHROUGH_STEPS,
  stepHint,
  useWalkthroughStore,
} from "@store/useWalkthroughStore";
import { useGameStore } from "@store/useGameStore";
import { useInventoryStore } from "@store/useInventoryStore";
import { DEMO_WORLD_ID } from "@lib/demoWorld";
import { useKeybindsStore } from "@store/useKeybindsStore";
import { useMovementIntent } from "@ui/useIntentEdge";

export function Walkthrough({
  worldId,
  engineRef,
}: {
  worldId?: string;
  engineRef?: React.RefObject<Engine | null>;
}) {
  const isOpen = useWalkthroughStore((s) => s.isOpen);
  const activeIndex = useWalkthroughStore((s) => s.activeIndex);
  const notify = useWalkthroughStore((s) => s.notify);
  const dismiss = useWalkthroughStore((s) => s.dismiss);
  const startIfUnseen = useWalkthroughStore((s) => s.startIfUnseen);
  const keybindsOpen = useKeybindsStore((s) => s.isOpen);
  // Read live: the source arms on the first touch anywhere on the page, so a
  // player who taps rather than clicks gets the right wording from step one.
  const touchMode = useGameStore((s) => s.inputSource === "touch");
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
  //
  // R24 puts this on the movement *intent* rather than on eight key codes that
  // had to be kept in step with PlayerController by hand — and that counted a
  // "w" typed into the chat box as a step of walking. A joystick (U6) will
  // satisfy it with no change here.
  const notifyMove = useCallback(() => notify("move"), [notify]);
  useMovementIntent(engineRef, isOpen, notifyMove);

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
        <p className="text-white/70 font-mono text-[11px] leading-snug">
          {stepHint(step, touchMode)}
        </p>
      </div>
    </div>
  );
}
