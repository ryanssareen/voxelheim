"use client";

import Link from "next/link";

const MC_BTN =
  "block text-center py-2.5 text-white font-mono tracking-wide hover:brightness-125 active:brightness-90 transition-all select-none";
const BTN_STYLE: React.CSSProperties = {
  background:
    "linear-gradient(to bottom, #7a7a7a 0%, #5a5a5a 40%, #484848 60%, #3a3a3a 100%)",
  border: "3px solid #1a1a1a",
  boxShadow:
    "inset 0 2px 0 rgba(255,255,255,0.15), inset 0 -2px 0 rgba(0,0,0,0.3), 0 3px 6px rgba(0,0,0,0.4)",
  textShadow: "2px 2px 0 #2a2a2a",
};

const INPUT_STYLE: React.CSSProperties = {
  background: "rgba(0,0,0,0.4)",
  border: "2px solid rgba(255,255,255,0.06)",
  boxShadow: "inset 0 2px 4px rgba(0,0,0,0.3)",
  color: "#e0e0e0",
};

export { MC_BTN, BTN_STYLE, INPUT_STYLE };

export function AuthLayout({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden select-none bg-[#1a1a1a]">
      <div className="absolute inset-0" style={{
        background: "linear-gradient(180deg, #0b0e2a 0%, #1a1a2e 30%, #1a1a1a 60%)",
      }} />
      <div
        className="absolute inset-0 opacity-10"
        style={{
          background:
            "repeating-linear-gradient(90deg, #6b4226 0px, #7a4f2d 4px, #5c3a1e 8px, #6b4226 12px), repeating-linear-gradient(0deg, #6b4226 0px, #7a4f2d 4px, #5c3a1e 8px, #6b4226 12px)",
          backgroundSize: "12px 12px",
          imageRendering: "pixelated",
        }}
      />

      <div className="relative z-10 w-full max-w-[420px] px-4 animate-fadeIn">
        <Link
          href="/"
          className="block text-center mb-6"
        >
          <h1
            className="text-4xl font-black font-mono"
            style={{
              color: "#e8e8e8",
              textShadow: "3px 3px 0 #4a4a4a, 5px 5px 0 #2a2a2a",
              letterSpacing: "0.04em",
            }}
          >
            VOXELHEIM
          </h1>
        </Link>

        <div
          className="p-6 rounded-sm"
          style={{
            background: "rgba(0,0,0,0.4)",
            border: "2px solid rgba(255,255,255,0.06)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
          }}
        >
          <h2
            className="text-lg font-mono font-bold text-white mb-5 text-center"
            style={{ textShadow: "2px 2px 0 #000" }}
          >
            {title}
          </h2>

          {children}
        </div>
      </div>
    </main>
  );
}
