import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#0a0a0f] relative overflow-hidden">
      {/* Subtle background grid */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />

      {/* Vignette */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,#0a0a0f_100%)]" />

      <div className="relative flex flex-col items-center gap-4 text-center px-8">
        {/* Small diamond icon */}
        <div className="w-4 h-4 rotate-45 bg-cyan-400/60 mb-4 shadow-[0_0_20px_rgba(0,229,255,0.3)]" />

        <h1
          className="text-7xl sm:text-8xl font-mono font-bold tracking-[0.2em] text-white"
          style={{ textShadow: "0 0 40px rgba(0,229,255,0.15)" }}
        >
          VOXELHEIM
        </h1>

        <p className="text-base font-mono text-white/30 tracking-[0.3em] uppercase mt-1">
          A Voxel Island Challenge
        </p>

        {/* Thin separator */}
        <div className="w-24 h-px bg-gradient-to-r from-transparent via-cyan-500/40 to-transparent mt-6 mb-2" />

        <p className="text-sm font-mono text-white/20 max-w-sm leading-relaxed">
          Explore a floating island. Find 5 crystal shards. Break and build your way through.
        </p>

        <Link
          href="/game"
          className="mt-10 group relative px-16 py-4 font-mono text-lg tracking-widest uppercase text-cyan-300 transition-all duration-300 hover:text-white"
        >
          {/* Button border with glow on hover */}
          <span className="absolute inset-0 border border-cyan-500/20 group-hover:border-cyan-400/50 group-hover:shadow-[0_0_30px_rgba(0,229,255,0.1)] transition-all duration-300 rounded" />
          Play
        </Link>

        {/* Controls hint */}
        <div className="mt-16 flex gap-8 text-white/15 font-mono text-xs">
          <span>WASD Move</span>
          <span>Mouse Look</span>
          <span>LMB Break</span>
          <span>RMB Place</span>
        </div>
      </div>
    </main>
  );
}
