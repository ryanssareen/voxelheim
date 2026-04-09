"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";

const GameCanvas = dynamic(
  () => import("@ui/GameCanvas").then((m) => m.GameCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full flex items-center justify-center bg-black">
        <p className="text-white font-mono animate-pulse">Loading...</p>
      </div>
    ),
  }
);

function GamePageInner() {
  const params = useSearchParams();
  const worldId = params.get("worldId") ?? undefined;
  const sessionId = params.get("session") ?? undefined;

  return (
    <main className="w-screen h-screen overflow-hidden bg-black">
      <GameCanvas worldId={worldId} sessionId={sessionId} />
    </main>
  );
}

export default function GamePage() {
  return (
    <Suspense
      fallback={
        <main className="w-screen h-screen overflow-hidden bg-black flex items-center justify-center">
          <p className="text-white font-mono animate-pulse">Loading...</p>
        </main>
      }
    >
      <GamePageInner />
    </Suspense>
  );
}
