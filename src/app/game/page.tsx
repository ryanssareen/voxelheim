"use client";

import { GameCanvas } from "@ui/GameCanvas";

export default function GamePage() {
  return (
    <main className="w-screen h-screen overflow-hidden bg-black">
      <GameCanvas />
    </main>
  );
}
