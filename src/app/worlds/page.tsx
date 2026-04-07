"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { WorldMeta } from "@systems/persistence/WorldStorage";
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

export default function WorldsPage() {
  const router = useRouter();
  const [worlds, setWorlds] = useState<WorldMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const { user, loading: authLoading, configured } = useAuthStore();

  useEffect(() => {
    if (configured && !authLoading && !user) {
      router.replace("/login");
    }
  }, [authLoading, user, configured, router]);

  useEffect(() => {
    if (configured && !user) return;
    import("@systems/persistence/WorldStorage").then(async (mod) => {
      const list = await mod.listWorlds();
      setWorlds(list);
      setLoading(false);
    });
  }, [user]);

  const handleDelete = async (worldId: string) => {
    if (!confirm("Delete this world? This cannot be undone.")) return;
    const mod = await import("@systems/persistence/WorldStorage");
    await mod.deleteWorld(worldId);
    setWorlds((w) => w.filter((x) => x.id !== worldId));
  };

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-start overflow-hidden select-none bg-[#2a2a2a] pt-12">
      {/* Dirt bg */}
      <div
        className="absolute inset-0 opacity-20"
        style={{
          background:
            "repeating-linear-gradient(90deg, #6b4226 0px, #7a4f2d 4px, #5c3a1e 8px, #6b4226 12px), repeating-linear-gradient(0deg, #6b4226 0px, #7a4f2d 4px, #5c3a1e 8px, #6b4226 12px)",
          backgroundSize: "12px 12px",
          imageRendering: "pixelated",
        }}
      />

      <div className="relative z-10 w-full max-w-[600px] px-4">
        <h1
          className="text-3xl font-mono font-bold text-white mb-8 text-center"
          style={{ textShadow: "2px 2px 0 #2a2a2a" }}
        >
          Select World
        </h1>

        {loading ? (
          <p className="text-white/50 font-mono text-center animate-pulse">
            Loading worlds...
          </p>
        ) : (
          <div className="flex flex-col gap-2 mb-6">
            {worlds.length === 0 && (
              <p
                className="text-white/40 font-mono text-center py-8"
                style={{ textShadow: "1px 1px 0 #000" }}
              >
                No saved worlds yet
              </p>
            )}

            {worlds.map((world) => (
              <div
                key={world.id}
                className="flex items-center gap-3 p-3 hover:brightness-110 transition-all cursor-pointer"
                style={{
                  background:
                    "linear-gradient(to bottom, #4a4a4a 0%, #3a3a3a 100%)",
                  border: "2px solid #2a2a2a",
                  boxShadow:
                    "inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -1px 0 rgba(0,0,0,0.2)",
                }}
                onClick={() =>
                  router.push(`/game?worldId=${world.id}`)
                }
              >
                {/* World icon */}
                <div className="w-10 h-10 bg-[#4a7a3a] rounded flex items-center justify-center flex-shrink-0">
                  <span className="text-xl">🌍</span>
                </div>

                <div className="flex-1 min-w-0">
                  <p
                    className="text-white font-mono text-sm font-bold truncate"
                    style={{ textShadow: "1px 1px 0 #000" }}
                  >
                    {world.name}
                  </p>
                  <p className="text-white/40 font-mono text-xs">
                    Seed: {world.seed} &middot; Last played:{" "}
                    {new Date(world.lastPlayedAt).toLocaleDateString()}
                  </p>
                </div>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(world.id);
                  }}
                  className="text-red-400/60 hover:text-red-400 font-mono text-xs px-2 py-1"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2.5">
          <button
            onClick={() => router.push("/game/create")}
            className={MC_BTN + " flex-1 text-base"}
            style={MC_BTN_STYLE}
          >
            Create New World
          </button>
          <button
            onClick={() => router.push("/")}
            className={MC_BTN + " flex-1 text-sm"}
            style={MC_BTN_STYLE}
          >
            Cancel
          </button>
        </div>
      </div>
    </main>
  );
}
