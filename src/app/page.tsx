import Link from "next/link";

export default function Home() {
  return (
    <main
      className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden select-none"
      style={{
        background:
          "linear-gradient(to bottom, #1a0a2e 0%, #c04820 30%, #d4722a 45%, #3a7a3a 55%, #2a5a2a 65%, #1a3a1a 100%)",
      }}
    >
      {/* Noise overlay for texture feel */}
      <div
        className="absolute inset-0 opacity-10"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E")`,
          backgroundSize: "256px 256px",
        }}
      />

      {/* Dirt bar at bottom */}
      <div
        className="absolute bottom-0 left-0 right-0 h-20"
        style={{
          background:
            "repeating-linear-gradient(90deg, #6b4226 0px, #7a4f2d 4px, #5c3a1e 8px, #6b4226 12px)",
          boxShadow: "inset 0 4px 0 #4a7a3a, inset 0 8px 0 #3a6a2a",
          imageRendering: "pixelated",
        }}
      />

      {/* Vignette */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_20%,rgba(0,0,0,0.4)_100%)]" />

      <div className="relative flex flex-col items-center z-10 -mt-10">
        {/* Title — large, 3D embossed text like Minecraft logo */}
        <h1
          className="text-[80px] sm:text-[110px] font-black leading-none"
          style={{
            fontFamily: "monospace",
            color: "#e8e8e8",
            textShadow: `
              3px 3px 0 #4a4a4a,
              6px 6px 0 #2a2a2a,
              1px 1px 0 #ffffff80,
              -1px -1px 0 #00000040
            `,
            letterSpacing: "0.05em",
            WebkitTextStroke: "1px #3a3a3a",
            paintOrder: "stroke fill",
          }}
        >
          VOXELHEIM
        </h1>
        <p
          className="text-lg font-mono text-yellow-400 -mt-2 tracking-[0.2em]"
          style={{ textShadow: "2px 2px 0 #2a1a00" }}
        >
          Island Edition
        </p>

        {/* Menu buttons */}
        <div className="flex flex-col items-center gap-2.5 mt-10 w-[340px]">
          {/* Play Game — wide primary button */}
          <Link
            href="/game"
            className="block w-full text-center py-2 text-white font-mono text-lg tracking-wide hover:brightness-125 active:brightness-90 transition-all"
            style={{
              background: "linear-gradient(to bottom, #7a7a7a 0%, #5a5a5a 40%, #484848 60%, #3a3a3a 100%)",
              border: "3px solid #1a1a1a",
              boxShadow:
                "inset 0 2px 0 rgba(255,255,255,0.15), inset 0 -2px 0 rgba(0,0,0,0.3), 0 3px 6px rgba(0,0,0,0.4)",
              textShadow: "2px 2px 0 #2a2a2a",
              imageRendering: "pixelated",
            }}
          >
            Play Game
          </Link>

          {/* Bottom row: Options + Quit */}
          <div className="flex gap-2.5 w-full">
            <button
              disabled
              className="flex-1 py-2 text-white/50 font-mono text-sm tracking-wide cursor-not-allowed"
              style={{
                background: "linear-gradient(to bottom, #5a5a5a 0%, #3a3a3a 40%, #2e2e2e 60%, #222 100%)",
                border: "3px solid #1a1a1a",
                boxShadow:
                  "inset 0 2px 0 rgba(255,255,255,0.08), inset 0 -2px 0 rgba(0,0,0,0.3), 0 3px 6px rgba(0,0,0,0.4)",
                textShadow: "1px 1px 0 #1a1a1a",
              }}
            >
              Options...
            </button>
            <button
              disabled
              className="flex-1 py-2 text-white/50 font-mono text-sm tracking-wide cursor-not-allowed"
              style={{
                background: "linear-gradient(to bottom, #5a5a5a 0%, #3a3a3a 40%, #2e2e2e 60%, #222 100%)",
                border: "3px solid #1a1a1a",
                boxShadow:
                  "inset 0 2px 0 rgba(255,255,255,0.08), inset 0 -2px 0 rgba(0,0,0,0.3), 0 3px 6px rgba(0,0,0,0.4)",
                textShadow: "1px 1px 0 #1a1a1a",
              }}
            >
              Quit Game
            </button>
          </div>
        </div>

        {/* Version text */}
        <p
          className="mt-8 text-[11px] text-white/40 font-mono"
          style={{ textShadow: "1px 1px 0 #000" }}
        >
          Voxelheim Island Edition (v0.1.0)
        </p>
      </div>
    </main>
  );
}
