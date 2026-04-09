"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@store/useAuthStore";

const MC_BTN =
  "block text-center py-2.5 text-white font-mono tracking-wide hover:brightness-125 active:brightness-90 transition-all select-none";
const MC_BTN_STYLE: React.CSSProperties = {
  background:
    "linear-gradient(to bottom, #7a7a7a 0%, #5a5a5a 40%, #484848 60%, #3a3a3a 100%)",
  border: "3px solid #1a1a1a",
  boxShadow:
    "inset 0 2px 0 rgba(255,255,255,0.15), inset 0 -2px 0 rgba(0,0,0,0.3), 0 3px 6px rgba(0,0,0,0.4)",
  textShadow: "2px 2px 0 #2a2a2a",
};

const GAME_MODES = ["Survival", "Creative"] as const;

const WORLD_TYPES = [
  { name: "Island", desc: "A small island surrounded by ocean", color: "#4a8a3a" },
  { name: "Flat", desc: "Flat terrain stretching to the edges", color: "#8a7a3a" },
  { name: "Infinite", desc: "Endless procedural terrain in all directions", color: "#3a6a8a" },
] as const;

export default function CreateWorldPage() {
  const router = useRouter();
  const [worldName, setWorldName] = useState("New World");
  const [seed, setSeed] = useState("");
  const [gameMode, setGameMode] = useState(0);
  const [worldType, setWorldType] = useState(0);
  const [startMultiplayer, setStartMultiplayer] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const user = useAuthStore((state) => state.user);

  const handleCreate = async () => {
    setCreating(true);
    setError("");

    try {
      const actualSeed = seed || Math.random().toString(36).slice(2, 10);
      const actualWorldType = WORLD_TYPES[worldType].name.toLowerCase() as
        | "island"
        | "flat"
        | "infinite";

      const { generateWorldId, saveWorld } = await import(
        "@systems/persistence/WorldStorage"
      );
      const id = generateWorldId();
      const spawnPos = actualWorldType === "infinite"
        ? { x: 64, y: 50, z: 64 }
        : actualWorldType === "flat"
          ? { x: 32, y: 35, z: 32 }
          : { x: 32, y: 50, z: 32 };

      await saveWorld(
        {
          id,
          name: worldName,
          seed: actualSeed,
          createdAt: Date.now(),
          lastPlayedAt: Date.now(),
          playerPos: spawnPos,
          playerYaw: 0,
          playerPitch: 0,
          shardsCollected: 0,
          hotbarSlots: Array.from({ length: 8 }, () => ({ blockId: 0, count: 0 })),
          worldType: actualWorldType,
        },
        new Map()
      );

      sessionStorage.setItem(
        "voxelheim-world-config",
        JSON.stringify({ seed: actualSeed, worldType: actualWorldType })
      );

      if (startMultiplayer) {
        const { createMultiplayerSession } = await import(
          "@lib/multiplayer/sessionClient"
        );
        const session = await createMultiplayerSession({
          seed: actualSeed,
          worldType: actualWorldType,
          worldName,
          hostName: user?.email?.split("@")[0] ?? "Host",
        });
        router.push(`/game?worldId=${id}&session=${session.code}`);
        return;
      }

      router.push(`/game?worldId=${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create world");
      setCreating(false);
    }
  };

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden select-none bg-[#1a1a1a]">
      {/* Background */}
      <div className="absolute inset-0" style={{
        background: "linear-gradient(180deg, #0b0e2a 0%, #1a1a2e 30%, #1a1a1a 60%)",
      }} />
      <div
        className="absolute inset-0 opacity-10"
        style={{
          background:
            "repeating-linear-gradient(90deg, #6b4226 0px, #7a4f2d 4px, #5c3a1e 8px, #6b4226 12px), repeating-linear-gradient(0deg, #6b4226 0px, #7a4f2d 4px, #5c3a1e 8px, #6b4226 12px)",
          backgroundSize: "12px 12px",
          imageRendering: "pixelated",
        }}
      />

      <div className="relative z-10 flex flex-col items-center w-full max-w-[480px] px-4 animate-fadeIn">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8 w-full">
          <Link
            href="/worlds"
            className="text-white/40 hover:text-white/70 font-mono text-sm transition-colors"
            style={{ textShadow: "1px 1px 0 #000" }}
          >
            &larr; Back
          </Link>
          <h1
            className="text-2xl font-mono font-bold text-white flex-1 text-center"
            style={{ textShadow: "2px 2px 0 #000" }}
          >
            Create World
          </h1>
          <div className="w-12" />
        </div>

        {/* World Name */}
        <div className="w-full mb-4">
          <label
            className="block text-white/50 font-mono text-xs mb-1.5 uppercase tracking-wider"
            style={{ textShadow: "1px 1px 0 #000" }}
          >
            World Name
          </label>
          <input
            type="text"
            value={worldName}
            onChange={(e) => setWorldName(e.target.value)}
            className="w-full py-2.5 px-3 bg-black/40 border-2 border-white/8 text-white font-mono text-sm focus:outline-none focus:border-white/20 transition-colors rounded-sm"
            style={{
              boxShadow: "inset 0 2px 4px rgba(0,0,0,0.3)",
              textShadow: "1px 1px 0 #000",
            }}
          />
        </div>

        {/* Seed */}
        <div className="w-full mb-6">
          <label
            className="block text-white/50 font-mono text-xs mb-1.5 uppercase tracking-wider"
            style={{ textShadow: "1px 1px 0 #000" }}
          >
            Seed
          </label>
          <input
            type="text"
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
            placeholder="Leave blank for random"
            className="w-full py-2.5 px-3 bg-black/40 border-2 border-white/8 text-white font-mono text-sm placeholder:text-white/15 focus:outline-none focus:border-white/20 transition-colors rounded-sm"
            style={{
              boxShadow: "inset 0 2px 4px rgba(0,0,0,0.3)",
              textShadow: "1px 1px 0 #000",
            }}
          />
        </div>

        {/* World Type selector */}
        <div className="w-full mb-4">
          <label
            className="block text-white/50 font-mono text-xs mb-2 uppercase tracking-wider"
            style={{ textShadow: "1px 1px 0 #000" }}
          >
            World Type
          </label>
          <div className="flex gap-2">
            {WORLD_TYPES.map((wt, i) => (
              <button
                key={wt.name}
                onClick={() => setWorldType(i)}
                className="flex-1 py-2.5 font-mono text-sm transition-all"
                style={{
                  background: i === worldType
                    ? `linear-gradient(to bottom, ${wt.color} 0%, ${wt.color}cc 100%)`
                    : "rgba(255,255,255,0.03)",
                  border: i === worldType
                    ? `2px solid ${wt.color}`
                    : "2px solid rgba(255,255,255,0.06)",
                  color: i === worldType ? "#fff" : "rgba(255,255,255,0.4)",
                  textShadow: i === worldType ? "1px 1px 0 rgba(0,0,0,0.5)" : "none",
                }}
              >
                {wt.name}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11px] font-mono text-white/25 text-center"
             style={{ textShadow: "1px 1px 0 #000" }}>
            {WORLD_TYPES[worldType].desc}
          </p>
        </div>

        {/* Game Mode */}
        <button
          onClick={() => setGameMode((m) => (m + 1) % GAME_MODES.length)}
          className="w-full py-2.5 text-white/40 font-mono text-sm tracking-wide mb-4 transition-all cursor-not-allowed"
          style={{
            background: "rgba(255,255,255,0.02)",
            border: "2px solid rgba(255,255,255,0.04)",
          }}
        >
          Game Mode: {GAME_MODES[gameMode]}
        </button>

        {/* Multiplayer toggle */}
        <div
          className="w-full mb-6 p-3 rounded-sm transition-all"
          style={{
            background: startMultiplayer ? "rgba(0,200,255,0.05)" : "rgba(255,255,255,0.02)",
            border: startMultiplayer ? "2px solid rgba(0,200,255,0.15)" : "2px solid rgba(255,255,255,0.04)",
          }}
        >
          <button
            onClick={() => setStartMultiplayer((v) => !v)}
            className="w-full flex items-center justify-between font-mono text-sm"
          >
            <span className="flex items-center gap-2">
              <span
                className="w-3 h-3 rounded-full transition-colors"
                style={{
                  background: startMultiplayer ? "#00d4ff" : "rgba(255,255,255,0.15)",
                  boxShadow: startMultiplayer ? "0 0 8px rgba(0,200,255,0.4)" : "none",
                }}
              />
              <span style={{ color: startMultiplayer ? "#00d4ff" : "rgba(255,255,255,0.5)" }}>
                Multiplayer
              </span>
            </span>
            <span style={{ color: startMultiplayer ? "#00d4ff" : "rgba(255,255,255,0.3)" }}>
              {startMultiplayer ? "ON" : "OFF"}
            </span>
          </button>
          <p className="mt-2 text-[11px] font-mono text-white/25 ml-5"
             style={{ textShadow: "1px 1px 0 #000" }}>
            {startMultiplayer
              ? "Friends can join from the session code shown in-game."
              : "Create a solo world. You can host it later from the worlds list."}
          </p>
        </div>

        {error && (
          <p className="w-full mb-4 text-center text-xs font-mono text-red-300">{error}</p>
        )}

        {/* Action buttons */}
        <div className="flex gap-2.5 w-full">
          <button
            onClick={() => void handleCreate()}
            disabled={creating}
            className={MC_BTN + " flex-1 text-base"}
            style={{
              ...MC_BTN_STYLE,
              background: creating
                ? "linear-gradient(to bottom, #5a5a5a 0%, #3a3a3a 100%)"
                : "linear-gradient(to bottom, #5a9a4a 0%, #3a7a2a 40%, #2a6a1a 60%, #1a5a0a 100%)",
              opacity: creating ? 0.7 : 1,
            }}
          >
            {creating ? "Creating..." : "Create World"}
          </button>
          <button
            onClick={() => router.push("/worlds")}
            className={MC_BTN + " w-28 text-sm"}
            style={MC_BTN_STYLE}
          >
            Cancel
          </button>
        </div>
      </div>
    </main>
  );
}
