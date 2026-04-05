import Link from "next/link";

export default function Home() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden">
      {/* Panorama-style background gradient (sky) */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#1a0a2e] via-[#3a1555] to-[#0d3b1e]" />

      {/* Fake terrain silhouette at bottom */}
      <div className="absolute bottom-0 left-0 right-0 h-[30%] bg-gradient-to-t from-[#1a3a1a] to-transparent" />

      {/* Dirt-like strip at very bottom */}
      <div className="absolute bottom-0 left-0 right-0 h-16 bg-[#5c3a1e]" />
      <div className="absolute bottom-16 left-0 right-0 h-4 bg-[#4a7a3a]" />

      {/* Vignette overlay */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,rgba(0,0,0,0.6)_100%)]" />

      <div className="relative flex flex-col items-center gap-0 text-center z-10">
        {/* Title — Minecraft-style blocky look */}
        <h1
          className="text-6xl sm:text-8xl font-black tracking-wider text-[#e0e0e0] select-none"
          style={{
            fontFamily: "monospace",
            textShadow:
              "4px 4px 0 #3a3a3a, 2px 2px 0 #2a2a2a, 0 0 20px rgba(0,0,0,0.5)",
            letterSpacing: "0.08em",
          }}
        >
          VOXELHEIM
        </h1>
        <p
          className="text-sm font-mono text-yellow-300/80 mt-1 tracking-widest"
          style={{ textShadow: "1px 1px 0 #333" }}
        >
          Island Edition
        </p>

        {/* Menu buttons — Minecraft style */}
        <div className="flex flex-col gap-2 mt-12 w-72">
          <Link
            href="/game"
            className="relative block w-full py-2.5 text-center text-white font-mono text-base border-2 border-[#1a1a1a] bg-[#5a5a5a] hover:bg-[#6a6a6a] active:bg-[#4a4a4a] transition-colors select-none"
            style={{
              boxShadow:
                "inset 0 -3px 0 #3a3a3a, inset 0 3px 0 #7a7a7a, 0 2px 4px rgba(0,0,0,0.5)",
              textShadow: "2px 2px 0 #2a2a2a",
              imageRendering: "pixelated",
            }}
          >
            Play Game
          </Link>

          <div className="flex gap-2">
            <div
              className="flex-1 py-2.5 text-center text-white/60 font-mono text-sm border-2 border-[#1a1a1a] bg-[#3a3a3a] select-none cursor-default"
              style={{
                boxShadow:
                  "inset 0 -3px 0 #2a2a2a, inset 0 3px 0 #4a4a4a, 0 2px 4px rgba(0,0,0,0.5)",
                textShadow: "1px 1px 0 #1a1a1a",
              }}
            >
              Options...
            </div>
            <div
              className="flex-1 py-2.5 text-center text-white/60 font-mono text-sm border-2 border-[#1a1a1a] bg-[#3a3a3a] select-none cursor-default"
              style={{
                boxShadow:
                  "inset 0 -3px 0 #2a2a2a, inset 0 3px 0 #4a4a4a, 0 2px 4px rgba(0,0,0,0.5)",
                textShadow: "1px 1px 0 #1a1a1a",
              }}
            >
              Quit Game
            </div>
          </div>
        </div>

        {/* Bottom text */}
        <p className="mt-10 text-[10px] text-white/30 font-mono">
          Voxelheim Island Edition (v0.1.0)
        </p>
      </div>
    </main>
  );
}
