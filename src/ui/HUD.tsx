"use client";

import { useEffect, useState } from "react";
import { useGameStore } from "@store/useGameStore";

/**
 * Minecraft-style HUD: crosshair, shard counter, completion overlay, F3 debug.
 */
export function HUD() {
  const shardsCollected = useGameStore((s) => s.shardsCollected);
  const shardsTotal = useGameStore((s) => s.shardsTotal);
  const isComplete = useGameStore((s) => s.isComplete);
  const [showContinue, setShowContinue] = useState(false);
  const [showDebug, setShowDebug] = useState(false);

  useEffect(() => {
    if (!isComplete) {
      setShowContinue(false);
      return;
    }
    const timer = setTimeout(() => setShowContinue(true), 4000);
    return () => clearTimeout(timer);
  }, [isComplete]);

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
      {/* Minecraft-style crosshair — white + with slight transparency */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
        <svg width="24" height="24" viewBox="0 0 24 24" className="opacity-70">
          <rect x="11" y="4" width="2" height="7" fill="white" />
          <rect x="11" y="13" width="2" height="7" fill="white" />
          <rect x="4" y="11" width="7" height="2" fill="white" />
          <rect x="13" y="11" width="7" height="2" fill="white" />
        </svg>
      </div>

      {/* Shard Counter — top center, Minecraft achievement style */}
      <div
        className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3 py-1.5 bg-black/50 border border-white/10 rounded"
        style={{ textShadow: "1px 1px 0 #000" }}
      >
        <div className="w-3 h-3 rotate-45 bg-cyan-400 shadow-[0_0_6px_#00e5ff]" />
        <span className="text-white font-mono text-sm font-bold">
          {shardsCollected}
          <span className="text-white/40 font-normal">/{shardsTotal}</span>
        </span>
      </div>

      {/* F3 Debug */}
      {showDebug && (
        <div
          className="absolute top-4 left-4 text-white font-mono text-[11px] leading-relaxed bg-black/60 p-2"
          style={{ textShadow: "1px 1px 0 #000" }}
        >
          <p>Voxelheim v0.1.0</p>
          <p>F3 — Debug</p>
        </div>
      )}

      {/* Completion Overlay */}
      {isComplete && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70">
          <h1
            className="text-5xl font-mono font-bold text-cyan-300 mb-8"
            style={{
              textShadow: "0 0 30px #00e5ff, 0 0 60px #00e5ff, 3px 3px 0 #0a3040",
            }}
          >
            ISLAND CLEARED!
          </h1>
          <p
            className="text-white/60 font-mono text-sm mb-4"
            style={{ textShadow: "1px 1px 0 #000" }}
          >
            All {shardsTotal} crystal shards collected
          </p>
          {showContinue && (
            <p className="text-white/40 font-mono text-xs animate-pulse">
              Press ESC to continue
            </p>
          )}
        </div>
      )}
    </div>
  );
}
