"use client";

import { useEffect, useState } from "react";
import { useGameStore } from "@store/useGameStore";

/**
 * Heads-up display: crosshair, shard counter, completion overlay, debug panel.
 * Pointer-events: none so it doesn't intercept canvas input.
 */
export function HUD() {
  const shardsCollected = useGameStore((s) => s.shardsCollected);
  const shardsTotal = useGameStore((s) => s.shardsTotal);
  const isComplete = useGameStore((s) => s.isComplete);
  const [showContinue, setShowContinue] = useState(false);
  const [showDebug, setShowDebug] = useState(false);

  // Show "Press ESC" after 4 seconds of completion
  useEffect(() => {
    if (!isComplete) {
      setShowContinue(false);
      return;
    }
    const timer = setTimeout(() => setShowContinue(true), 4000);
    return () => clearTimeout(timer);
  }, [isComplete]);

  // F3 debug toggle
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code === "F3") {
        e.preventDefault();
        setShowDebug((d) => !d);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <div className="absolute inset-0 pointer-events-none z-10">
      {/* Crosshair */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 mix-blend-difference">
        <div className="w-5 h-px bg-white absolute top-1/2 left-1/2 -translate-x-1/2" />
        <div className="h-5 w-px bg-white absolute top-1/2 left-1/2 -translate-y-1/2" />
      </div>

      {/* Shard Counter */}
      <div className="absolute top-4 right-4 flex items-center gap-2 text-white font-mono text-sm">
        <div
          className="w-3 h-3 rotate-45 border border-cyan-400 bg-cyan-400/30"
          key={shardsCollected}
          style={{ animation: "pulse 0.3s ease-out" }}
        />
        <span>
          Shards: {shardsCollected}/{shardsTotal}
        </span>
      </div>

      {/* Debug Panel */}
      {showDebug && (
        <div className="absolute top-4 left-4 text-white/70 font-mono text-xs bg-black/50 p-2 rounded">
          <p>F3 Debug</p>
        </div>
      )}

      {/* Completion Overlay */}
      {isComplete && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 animate-[fadeIn_1s_ease-out]">
          <h1
            className="text-5xl font-mono font-bold text-cyan-300 mb-8"
            style={{ textShadow: "0 0 30px #00e5ff, 0 0 60px #00e5ff" }}
          >
            ISLAND CLEARED
          </h1>
          {showContinue && (
            <p className="text-white/60 font-mono text-sm animate-pulse">
              Press ESC to continue
            </p>
          )}
        </div>
      )}
    </div>
  );
}
