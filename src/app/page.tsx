import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#111]">
      <div className="flex flex-col items-center gap-6 text-center">
        <h1 className="text-6xl font-mono font-bold text-white tracking-wider">
          VOXELHEIM
        </h1>
        <p className="text-lg font-mono text-white/50">
          A Voxel Island Challenge
        </p>
        <Link
          href="/game"
          className="mt-8 px-12 py-4 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 font-mono text-xl rounded border border-cyan-500/30 hover:border-cyan-500/50 transition-colors"
        >
          Play
        </Link>
      </div>
    </main>
  );
}
