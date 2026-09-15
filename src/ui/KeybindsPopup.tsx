"use client";

import { useEffect } from "react";
import type { Engine } from "@engine/Engine";
import { KEYBIND_GROUPS } from "@data/keybinds";
import { touchControlGroups } from "@data/touchParity";
import { useGameStore } from "@store/useGameStore";
import { useKeybindsStore } from "@store/useKeybindsStore";
import { DEMO_WORLD_ID } from "@lib/demoWorld";
import { MODAL_DISMISS_BLOCKERS, UI_PRIORITY } from "@engine/input/uiIntents";
import { useIntentEdge } from "@ui/useIntentEdge";

export function KeybindsPopup({
  worldId,
  engineRef,
}: {
  worldId?: string;
  engineRef?: React.RefObject<Engine | null>;
}) {
  const isOpen = useKeybindsStore((s) => s.isOpen);
  const showOnce = useKeybindsStore((s) => s.showOnce);
  const close = useKeybindsStore((s) => s.close);
  // R24: a phone player being told to press W A S D learns nothing except that
  // the game was not built for them. Read live rather than at mount — the
  // source arms on the first touch event (R27) and can change mid-session (R28),
  // so a popup opened with a keyboard and then touched swaps under the finger.
  const touchMode = useGameStore((s) => s.inputSource) === "touch";

  // Auto-opens on the demo only, and only the first time.
  useEffect(() => {
    if (worldId === DEMO_WORLD_ID) showOnce();
  }, [worldId, showOnce]);

  useEffect(() => {
    if (!isOpen) return;
    if (document.pointerLockElement) document.exitPointerLock();
  }, [isOpen]);

  // Escape and Enter close the popup, and nothing behind it sees them.
  //
  // This used to be a capture-phase `window` listener calling
  // `stopPropagation()`, which said two things at once: go before the other
  // handlers, and stop the event there. Registering at modal priority is the
  // first; `exclusive` is the second. It matters beyond tidiness — U8 makes
  // `pause` a real intent, and without the claim, Escape on this popup would
  // close it *and* pause the game behind it.
  const modal = { enabled: isOpen, priority: UI_PRIORITY.modal, exclusive: true };
  useIntentEdge(engineRef, "pause", MODAL_DISMISS_BLOCKERS, close, modal);
  useIntentEdge(engineRef, "confirm", MODAL_DISMISS_BLOCKERS, close, modal);

  if (!isOpen) return null;

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/70">
      <div
        className="flex flex-col gap-3 px-6 py-5 max-w-[560px] w-[90%] max-h-[85%] overflow-y-auto"
        style={{
          background: "linear-gradient(to bottom, rgba(46,46,46,0.98) 0%, rgba(26,26,26,0.98) 100%)",
          border: "3px solid #1a1a1a",
          boxShadow: "inset 0 2px 0 rgba(255,255,255,0.1), 0 6px 16px rgba(0,0,0,0.6)",
        }}
      >
        <h2
          className="text-white font-mono text-lg font-bold text-center"
          style={{ textShadow: "2px 2px 0 #2a2a2a" }}
        >
          Controls
        </h2>

        {touchMode ? <TouchGroups /> : <KeyGroups />}

        <button
          onClick={close}
          className="mt-1 w-full py-2.5 text-white font-mono tracking-wide hover:brightness-125 active:brightness-90 transition-all"
          style={{
            background: "linear-gradient(to bottom, #5a9a4a 0%, #3a7a2a 40%, #2a6a1a 60%, #1a5a0a 100%)",
            border: "3px solid #1a1a1a",
            boxShadow: "inset 0 2px 0 rgba(255,255,255,0.15), inset 0 -2px 0 rgba(0,0,0,0.3)",
            textShadow: "2px 2px 0 #2a2a2a",
          }}
        >
          Got it
        </button>
        <p className="text-white/35 font-mono text-[10px] text-center">
          Reopen any time from the pause menu
        </p>
      </div>
    </div>
  );
}

/**
 * The keyboard layout: a key cap, then what it does.
 *
 * Three columns, because a key cap is short and three groups fit a desktop
 * window side by side.
 */
function KeyGroups() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {KEYBIND_GROUPS.map((group) => (
        <div key={group.title} className="flex flex-col gap-1.5">
          <div className="text-yellow-400 font-mono text-[10px] tracking-widest">
            {group.title.toUpperCase()}
          </div>
          {group.binds.map((b) => (
            <div key={b.action + b.keys} className="flex items-baseline justify-between gap-2">
              <span
                className="text-white font-mono text-[11px] px-1.5 py-0.5 shrink-0"
                style={{ background: "#3a3a3a", border: "1px solid #1a1a1a" }}
              >
                {b.keys}
              </span>
              <span className="text-white/70 font-mono text-[11px] text-right">{b.action}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * The touch layout: what it does, then how to do it.
 *
 * One column rather than three, and the two halves swapped. A gesture
 * description is a sentence where a key cap is a glyph, so three columns would
 * wrap every line; and a player who cannot see a labelled key is looking for
 * the action first and the method second, which is the opposite of the reading
 * order that works for a keyboard.
 */
function TouchGroups() {
  return (
    <div className="flex flex-col gap-4">
      {touchControlGroups().map((group) => (
        <div key={group.title} className="flex flex-col gap-1.5">
          <div className="text-yellow-400 font-mono text-[10px] tracking-widest">
            {group.title.toUpperCase()}
          </div>
          {group.rows.map((row) => (
            <div key={row.action} className="flex items-baseline justify-between gap-3">
              <span className="text-white font-mono text-[11px] shrink-0">{row.action}</span>
              <span className="text-white/60 font-mono text-[11px] text-right">{row.how}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
