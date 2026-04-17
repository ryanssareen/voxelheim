"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import { useEngine } from "@hooks/useEngine";
import { useChatStore } from "@store/useChatStore";
import { useGameStore } from "@store/useGameStore";
import { useInventoryStore } from "@store/useInventoryStore";
import { HUD } from "@ui/HUD";
import { HotbarUI } from "@ui/HotbarUI";
import { PauseMenu } from "@ui/PauseMenu";
import { DeathScreen } from "@ui/DeathScreen";
import { LoadingScreen } from "@ui/LoadingScreen";
import { InventoryUI } from "@ui/InventoryUI";
import { CraftingTableUI } from "@ui/CraftingTableUI";
import { FurnaceUI } from "@ui/FurnaceUI";
import { CreativeInventoryUI } from "@ui/CreativeInventoryUI";
import { ChatUI } from "@ui/ChatUI";

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

  // Counter bump to signal ChatUI to open on T keypress
  const [chatOpenRequest, setChatOpenRequest] = useState(0);

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

  // T-key opens chat (only when game is active and no modal UI is open)
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.code !== "KeyT") return;
      // Don't hijack T if already typing somewhere else
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;

      const gameState = useGameStore.getState();
      const invState = useInventoryStore.getState();
      const chatState = useChatStore.getState();

      if (gameState.isDead || gameState.isPaused) return;
      if (chatState.composing) return;
      if (invState.isOpen || invState.tableOpen || invState.furnaceOpen || invState.creativeOpen) return;

      event.preventDefault();
      if (document.pointerLockElement) document.exitPointerLock();
      setChatOpenRequest((n) => n + 1);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  const handleSendChat = useCallback(
    (text: string) => {
      engineRef.current?.sendChat(text);
    },
    [engineRef],
  );

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
          <FurnaceUI />
          <CreativeInventoryUI />
          <ChatUI onSend={handleSendChat} openRequest={chatOpenRequest} />
        </>
      )}
    </div>
  );
}
