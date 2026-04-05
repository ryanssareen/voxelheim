"use client";

import { useRouter } from "next/navigation";
import { useGameStore } from "@store/useGameStore";

/**
 * Pause menu overlay. Shown when isPaused is true.
 * Has pointer-events enabled for button interaction.
 */
export function PauseMenu({ canvasRef }: { canvasRef: React.RefObject<HTMLCanvasElement | null> }) {
  const isPaused = useGameStore((s) => s.isPaused);
  const setPaused = useGameStore((s) => s.setPaused);
  const router = useRouter();

  if (!isPaused) return null;

  const handleResume = () => {
    canvasRef.current?.requestPointerLock();
    setPaused(false);
  };

  const handleQuit = () => {
    router.push("/");
  };

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-30">
      <div className="flex flex-col items-center gap-6 bg-gray-900/90 rounded-lg p-10 border border-gray-700">
        <h2 className="text-3xl font-mono font-bold text-white">PAUSED</h2>

        <button
          onClick={handleResume}
          className="w-48 py-3 bg-white/10 hover:bg-white/20 text-white font-mono rounded border border-white/20 transition-colors"
        >
          Resume
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
