"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Engine } from "@engine/Engine";
import { useGameStore } from "@store/useGameStore";
import { useMultiplayerStore } from "@store/useMultiplayerStore";

/**
 * Pause menu overlay. Shown when isPaused is true.
 * Has pointer-events enabled for button interaction.
 */
export function PauseMenu({
  canvasRef,
  engineRef,
}: {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  engineRef: React.RefObject<Engine | null>;
}) {
  const isPaused = useGameStore((s) => s.isPaused);

  // Mount the panel only while paused so transient state (e.g. the
  // "Spawn set!" confirmation) resets each time the menu opens
  if (!isPaused) return null;
  return <PausePanel canvasRef={canvasRef} engineRef={engineRef} />;
}

function PausePanel({
  canvasRef,
  engineRef,
}: {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  engineRef: React.RefObject<Engine | null>;
}) {
  const setPaused = useGameStore((s) => s.setPaused);
  const gameMode = useGameStore((s) => s.gameMode);
  const multiplayerSession = useMultiplayerStore((s) => s.session);
  const multiplayerPlayers = useMultiplayerStore((s) => s.players);
  const [spawnSet, setSpawnSet] = useState(false);
  const router = useRouter();

  const handleResume = () => {
    canvasRef.current?.requestPointerLock();
    setPaused(false);
  };

  const handleQuit = () => {
    router.push("/");
  };

  const handleToggleGameMode = () => {
    engineRef.current?.setGameMode(gameMode === "creative" ? "survival" : "creative");
  };

  const handleSetSpawn = () => {
    if (engineRef.current?.setWorldSpawn()) setSpawnSet(true);
  };

  const handleCopyCode = async () => {
    if (!multiplayerSession) return;
    try {
      await navigator.clipboard.writeText(multiplayerSession.code);
    } catch {
      // Ignore clipboard failures on locked-down browsers.
    }
  };

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-30">
      <div className="flex flex-col items-center gap-6 bg-gray-900/90 rounded-lg p-10 border border-gray-700">
        <h2 className="text-3xl font-mono font-bold text-white">PAUSED</h2>

        {multiplayerSession && (
          <div className="w-64 rounded border border-cyan-400/20 bg-cyan-500/5 p-3 text-center">
            <p className="text-[10px] font-mono uppercase tracking-[0.24em] text-cyan-200/80">
              {multiplayerSession.transport === "local"
                ? "Local Co-op"
                : "Session Code"}
            </p>
            <p className="mt-1 font-mono text-xl font-bold text-white">
              {multiplayerSession.code}
            </p>
            <p className="mt-1 text-xs font-mono text-white/45">
              {multiplayerPlayers.length} player
              {multiplayerPlayers.length === 1 ? "" : "s"} connected
            </p>
            <button
              onClick={() => void handleCopyCode()}
              className="mt-3 w-full rounded border border-white/10 bg-white/5 py-2 text-sm font-mono text-white/80 transition-colors hover:bg-white/10"
            >
              Copy Code
            </button>
          </div>
        )}

        <button
          onClick={handleResume}
          className="w-48 py-3 bg-white/10 hover:bg-white/20 text-white font-mono rounded border border-white/20 transition-colors"
        >
          Resume
        </button>

        {gameMode !== "hardcore" && (
          <button
            onClick={handleToggleGameMode}
            className="w-48 py-2 bg-white/5 hover:bg-white/15 text-white/80 hover:text-white font-mono text-sm rounded border border-white/10 transition-colors"
          >
            {gameMode === "creative" ? "Switch to Survival" : "Switch to Creative"}
          </button>
        )}

        <button
          onClick={handleSetSpawn}
          className="w-48 py-2 bg-white/5 hover:bg-white/15 text-white/80 hover:text-white font-mono text-sm rounded border border-white/10 transition-colors"
        >
          {spawnSet ? "Spawn set!" : "Set Spawn Here"}
        </button>

        <button
          onClick={handleQuit}
          className="w-48 py-3 bg-white/5 hover:bg-red-900/30 text-white/60 hover:text-white font-mono rounded border border-white/10 transition-colors"
        >
          Quit to Menu
        </button>
      </div>
    </div>
  );
}
