"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import { useEngine } from "@hooks/useEngine";
import { CHAT_OPEN_BLOCKERS } from "@engine/input/uiIntents";
import { useIntentEdge } from "@ui/useIntentEdge";
import { HUD } from "@ui/HUD";
import { enterPlayCapture } from "@ui/playCapture";
import { MinimapUI } from "@ui/MinimapUI";
import { HotbarUI } from "@ui/HotbarUI";
import { PauseMenu } from "@ui/PauseMenu";
import { DeathScreen } from "@ui/DeathScreen";
import { LoadingScreen } from "@ui/LoadingScreen";
import { InventoryUI } from "@ui/InventoryUI";
import { CraftingTableUI } from "@ui/CraftingTableUI";
import { FurnaceUI } from "@ui/FurnaceUI";
import { CreativeInventoryUI } from "@ui/CreativeInventoryUI";
import { Walkthrough } from "@ui/Walkthrough";
import { KeybindsPopup } from "@ui/KeybindsPopup";
import { ChatUI } from "@ui/ChatUI";

export function GameCanvas({
  worldId,
  sessionId,
}: {
  worldId?: string;
  sessionId?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { isLoading, isReady, error, start, engineRef } = useEngine(canvasRef);
  const startedRef = useRef(false);

  useEffect(() => {
    if (!startedRef.current) {
      startedRef.current = true;
      start({ worldId, sessionId });
    }
  }, [start, worldId, sessionId]);

  const handleCanvasClick = useCallback(() => {
    enterPlayCapture(canvasRef.current);
  }, []);

  const handleRespawn = useCallback(() => {
    engineRef.current?.respawn();
  }, [engineRef]);

  // Counter bump to signal ChatUI to open on T keypress
  const [chatOpenRequest, setChatOpenRequest] = useState(0);

  // Measure the container, never the canvas. three.js used to write an inline
  // width/height onto the canvas, so measuring the canvas fed its own last
  // resize back in — one zero measurement (background tab, pre-layout mount)
  // locked it at 0x0 forever. A ResizeObserver also recovers from a zero-sized
  // mount, which a window "resize" listener never sees.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;

    const applySize = () => {
      const engine = engineRef.current;
      if (!engine) return;
      engine.renderer?.resize(container.clientWidth, container.clientHeight);
    };

    const observer = new ResizeObserver(applySize);
    observer.observe(container);
    applySize();

    return () => observer.disconnect();
  }, [engineRef, isReady]);

  // Chat opens on the `openChat` intent (T on a keyboard). The guards that used
  // to live inline here — dead, paused, already composing, a panel open — are
  // now declared as CHAT_OPEN_BLOCKERS, and the "don't hijack T while typing"
  // check moved down into InputManager, which never produces an intent for a
  // keypress aimed at a text field.
  //
  // Gated on `isReady` because this effect runs from the first render, before
  // the engine (and therefore the intent state) exists.
  const openChat = useCallback(() => {
    if (document.pointerLockElement) document.exitPointerLock();
    setChatOpenRequest((n) => n + 1);
  }, []);
  useIntentEdge(engineRef, "openChat", CHAT_OPEN_BLOCKERS, openChat, { enabled: isReady });

  const handleSendChat = useCallback(
    (text: string) => {
      engineRef.current?.sendChat(text);
    },
    [engineRef],
  );

  return (
    <div ref={containerRef} className="relative w-full h-full">
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
          <HUD engineRef={engineRef} />
          <MinimapUI engineRef={engineRef} />
          <HotbarUI />
          <PauseMenu canvasRef={canvasRef} engineRef={engineRef} />
          <DeathScreen onRespawn={handleRespawn} />
          <InventoryUI />
          <CraftingTableUI />
          <FurnaceUI />
          <CreativeInventoryUI />
          <ChatUI onSend={handleSendChat} openRequest={chatOpenRequest} />
          <Walkthrough worldId={worldId} engineRef={engineRef} />
          <KeybindsPopup worldId={worldId} engineRef={engineRef} />
        </>
      )}
    </div>
  );
}
