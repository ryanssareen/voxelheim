"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { useEngine } from "@hooks/useEngine";
import { HUD } from "@ui/HUD";
import { HotbarUI } from "@ui/HotbarUI";
import { PauseMenu } from "@ui/PauseMenu";
import { LoadingScreen } from "@ui/LoadingScreen";

/**
 * Main game canvas component. Renders the WebGL canvas and all UI overlays.
 */
export function GameCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { isLoading, isReady, error, start, engineRef } = useEngine(canvasRef);
  const [showOverlay, setShowOverlay] = useState(true);

  const handleClick = useCallback(() => {
    if (showOverlay) {
      setShowOverlay(false);
      start();
    }
  }, [showOverlay, start]);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      const engine = engineRef.current;
      if (!canvas || !engine) return;
      engine.renderer?.resize(canvas.clientWidth, canvas.clientHeight);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [engineRef]);

  return (
    <div className="relative w-full h-full">
      <canvas
        ref={canvasRef}
        className="w-full h-full block bg-black"
        onClick={handleClick}
      />

      {/* Click to Play overlay */}
      {showOverlay && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/90 z-20 cursor-pointer">
          <p className="text-white text-2xl font-mono animate-pulse">
            Click to Play
          </p>
        </div>
      )}

      {/* Loading */}
      <LoadingScreen visible={isLoading} />

      {/* Error */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black z-20">
          <p className="text-red-400 font-mono text-sm">Error: {error}</p>
        </div>
      )}

      {/* Game UI (only when ready) */}
      {isReady && (
        <>
          <HUD />
          <HotbarUI />
          <PauseMenu canvasRef={canvasRef} />
        </>
      )}
    </div>
  );
}
