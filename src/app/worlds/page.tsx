"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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

const WORLD_TYPE_COLORS: Record<string, string> = {
  island: "#4a8a3a",
  flat: "#8a7a3a",
  infinite: "#3a6a8a",
};

const WORLD_TYPE_ICONS: Record<string, string> = {
  island: "\u{1F3DD}\uFE0F",
  flat: "\u{1F33E}",
  infinite: "\u{1F30D}",
};

function formatDate(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  if (diff < 60_000) return "Just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

export default function WorldsPage() {
  const router = useRouter();
  const [worlds, setWorlds] = useState<WorldMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [joinCode, setJoinCode] = useState("");
  const [joinError, setJoinError] = useState("");
  const [busyWorldId, setBusyWorldId] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const { user, loading: authLoading } = useAuthStore();

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/login");
    }
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!user) return;
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

  const handleHost = async (world: WorldMeta) => {
    setBusyWorldId(world.id);
    setJoinError("");

    try {
      const { createMultiplayerSession } = await import(
        "@lib/multiplayer/sessionClient"
      );
      const session = await createMultiplayerSession({
        seed: world.seed,
        worldType:
          world.worldType === "flat" || world.worldType === "infinite"
            ? world.worldType
            : "island",
        worldName: world.name,
        hostName: user?.email?.split("@")[0] ?? "Host",
      });

      if (session.transport === "local") {
        setJoinError(
          "Cloud unavailable — session is local-only (same browser tabs only)."
        );
      }

      router.push(`/game?worldId=${world.id}&session=${session.code}`);
    } catch (error) {
      setJoinError(
        error instanceof Error ? error.message : "Failed to host session"
      );
    } finally {
      setBusyWorldId(null);
    }
  };

  const handleJoin = async () => {
    const code = joinCode.trim().toUpperCase();
    if (!code) {
      setJoinError("Enter a session code first.");
      return;
    }

    setJoining(true);
    setJoinError("");

    try {
      const { readMultiplayerSession } = await import(
        "@lib/multiplayer/sessionClient"
      );
      const { isLocalSessionCode } = await import(
        "@lib/multiplayer/sessionCode"
      );
      const session = await readMultiplayerSession(code);
      console.log("[join] session result:", session);
      if (!session) {
        if (isLocalSessionCode(code)) {
          setJoinError(
            "This is a local session code. It can only be joined from the same browser that created it."
          );
        } else {
          setJoinError("Session not found. Double-check the code.");
        }
        return;
      }

      sessionStorage.setItem(
        "voxelheim-world-config",
        JSON.stringify({
          seed: session.seed,
          worldType: session.worldType,
        })
      );

      router.push(`/game?session=${session.code}`);
    } catch (error) {
      setJoinError(
        error instanceof Error ? error.message : "Failed to join session"
      );
    } finally {
      setJoining(false);
    }
  };

  return (
    <main className="relative flex min-h-screen flex-col items-center overflow-hidden select-none bg-[#1a1a1a]">
      {/* Background gradient */}
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

      <div className="relative z-10 w-full max-w-[640px] px-4 pt-10 pb-8 animate-fadeIn">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <Link
            href="/"
            className="text-white/40 hover:text-white/70 font-mono text-sm transition-colors"
            style={{ textShadow: "1px 1px 0 #000" }}
          >
            &larr; Back
          </Link>
          <h1
            className="text-2xl font-mono font-bold text-white"
            style={{ textShadow: "2px 2px 0 #000" }}
          >
            Your Worlds
          </h1>
          <div className="w-12" />
        </div>

        {/* World list */}
        {loading ? (
          <div className="flex flex-col items-center py-16 gap-3">
            <div className="w-8 h-8 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
            <p className="text-white/40 font-mono text-sm">Loading worlds...</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2 mb-6">
            {worlds.length === 0 && (
              <div className="flex flex-col items-center py-12 gap-4">
                <div className="text-4xl opacity-40">
                  {"\u{26CF}\uFE0F"}
                </div>
                <p
                  className="text-white/30 font-mono text-sm"
                  style={{ textShadow: "1px 1px 0 #000" }}
                >
                  No worlds yet &mdash; create one below
                </p>
              </div>
            )}

            {worlds.map((world, i) => {
              const wt = world.worldType ?? "island";
              return (
                <div
                  key={world.id}
                  className="group flex items-center gap-3 p-3 hover:brightness-125 transition-all cursor-pointer rounded-sm"
                  style={{
                    background:
                      "linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)",
                    border: "2px solid rgba(255,255,255,0.06)",
                    animationDelay: `${i * 50}ms`,
                  }}
                  onClick={() =>
                    router.push(`/game?worldId=${world.id}`)
                  }
                >
                  {/* World type icon */}
                  <div
                    className="w-12 h-12 rounded flex items-center justify-center flex-shrink-0"
                    style={{ background: WORLD_TYPE_COLORS[wt] ?? "#4a4a4a" }}
                  >
                    <span className="text-2xl">{WORLD_TYPE_ICONS[wt] ?? "\u{1F30D}"}</span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <p
                      className="text-white font-mono text-sm font-bold truncate"
                      style={{ textShadow: "1px 1px 0 #000" }}
                    >
                      {world.name}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span
                        className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded-sm"
                        style={{
                          background: WORLD_TYPE_COLORS[wt] ?? "#4a4a4a",
                          color: "rgba(255,255,255,0.8)",
                        }}
                      >
                        {wt}
                      </span>
                      <span className="text-white/30 font-mono text-xs">
                        {formatDate(world.lastPlayedAt)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleHost(world);
                      }}
                      className="text-cyan-300 hover:text-cyan-100 font-mono text-xs px-2.5 py-1.5 rounded-sm transition-colors"
                      style={{
                        background: "rgba(0,200,255,0.08)",
                        border: "1px solid rgba(0,200,255,0.15)",
                      }}
                    >
                      {busyWorldId === world.id ? "..." : "Host"}
                    </button>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(world.id);
                      }}
                      className="text-red-400/60 hover:text-red-400 font-mono text-xs px-2 py-1.5 transition-colors"
                    >
                      {"\u00D7"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Join multiplayer */}
        <div
          className="mb-6 p-4 rounded-sm"
          style={{
            background: "rgba(0,200,255,0.03)",
            border: "2px solid rgba(0,200,255,0.08)",
          }}
        >
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2 h-2 rounded-full bg-cyan-400/60" />
            <p
              className="text-xs font-mono text-cyan-200/70 uppercase tracking-wider"
              style={{ textShadow: "1px 1px 0 #000" }}
            >
              Join Multiplayer
            </p>
          </div>
          <div className="flex gap-2">
            <input
              value={joinCode}
              onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
              placeholder="Session code..."
              className="flex-1 bg-black/40 border-2 border-white/8 px-3 py-2 text-sm text-white font-mono uppercase focus:outline-none focus:border-cyan-400/30 transition-colors rounded-sm"
              style={{
                boxShadow: "inset 0 2px 4px rgba(0,0,0,0.3)",
                textShadow: "1px 1px 0 #000",
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleJoin();
              }}
            />
            <button
              onClick={() => void handleJoin()}
              className={MC_BTN + " min-w-24 text-sm"}
              style={MC_BTN_STYLE}
            >
              {joining ? "..." : "Join"}
            </button>
          </div>
          {joinError && (
            <p className="mt-2 text-center text-[11px] font-mono text-red-300">
              {joinError}
            </p>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex gap-2.5">
          <button
            onClick={() => router.push("/game/create")}
            className={MC_BTN + " flex-1 text-base"}
            style={{
              ...MC_BTN_STYLE,
              background:
                "linear-gradient(to bottom, #5a9a4a 0%, #3a7a2a 40%, #2a6a1a 60%, #1a5a0a 100%)",
            }}
          >
            + Create New World
          </button>
          <button
            onClick={() => router.push("/")}
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
