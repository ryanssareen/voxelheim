"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const MC_BUTTON =
  "block w-full text-center py-2.5 text-white font-mono tracking-wide hover:brightness-125 active:brightness-90 transition-all select-none";
const MC_BUTTON_STYLE = {
  background:
    "linear-gradient(to bottom, #7a7a7a 0%, #5a5a5a 40%, #484848 60%, #3a3a3a 100%)",
  border: "3px solid #1a1a1a",
  boxShadow:
    "inset 0 2px 0 rgba(255,255,255,0.15), inset 0 -2px 0 rgba(0,0,0,0.3), 0 3px 6px rgba(0,0,0,0.4)",
  textShadow: "2px 2px 0 #2a2a2a",
};

const MC_DISABLED_STYLE = {
  background:
    "linear-gradient(to bottom, #5a5a5a 0%, #3a3a3a 40%, #2e2e2e 60%, #222 100%)",
  border: "3px solid #1a1a1a",
  boxShadow:
    "inset 0 2px 0 rgba(255,255,255,0.08), inset 0 -2px 0 rgba(0,0,0,0.3)",
  textShadow: "1px 1px 0 #1a1a1a",
};

const GAME_MODES = ["Survival", "Creative"];
const WORLD_TYPES = ["Island", "Flat", "Infinite"];

export default function CreateWorldPage() {
  const router = useRouter();
  const [worldName, setWorldName] = useState("New World");
  const [seed, setSeed] = useState("");
  const [gameMode, setGameMode] = useState(0);
  const [worldType, setWorldType] = useState(0);

  const handleCreate = () => {
    // Store config in sessionStorage for the game page to read
    const config = {
      worldName,
      seed: seed || "voxelheim-mvp",
      gameMode: GAME_MODES[gameMode],
      worldType: WORLD_TYPES[worldType],
    };
    sessionStorage.setItem("voxelheim-world-config", JSON.stringify(config));
    router.push("/game");
  };

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden select-none bg-[#2a2a2a]">
      {/* Dirt background texture */}
      <div
        className="absolute inset-0 opacity-30"
        style={{
          background:
            "repeating-linear-gradient(90deg, #6b4226 0px, #7a4f2d 4px, #5c3a1e 8px, #6b4226 12px), repeating-linear-gradient(0deg, #6b4226 0px, #7a4f2d 4px, #5c3a1e 8px, #6b4226 12px)",
          backgroundSize: "12px 12px",
          imageRendering: "pixelated",
        }}
      />

      <div className="relative z-10 flex flex-col items-center w-full max-w-[480px] px-4">
        <h1
          className="text-3xl font-mono font-bold text-white mb-8"
          style={{ textShadow: "2px 2px 0 #2a2a2a" }}
        >
          Create New World
        </h1>

        {/* World Name */}
        <div className="w-full mb-4">
          <label
            className="block text-white/60 font-mono text-sm mb-1"
            style={{ textShadow: "1px 1px 0 #000" }}
          >
            World Name
          </label>
          <input
            type="text"
            value={worldName}
            onChange={(e) => setWorldName(e.target.value)}
            className="w-full py-2 px-3 bg-black/60 border-2 border-[#1a1a1a] text-white font-mono text-sm focus:outline-none focus:border-white/30"
            style={{
              boxShadow: "inset 0 2px 4px rgba(0,0,0,0.5)",
              textShadow: "1px 1px 0 #000",
            }}
          />
        </div>

        {/* Seed */}
        <div className="w-full mb-6">
          <label
            className="block text-white/60 font-mono text-sm mb-1"
            style={{ textShadow: "1px 1px 0 #000" }}
          >
            Seed (leave blank for random)
          </label>
          <input
            type="text"
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
            placeholder="Enter seed..."
            className="w-full py-2 px-3 bg-black/60 border-2 border-[#1a1a1a] text-white font-mono text-sm placeholder:text-white/20 focus:outline-none focus:border-white/30"
            style={{
              boxShadow: "inset 0 2px 4px rgba(0,0,0,0.5)",
              textShadow: "1px 1px 0 #000",
            }}
          />
        </div>

        {/* Game Mode toggle */}
        <button
          onClick={() => setGameMode((m) => (m + 1) % GAME_MODES.length)}
          className="w-full py-2.5 text-white font-mono text-sm tracking-wide mb-2 hover:brightness-125 active:brightness-90 transition-all"
          style={MC_DISABLED_STYLE}
        >
          Game Mode: {GAME_MODES[gameMode]}
        </button>

        {/* World Type toggle */}
        <button
          onClick={() => setWorldType((t) => (t + 1) % WORLD_TYPES.length)}
          className="w-full py-2.5 text-white/50 font-mono text-sm tracking-wide mb-6 cursor-not-allowed"
          style={MC_DISABLED_STYLE}
        >
          World Type: {WORLD_TYPES[worldType]}
        </button>

        {/* Action buttons */}
        <div className="flex gap-2.5 w-full">
          <button
            onClick={handleCreate}
            className={MC_BUTTON + " flex-1 text-base"}
            style={MC_BUTTON_STYLE}
          >
            Create World
          </button>
          <button
            onClick={() => router.push("/")}
            className={MC_BUTTON + " flex-1 text-sm"}
            style={MC_BUTTON_STYLE}
          >
            Cancel
          </button>
        </div>
      </div>
    </main>
  );
}
