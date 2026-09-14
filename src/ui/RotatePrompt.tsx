"use client";

import { useViewportEnv } from "@ui/useViewportEnv";
import { useGameStore } from "@store/useGameStore";

/**
 * Portrait's entry state on a touch device.
 *
 * The game is authored for landscape: the hotbar is a nine-slot strip and the
 * thumb controls anchor to the bottom corners, neither of which survives being
 * squeezed into a tall narrow box. Rather than lay out a portrait variant that
 * nobody would enjoy, portrait gets an explicit "turn sideways" state.
 *
 * It covers the screen rather than sitting alongside the game because rotating
 * mid-session is a real case — a player lies down, the phone follows — and a
 * world that keeps simulating behind an unplayable layout is worse than one
 * that visibly waits.
 *
 * Desktop never sees this: a narrow *window* is not a rotated *device*, and
 * there is nothing to rotate.
 */
export function RotatePrompt() {
  const touch = useGameStore((s) => s.inputSource === "touch");
  if (!touch) return null;
  return <RotatePromptInner />;
}

function RotatePromptInner() {
  const env = useViewportEnv();
  if (!env.portrait) return null;

  return (
    <div
      className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black/92 select-none"
      style={{
        paddingTop: env.insets.top,
        paddingRight: env.insets.right,
        paddingBottom: env.insets.bottom,
        paddingLeft: env.insets.left,
      }}
      role="status"
    >
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="w-14 h-14 text-white/85"
        fill="currentColor"
      >
        <path d="M7 2h6a2 2 0 012 2v3h-2V4H7v16h6v-3h2v3a2 2 0 01-2 2H7a2 2 0 01-2-2V4a2 2 0 012-2z" />
        <path d="M17.5 9.5 21 13l-3.5 3.5V14h-3v-2h3z" />
      </svg>
      <p
        className="text-white font-mono text-base tracking-wide"
        style={{ textShadow: "2px 2px 0 #2a2a2a" }}
      >
        Turn sideways to play
      </p>
      <p className="text-white/45 font-mono text-xs max-w-[28ch] text-center leading-relaxed">
        Voxelheim is built for landscape. Your world is waiting exactly where you
        left it.
      </p>
    </div>
  );
}
