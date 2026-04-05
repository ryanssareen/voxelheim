"use client";

import { useEffect, useState } from "react";

const LOADING_STAGES = [
  "Initializing renderer...",
  "Loading textures...",
  "Generating terrain...",
  "Placing crystals...",
  "Growing trees...",
  "Building meshes...",
  "Preparing world...",
];

/**
 * Full-screen loading overlay with progress updates.
 */
export function LoadingScreen({ visible }: { visible: boolean }) {
  const [stageIndex, setStageIndex] = useState(0);
  const [dots, setDots] = useState("");

  // Cycle through loading stages
  useEffect(() => {
    if (!visible) {
      setStageIndex(0);
      return;
    }

    const interval = setInterval(() => {
      setStageIndex((i) => {
        if (i < LOADING_STAGES.length - 1) return i + 1;
        return i;
      });
    }, 400);

    return () => clearInterval(interval);
  }, [visible]);

  // Animate dots
  useEffect(() => {
    if (!visible) return;
    const interval = setInterval(() => {
      setDots((d) => (d.length >= 3 ? "" : d + "."));
    }, 300);
    return () => clearInterval(interval);
  }, [visible]);

  if (!visible) return null;

  const progress = Math.min(
    ((stageIndex + 1) / LOADING_STAGES.length) * 100,
    100
  );

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#1a0a08] z-20">
      {/* Dirt-textured background */}
      <div
        className="absolute inset-0 opacity-20"
        style={{
          background:
            "repeating-linear-gradient(90deg, #6b4226 0px, #7a4f2d 4px, #5c3a1e 8px, #6b4226 12px), repeating-linear-gradient(0deg, #6b4226 0px, #7a4f2d 4px, #5c3a1e 8px, #6b4226 12px)",
          backgroundSize: "12px 12px",
          imageRendering: "pixelated",
        }}
      />

      <div className="relative z-10 flex flex-col items-center gap-6 w-[400px]">
        {/* Title */}
        <h2
          className="text-2xl font-mono font-bold text-white"
          style={{ textShadow: "2px 2px 0 #2a2a2a" }}
        >
          Loading World
        </h2>

        {/* Current stage */}
        <p
          className="text-white/70 font-mono text-sm h-5"
          style={{ textShadow: "1px 1px 0 #000" }}
        >
          {LOADING_STAGES[stageIndex]}{dots}
        </p>

        {/* Progress bar — MC style */}
        <div className="w-full h-5 relative" style={{
          background: "#222",
          border: "2px solid #0f0f0f",
          boxShadow: "inset 0 2px 4px rgba(0,0,0,0.5), inset 0 -1px 0 #3a3a3a",
        }}>
          <div
            className="h-full transition-all duration-300"
            style={{
              width: `${progress}%`,
              background: "linear-gradient(to bottom, #5c8a3c 0%, #4a7a2e 50%, #3a6a20 100%)",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.2), inset 0 -1px 0 rgba(0,0,0,0.2)",
            }}
          />
        </div>

        {/* Stage list */}
        <div className="w-full mt-2">
          {LOADING_STAGES.map((stage, i) => (
            <div
              key={stage}
              className="flex items-center gap-2 py-0.5"
              style={{ textShadow: "1px 1px 0 #000" }}
            >
              <span className="font-mono text-xs w-4 text-center">
                {i < stageIndex ? (
                  <span className="text-green-400">✓</span>
                ) : i === stageIndex ? (
                  <span className="text-yellow-400 animate-pulse">▸</span>
                ) : (
                  <span className="text-white/20">○</span>
                )}
              </span>
              <span
                className={`font-mono text-xs ${
                  i < stageIndex
                    ? "text-white/40"
                    : i === stageIndex
                    ? "text-white/80"
                    : "text-white/20"
                }`}
              >
                {stage}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
