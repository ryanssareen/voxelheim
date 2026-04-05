"use client";

import Link from "next/link";
import { useState } from "react";

function OptionsModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-20">
      <div className="flex flex-col items-center gap-4 w-[380px]">
        <h2 className="text-2xl font-mono text-white font-bold" style={{ textShadow: "2px 2px 0 #2a2a2a" }}>
          Options
        </h2>
        <div className="w-full flex flex-col gap-2">
          {["Music: OFF", "Render Distance: 4 chunks", "FOV: 75"].map((label) => (
            <div key={label} className="w-full py-2.5 text-center text-white/50 font-mono text-sm" style={DISABLED_STYLE}>
              {label}
            </div>
          ))}
        </div>
        <button onClick={onClose} className={MC_BTN + " w-full text-sm"} style={BTN_STYLE}>
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
        <h2 className="text-xl font-mono text-white font-bold" style={{ textShadow: "2px 2px 0 #2a2a2a" }}>
          Are you sure you want to quit?
        </h2>
        <p className="text-white/40 font-mono text-sm" style={{ textShadow: "1px 1px 0 #000" }}>
          There is nowhere to go. This is a browser game.
        </p>
        <button onClick={onClose} className={MC_BTN + " w-full text-sm"} style={BTN_STYLE}>
          Back to Menu
        </button>
      </div>
    </div>
  );
}

const MC_BTN =
  "block text-center py-2.5 text-white font-mono tracking-wide hover:brightness-125 active:brightness-90 transition-all select-none";
const BTN_STYLE: React.CSSProperties = {
  background: "linear-gradient(to bottom, #7a7a7a 0%, #5a5a5a 40%, #484848 60%, #3a3a3a 100%)",
  border: "3px solid #1a1a1a",
  boxShadow: "inset 0 2px 0 rgba(255,255,255,0.15), inset 0 -2px 0 rgba(0,0,0,0.3), 0 3px 6px rgba(0,0,0,0.4)",
  textShadow: "2px 2px 0 #2a2a2a",
};
const DISABLED_STYLE: React.CSSProperties = {
  background: "linear-gradient(to bottom, #5a5a5a 0%, #3a3a3a 40%, #2e2e2e 60%, #222 100%)",
  border: "3px solid #1a1a1a",
  boxShadow: "inset 0 2px 0 rgba(255,255,255,0.08), inset 0 -2px 0 rgba(0,0,0,0.3)",
  textShadow: "1px 1px 0 #1a1a1a",
};

