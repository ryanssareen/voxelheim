"use client";

import dynamic from "next/dynamic";

const GameCanvas = dynamic(() => import("@ui/GameCanvas").then((m) => m.GameCanvas), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-black">
      <p className="text-white font-mono animate-pulse">Loading...</p>
    </div>
  ),
});

export default function GamePage() {
  return (
    <main className="w-screen h-screen overflow-hidden bg-black">
      <GameCanvas />
    </main>
  );
}
