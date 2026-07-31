"use client";

import { useEffect } from "react";
import { KEYBIND_GROUPS } from "@data/keybinds";
import { useKeybindsStore } from "@store/useKeybindsStore";
import { DEMO_WORLD_ID } from "@lib/demoWorld";

export function KeybindsPopup({ worldId }: { worldId?: string }) {
  const isOpen = useKeybindsStore((s) => s.isOpen);
  const showOnce = useKeybindsStore((s) => s.showOnce);
  const close = useKeybindsStore((s) => s.close);

  // Auto-opens on the demo only, and only the first time.
  useEffect(() => {
    if (worldId === DEMO_WORLD_ID) showOnce();
  }, [worldId, showOnce]);

  useEffect(() => {
    if (!isOpen) return;
    if (document.pointerLockElement) document.exitPointerLock();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Escape" || e.code === "Enter") {
        e.stopPropagation();
        close();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [isOpen, close]);

  if (!isOpen) return null;

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/70">
      <div
        className="flex flex-col gap-3 px-6 py-5 max-w-[560px] w-[90%] max-h-[85%] overflow-y-auto"
        style={{
          background: "linear-gradient(to bottom, rgba(46,46,46,0.98) 0%, rgba(26,26,26,0.98) 100%)",
          border: "3px solid #1a1a1a",
          boxShadow: "inset 0 2px 0 rgba(255,255,255,0.1), 0 6px 16px rgba(0,0,0,0.6)",
        }}
      >
        <h2
          className="text-white font-mono text-lg font-bold text-center"
          style={{ textShadow: "2px 2px 0 #2a2a2a" }}
        >
          Controls
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {KEYBIND_GROUPS.map((group) => (
            <div key={group.title} className="flex flex-col gap-1.5">
              <div className="text-yellow-400 font-mono text-[10px] tracking-widest">
                {group.title.toUpperCase()}
              </div>
              {group.binds.map((b) => (
                <div key={b.action + b.keys} className="flex items-baseline justify-between gap-2">
                  <span
                    className="text-white font-mono text-[11px] px-1.5 py-0.5 shrink-0"
                    style={{ background: "#3a3a3a", border: "1px solid #1a1a1a" }}
                  >
                    {b.keys}
                  </span>
                  <span className="text-white/70 font-mono text-[11px] text-right">
                    {b.action}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>

        <button
          onClick={close}
          className="mt-1 w-full py-2.5 text-white font-mono tracking-wide hover:brightness-125 active:brightness-90 transition-all"
          style={{
            background: "linear-gradient(to bottom, #5a9a4a 0%, #3a7a2a 40%, #2a6a1a 60%, #1a5a0a 100%)",
            border: "3px solid #1a1a1a",
            boxShadow: "inset 0 2px 0 rgba(255,255,255,0.15), inset 0 -2px 0 rgba(0,0,0,0.3)",
            textShadow: "2px 2px 0 #2a2a2a",
          }}
        >
          Got it
        </button>
        <p className="text-white/35 font-mono text-[10px] text-center">
          Reopen any time from the pause menu
        </p>
      </div>
    </div>
  );
}
