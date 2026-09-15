"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import type { Engine } from "@engine/Engine";
import { PAUSE_BLOCKERS } from "@engine/input/uiIntents";
import { useIntentEdge } from "@ui/useIntentEdge";
import { useGameStore } from "@store/useGameStore";
import { useMultiplayerStore } from "@store/useMultiplayerStore";
import { useWalkthroughStore } from "@store/useWalkthroughStore";
import { useKeybindsStore } from "@store/useKeybindsStore";
import { enterPlayCapture } from "@ui/playCapture";

/**
 * Pause menu overlay. Shown when isPaused is true.
 * Has pointer-events enabled for button interaction.
 *
 * The wrapper also owns the `pause` intent, which is the whole point of where
 * it sits: the panel below is mounted only while paused, so a handler inside it
 * could never be the thing that *starts* a pause. Escape produces the intent on
 * a keyboard and U7's on-screen control produces the same one from a thumb, so
 * pausing no longer depends on a pointer lock existing to be lost (R22).
 */
export function PauseMenu({
  canvasRef,
  engineRef,
}: {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  engineRef: React.RefObject<Engine | null>;
}) {
  const isPaused = useGameStore((s) => s.isPaused);

  // `setPaused(true)`, never a toggle: on desktop a locked Escape arrives twice
  // over — once as this intent and once as the engine's lock-loss callback —
  // and a toggle would unpause behind itself. Releasing the lock here matters
  // for the triggers the browser does not handle for us (the touch control, an
  // Escape pressed with no lock held); when the browser dropped the lock
  // itself, there is nothing left to exit.
  const pause = useCallback(() => {
    if (document.pointerLockElement) document.exitPointerLock();
    useGameStore.getState().setPaused(true);
  }, []);
  // Registered unconditionally, above the early return, so the hook list never
  // varies between renders. The controls popup claims this same intent at modal
  // priority while it is open, which is how Escape closes the popup without
  // also pausing the game behind it.
  useIntentEdge(engineRef, "pause", PAUSE_BLOCKERS, pause);

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
  const debugVisible = useGameStore((s) => s.debugVisible);
  const multiplayerSession = useMultiplayerStore((s) => s.session);
  const multiplayerPlayers = useMultiplayerStore((s) => s.players);
  const [spawnSet, setSpawnSet] = useState(false);
  const router = useRouter();
  const reopenWalkthrough = useWalkthroughStore((s) => s.reopen);
  const openControls = useKeybindsStore((s) => s.open);

  const handleResume = () => {
    enterPlayCapture(canvasRef.current);
    setPaused(false);
  };

  const handleQuit = () => {
    router.push("/");
  };

  // Reachable without an account — world creation has never required sign-in,
  // it was just buried behind Quit to Menu -> My Worlds.
  const handleCreateWorld = () => {
    router.push("/game/create");
  };

  // R11: replays from step one in any world, even once completed.
  const handleShowWalkthrough = () => {
    reopenWalkthrough();
    enterPlayCapture(canvasRef.current);
    setPaused(false);
  };

  // The popup owns its own dismissal, so the game stays paused behind it.
  const handleShowControls = () => {
    openControls();
    setPaused(false);
  };

  const handleToggleGameMode = () => {
    engineRef.current?.setGameMode(gameMode === "creative" ? "survival" : "creative");
  };

  const handleSetSpawn = () => {
    if (engineRef.current?.setWorldSpawn()) setSpawnSet(true);
  };

  // The touch affordances for the two actions that have no on-screen control
  // (R23). Both are rare enough that a corner icon would not earn its place —
  // the icon column is the scarcest space on a short landscape screen — and the
  // pause menu is already where a player goes to change how the game looks.
  //
  // Neither presses an intent. An edge pushed while paused stays queued and
  // fires on the frame after resuming, so the player would close the menu and
  // only then see anything happen; both call the thing directly instead, the
  // way the game-mode switch above already does.
  const handleCycleCamera = () => {
    engineRef.current?.cycleCameraMode();
  };

  const handleToggleDebug = () => {
    useGameStore.getState().toggleDebug();
  };

  const handleCopyCode = async () => {
    if (!multiplayerSession) return;
    try {
      await navigator.clipboard.writeText(multiplayerSession.code);
    } catch {
      // Ignore clipboard failures on locked-down browsers.
    }
  };

  const secondaryButtonClass =
    "w-full py-2 bg-white/5 hover:bg-white/15 text-white/80 hover:text-white font-mono text-sm rounded border border-white/10 transition-colors";

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-30 p-6">
      <div className="flex max-h-full w-full max-w-md flex-col items-stretch gap-4 overflow-y-auto rounded-lg border border-gray-700 bg-gray-900/90 p-6 sm:max-w-xl">
        <h2 className="text-center text-2xl font-mono font-bold tracking-wide text-white">
          PAUSED
        </h2>

        {multiplayerSession && (
          <div className="rounded border border-cyan-400/20 bg-cyan-500/5 p-3 text-center">
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
          className="w-full py-3 bg-white/10 hover:bg-white/20 text-white font-mono rounded border border-white/20 transition-colors"
        >
          Resume
        </button>

        {/* Two columns on wider screens: gameplay actions on the left,
            reference/navigation on the right. Stacks to one column when
            narrow (the sm:max-w-xl panel width still fits on a phone). */}
        <div className="grid grid-cols-1 gap-x-6 gap-y-4 border-t border-white/10 pt-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/35">
              Game
            </p>
            {gameMode !== "hardcore" && (
              <button onClick={handleToggleGameMode} className={secondaryButtonClass}>
                {gameMode === "creative" ? "Switch to Survival" : "Switch to Creative"}
              </button>
            )}
            <button onClick={handleSetSpawn} className={secondaryButtonClass}>
              {spawnSet ? "Spawn set!" : "Set Spawn Here"}
            </button>
            <button onClick={handleCycleCamera} className={secondaryButtonClass}>
              Change Camera
            </button>
            <button onClick={handleToggleDebug} className={secondaryButtonClass}>
              {debugVisible ? "Hide Debug Info" : "Debug Info"}
            </button>
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/35">
              Reference
            </p>
            <button onClick={handleShowWalkthrough} className={secondaryButtonClass}>
              How to Play
            </button>
            <button onClick={handleShowControls} className={secondaryButtonClass}>
              Controls
            </button>
            <button onClick={handleCreateWorld} className={secondaryButtonClass}>
              Create New World
            </button>
          </div>
        </div>

        <button
          onClick={handleQuit}
          className="w-full py-3 bg-white/5 hover:bg-red-900/30 text-white/60 hover:text-white font-mono rounded border border-white/10 transition-colors"
        >
          Quit to Menu
        </button>
      </div>
    </div>
  );
}
