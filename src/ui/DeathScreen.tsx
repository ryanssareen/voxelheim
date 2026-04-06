"use client";

import { useRouter } from "next/navigation";
import { useGameStore } from "@store/useGameStore";

/**
 * "YOU DIED!" overlay shown when player falls into the void.
 */
export function DeathScreen({
  onRespawn,
}: {
  onRespawn: () => void;
}) {
  const isDead = useGameStore((s) => s.isDead);
  const router = useRouter();

  if (!isDead) return null;

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center z-30 bg-red-900/60">
      <h1
        className="text-6xl font-mono font-bold text-red-200 mb-12"
        style={{ textShadow: "3px 3px 0 #4a0000, 0 0 20px rgba(255,0,0,0.4)" }}
      >
        YOU DIED!
      </h1>

      <div className="flex flex-col gap-3 w-64">
        <button
          onClick={onRespawn}
          className="py-3 text-white font-mono text-base tracking-wide hover:brightness-125 active:brightness-90 transition-all"
          style={{
            background:
              "linear-gradient(to bottom, #7a7a7a 0%, #5a5a5a 40%, #484848 60%, #3a3a3a 100%)",
            border: "3px solid #1a1a1a",
            boxShadow:
              "inset 0 2px 0 rgba(255,255,255,0.15), inset 0 -2px 0 rgba(0,0,0,0.3)",
            textShadow: "2px 2px 0 #2a2a2a",
          }}
        >
          Respawn
        </button>

        <button
          onClick={() => router.push("/")}
          className="py-3 text-white/70 font-mono text-sm tracking-wide hover:brightness-125 active:brightness-90 transition-all"
          style={{
            background:
              "linear-gradient(to bottom, #5a5a5a 0%, #3a3a3a 40%, #2e2e2e 60%, #222 100%)",
            border: "3px solid #1a1a1a",
            boxShadow:
              "inset 0 2px 0 rgba(255,255,255,0.08), inset 0 -2px 0 rgba(0,0,0,0.3)",
            textShadow: "1px 1px 0 #1a1a1a",
          }}
        >
          Save and Quit
        </button>
      </div>
    </div>
  );
}
