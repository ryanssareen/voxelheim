"use client";

import Link from "next/link";
import { useState } from "react";

function OptionsModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-20">
      <div className="flex flex-col items-center gap-4 w-[380px]">
        <h2
          className="text-2xl font-mono text-white font-bold"
          style={{ textShadow: "2px 2px 0 #2a2a2a" }}
        >
          Options
        </h2>

        <div className="w-full flex flex-col gap-2">
          <div
            className="w-full py-2.5 text-center text-white/50 font-mono text-sm"
            style={{
              background: "linear-gradient(to bottom, #5a5a5a 0%, #3a3a3a 40%, #2e2e2e 60%, #222 100%)",
              border: "3px solid #1a1a1a",
              boxShadow: "inset 0 2px 0 rgba(255,255,255,0.08), inset 0 -2px 0 rgba(0,0,0,0.3)",
              textShadow: "1px 1px 0 #1a1a1a",
            }}
          >
            Music: OFF
          </div>
          <div
            className="w-full py-2.5 text-center text-white/50 font-mono text-sm"
            style={{
              background: "linear-gradient(to bottom, #5a5a5a 0%, #3a3a3a 40%, #2e2e2e 60%, #222 100%)",
              border: "3px solid #1a1a1a",
              boxShadow: "inset 0 2px 0 rgba(255,255,255,0.08), inset 0 -2px 0 rgba(0,0,0,0.3)",
              textShadow: "1px 1px 0 #1a1a1a",
            }}
          >
            Render Distance: 4 chunks
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full py-2.5 text-white font-mono text-sm tracking-wide hover:brightness-125 active:brightness-90 transition-all"
          style={{
            background: "linear-gradient(to bottom, #7a7a7a 0%, #5a5a5a 40%, #484848 60%, #3a3a3a 100%)",
            border: "3px solid #1a1a1a",
            boxShadow: "inset 0 2px 0 rgba(255,255,255,0.15), inset 0 -2px 0 rgba(0,0,0,0.3)",
            textShadow: "2px 2px 0 #2a2a2a",
          }}
        >
          Done
        </button>
      </div>
    </div>
  );
}

function QuitModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-20">
      <div className="flex flex-col items-center gap-4 w-[380px]">
        <h2
          className="text-xl font-mono text-white font-bold"
          style={{ textShadow: "2px 2px 0 #2a2a2a" }}
        >
          Are you sure you want to quit?
        </h2>
        <p className="text-white/40 font-mono text-sm" style={{ textShadow: "1px 1px 0 #000" }}>
          There is nowhere to go. This is a browser game.
        </p>
        <button
          onClick={onClose}
          className="w-full py-2.5 text-white font-mono text-sm tracking-wide hover:brightness-125 active:brightness-90 transition-all"
          style={{
            background: "linear-gradient(to bottom, #7a7a7a 0%, #5a5a5a 40%, #484848 60%, #3a3a3a 100%)",
            border: "3px solid #1a1a1a",
            boxShadow: "inset 0 2px 0 rgba(255,255,255,0.15), inset 0 -2px 0 rgba(0,0,0,0.3)",
            textShadow: "2px 2px 0 #2a2a2a",
          }}
        >
          Back to Menu
        </button>
      </div>
    </div>
  );
}

const MC_BUTTON =
  "block w-full text-center py-2.5 text-white font-mono tracking-wide hover:brightness-125 active:brightness-90 transition-all select-none";
const MC_BUTTON_STYLE = {
  background: "linear-gradient(to bottom, #7a7a7a 0%, #5a5a5a 40%, #484848 60%, #3a3a3a 100%)",
  border: "3px solid #1a1a1a",
  boxShadow:
    "inset 0 2px 0 rgba(255,255,255,0.15), inset 0 -2px 0 rgba(0,0,0,0.3), 0 3px 6px rgba(0,0,0,0.4)",
  textShadow: "2px 2px 0 #2a2a2a",
};

export default function Home() {
  const [showOptions, setShowOptions] = useState(false);
  const [showQuit, setShowQuit] = useState(false);

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden select-none">
      {/* Full-screen panorama background */}
      <div
        className="absolute inset-0"
        style={{
          background: `
            linear-gradient(to bottom,
              #0d0520 0%,
              #1a0a35 8%,
              #4a1a40 16%,
              #8a2e35 24%,
              #c84a20 32%,
              #e87830 40%,
              #d49040 46%,
              #70a050 52%,
              #4a8a3a 58%,
              #3a7a3a 64%,
              #2a6030 72%,
              #1a4020 84%,
              #1a3018 100%
            )
          `,
        }}
      />

      {/* Silhouette trees/mountains */}
      <div
        className="absolute bottom-20 left-0 right-0 h-[40%]"
        style={{
          background: `
            linear-gradient(to bottom, transparent 0%, rgba(20,40,20,0.3) 40%, rgba(20,40,20,0.6) 100%)
          `,
        }}
      />

      {/* Dirt + grass strip at bottom */}
      <div
        className="absolute bottom-0 left-0 right-0 h-16"
        style={{
          background: "repeating-linear-gradient(90deg, #6b4226 0px, #7a4f2d 3px, #5c3a1e 6px, #6b4226 9px)",
          imageRendering: "pixelated",
        }}
      />
      <div className="absolute bottom-16 left-0 right-0 h-3 bg-[#4a7a3a]" />
      <div className="absolute bottom-[76px] left-0 right-0 h-1 bg-[#3a6a2a]" />

      {/* Vignette */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_20%,rgba(0,0,0,0.35)_100%)]" />

      <div className="relative flex flex-col items-center z-10 -mt-8">
        {/* Title */}
        <h1
          className="text-[72px] sm:text-[100px] md:text-[120px] font-black leading-none"
          style={{
            fontFamily: "monospace",
            color: "#e8e8e8",
            textShadow: `
              4px 4px 0 #4a4a4a,
              7px 7px 0 #2a2a2a,
              1px 1px 0 rgba(255,255,255,0.4),
              -1px -1px 0 rgba(0,0,0,0.3)
            `,
            letterSpacing: "0.04em",
            WebkitTextStroke: "1px #3a3a3a",
            paintOrder: "stroke fill",
          }}
        >
          VOXELHEIM
        </h1>
        <p
          className="text-base sm:text-lg font-mono text-yellow-400 -mt-1 tracking-[0.2em]"
          style={{ textShadow: "2px 2px 0 #2a1a00" }}
        >
          Island Edition
        </p>

        {/* Menu buttons */}
        <div className="flex flex-col items-center gap-2.5 mt-10 w-[300px] sm:w-[380px]">
          <Link href="/game/create" className={MC_BUTTON + " text-lg"} style={MC_BUTTON_STYLE}>
            Play Game
          </Link>
          <div className="flex gap-2.5 w-full">
            <button
              onClick={() => setShowOptions(true)}
              className={MC_BUTTON + " flex-1 text-sm"}
              style={MC_BUTTON_STYLE}
            >
              Options...
            </button>
            <button
              onClick={() => setShowQuit(true)}
              className={MC_BUTTON + " flex-1 text-sm"}
              style={MC_BUTTON_STYLE}
            >
              Quit Game
            </button>
          </div>
        </div>

        {/* Version */}
        <p className="mt-8 text-[11px] text-white/40 font-mono" style={{ textShadow: "1px 1px 0 #000" }}>
          Voxelheim Island Edition (v0.1.0)
        </p>
      </div>

      {showOptions && <OptionsModal onClose={() => setShowOptions(false)} />}
      {showQuit && <QuitModal onClose={() => setShowQuit(false)} />}
    </main>
  );
}