export default function Home() {
  const [showOptions, setShowOptions] = useState(false);
  const [showQuit, setShowQuit] = useState(false);

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden select-none">
      {/* === PANORAMA BACKGROUND (full-screen CSS landscape) === */}

      {/* Sky — deep blue to orange sunset gradient filling entire screen */}
      <div className="absolute inset-0" style={{
        background: "linear-gradient(180deg, #0b0e2a 0%, #1a1040 10%, #3a1858 20%, #7a2848 30%, #c04a28 40%, #e87830 48%, #f0a040 54%, #80b860 60%, #50a048 66%, #357a38 72%, #2a5a2e 80%, #1a3a1a 100%)",
      }} />

      {/* Sun glow */}
      <div className="absolute" style={{
        top: "38%", left: "50%", transform: "translate(-50%, -50%)",
        width: 200, height: 200, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(255,200,80,0.4) 0%, rgba(255,150,50,0.15) 40%, transparent 70%)",
      }} />

      {/* Far mountain silhouette layer */}
      <div className="absolute bottom-[38%] left-0 right-0 h-[20%]" style={{
        background: "linear-gradient(to bottom, transparent 0%, rgba(30,50,30,0.5) 60%, rgba(30,50,30,0.7) 100%)",
        clipPath: "polygon(0% 80%, 5% 50%, 12% 60%, 20% 30%, 28% 55%, 35% 20%, 42% 45%, 50% 25%, 58% 50%, 65% 35%, 72% 55%, 80% 30%, 88% 50%, 95% 40%, 100% 60%, 100% 100%, 0% 100%)",
      }} />

      {/* Near hill silhouette layer */}
      <div className="absolute bottom-[25%] left-0 right-0 h-[20%]" style={{
        background: "linear-gradient(to bottom, rgba(25,55,25,0.6) 0%, rgba(25,50,20,0.9) 100%)",
        clipPath: "polygon(0% 60%, 8% 40%, 15% 55%, 25% 30%, 35% 50%, 45% 20%, 55% 45%, 65% 25%, 75% 40%, 85% 30%, 92% 50%, 100% 35%, 100% 100%, 0% 100%)",
      }} />

      {/* Tree line silhouette */}
      <div className="absolute bottom-[20%] left-0 right-0 h-[15%]" style={{
        background: "rgba(20,40,20,0.95)",
        clipPath: "polygon(0% 70%, 3% 40%, 5% 60%, 7% 20%, 9% 50%, 11% 30%, 14% 55%, 16% 15%, 18% 45%, 20% 25%, 23% 50%, 25% 10%, 27% 40%, 30% 60%, 32% 25%, 35% 50%, 37% 15%, 40% 45%, 42% 30%, 45% 55%, 47% 20%, 50% 50%, 52% 30%, 55% 55%, 57% 15%, 60% 45%, 62% 25%, 65% 50%, 67% 20%, 70% 55%, 72% 30%, 75% 50%, 77% 10%, 80% 40%, 82% 55%, 85% 25%, 87% 50%, 90% 20%, 93% 45%, 95% 30%, 97% 50%, 100% 40%, 100% 100%, 0% 100%)",
      }} />

      {/* Ground — green grass layer */}
      <div className="absolute bottom-12 left-0 right-0 h-[22%] bg-[#2a5a28]" />

      {/* Dirt bar at very bottom */}
      <div className="absolute bottom-0 left-0 right-0 h-12" style={{
        background: "repeating-linear-gradient(90deg, #6b4226 0px, #7a4f2d 3px, #5c3a1e 6px, #6b4226 9px)",
        imageRendering: "pixelated",
      }} />
      <div className="absolute bottom-12 left-0 right-0 h-2 bg-[#4a8a3a]" />

      {/* Vignette */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_20%,rgba(0,0,0,0.3)_100%)]" />

      {/* === CONTENT === */}
      <div className="relative flex flex-col items-center z-10 -mt-8">
        <h1
          className="text-[72px] sm:text-[100px] md:text-[130px] font-black leading-none"
          style={{
            fontFamily: "monospace",
            color: "#e8e8e8",
            textShadow: "4px 4px 0 #4a4a4a, 7px 7px 0 #2a2a2a, 1px 1px 0 rgba(255,255,255,0.4)",
            letterSpacing: "0.04em",
            WebkitTextStroke: "1px #3a3a3a",
            paintOrder: "stroke fill",
          }}
        >
          VOXELHEIM
        </h1>
        <p className="text-base sm:text-lg font-mono text-yellow-400 -mt-1 tracking-[0.2em]" style={{ textShadow: "2px 2px 0 #2a1a00" }}>
          Island Edition
        </p>

        <div className="flex flex-col items-center gap-2.5 mt-10 w-[300px] sm:w-[380px]">
          <Link href="/game/create" className={MC_BTN + " w-full text-lg"} style={BTN_STYLE}>
            Play Game
          </Link>
          <div className="flex gap-2.5 w-full">
            <button onClick={() => setShowOptions(true)} className={MC_BTN + " flex-1 text-sm"} style={BTN_STYLE}>
              Options...
            </button>
            <button onClick={() => setShowQuit(true)} className={MC_BTN + " flex-1 text-sm"} style={BTN_STYLE}>
              Quit Game
            </button>
          </div>
        </div>

        <p className="mt-8 text-[11px] text-white/40 font-mono" style={{ textShadow: "1px 1px 0 #000" }}>
          Voxelheim Island Edition (v0.1.0)
        </p>
      </div>

      {showOptions && <OptionsModal onClose={() => setShowOptions(false)} />}
      {showQuit && <QuitModal onClose={() => setShowQuit(false)} />}
    </main>
  );
}
