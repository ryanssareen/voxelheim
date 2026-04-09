"use client";

import { useRef, useEffect, useCallback } from "react";
import { useEngine } from "@hooks/useEngine";
import { HUD } from "@ui/HUD";
import { HotbarUI } from "@ui/HotbarUI";
import { PauseMenu } from "@ui/PauseMenu";
import { DeathScreen } from "@ui/DeathScreen";
import { LoadingScreen } from "@ui/LoadingScreen";
import { InventoryUI } from "@ui/InventoryUI";
import { CraftingTableUI } from "@ui/CraftingTableUI";

export function GameCanvas({
  worldId,
  sessionId,
}: {
  worldId?: string;
  sessionId?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { isLoading, isReady, error, start, engineRef } = useEngine(canvasRef);
  const startedRef = useRef(false);

  useEffect(() => {
    if (!startedRef.current) {
      startedRef.current = true;
      start({ worldId, sessionId });
    }
  }, [start, worldId, sessionId]);

  const handleCanvasClick = useCallback(() => {
    canvasRef.current?.requestPointerLock();
  }, []);

  const handleRespawn = useCallback(() => {
    engineRef.current?.respawn();
  }, [engineRef]);

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
        className="w-full h-full block bg-black cursor-pointer"
        onClick={handleCanvasClick}
      />
      <LoadingScreen visible={isLoading || (!isReady && !error)} />
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black z-20">
          <p className="text-red-400 font-mono text-sm">Error: {error}</p>
        </div>
      )}
      {isReady && (
        <>
          <HUD />
          <HotbarUI />
          <PauseMenu canvasRef={canvasRef} />
          <DeathScreen onRespawn={handleRespawn} />
          <InventoryUI />
          <CraftingTableUI />
        </>
      )}
    </div>
  );
}
