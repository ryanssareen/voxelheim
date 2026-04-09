"use client";

import { useEffect, useState } from "react";
import { useGameStore } from "@store/useGameStore";
import { useMultiplayerStore } from "@store/useMultiplayerStore";

const HEART_PATH = "M6.5 11.5L1.5 6.5C0.2 5.2 0.2 3.1 1.5 1.8C2.8 0.5 4.9 0.5 6.2 1.8L6.5 2.1L6.8 1.8C8.1 0.5 10.2 0.5 11.5 1.8C12.8 3.1 12.8 5.2 11.5 6.5L6.5 11.5Z";

function HeartIcon({ fill, index }: { fill: "full" | "half" | "empty"; index: number }) {
  const clipId = `hh${index}`;
  return (
    <svg width="18" height="18" viewBox="0 0 13 13" className="block">
      <path d={HEART_PATH} fill="#3a1111" stroke="#1a0808" strokeWidth="0.8" />
      {fill === "full" && <path d={HEART_PATH} fill="#e53935" />}
      {fill === "half" && (
        <>
          <defs><clipPath id={clipId}><rect x="0" y="0" width="6.5" height="13" /></clipPath></defs>
          <path d={HEART_PATH} fill="#e53935" clipPath={`url(#${clipId})`} />
        </>
      )}
    </svg>
  );
}

function HungerIcon({ fill, index }: { fill: "full" | "half" | "empty"; index: number }) {
  const clipId = `hd${index}`;
  return (
    <svg width="18" height="18" viewBox="0 0 13 13" className="block">
      <ellipse cx="7.5" cy="4.5" rx="3.5" ry="3" fill="#2a1f0f" stroke="#1a1408" strokeWidth="0.8" />
      {fill === "full" && (
        <ellipse cx="7.5" cy="4.5" rx="3.5" ry="3" fill="#c68c53" />
      )}
      {fill === "half" && (
        <>
          <defs><clipPath id={clipId}><rect x="0" y="0" width="7.5" height="13" /></clipPath></defs>
          <ellipse cx="7.5" cy="4.5" rx="3.5" ry="3" fill="#c68c53" clipPath={`url(#${clipId})`} />
        </>
      )}
      <rect
        x="2" y="7" width="2.5" height="4" rx="1"
        fill={fill === "empty" ? "#1f170a" : "#a0714a"}
        stroke="#1a1408" strokeWidth="0.6"
        transform="rotate(-15, 3.25, 9)"
      />
    </svg>
  );
}

function SunMoonIcon({ timeOfDay }: { timeOfDay: number }) {
  const isNight = timeOfDay > 0.35 && timeOfDay < 0.75;
  const progress = isNight
    ? (timeOfDay - 0.35) / 0.4
    : timeOfDay <= 0.35
      ? 0.5 + timeOfDay / 0.7
      : 0.5 - (1 - timeOfDay) / 0.5;
  const arcY = 4 + Math.sin(Math.max(0, Math.min(1, progress)) * Math.PI) * -8;

  return (
    <svg width="36" height="20" viewBox="0 0 36 20" className="block">
      <line x1="2" y1="18" x2="34" y2="18" stroke="white" strokeOpacity="0.15" strokeWidth="1" />
      {isNight ? (
        <>
          <circle cx="18" cy={12 + arcY} r="5" fill="#e0e0e0" />
          <circle cx="20" cy={10 + arcY} r="5" fill="transparent" stroke="#c0c0c0" strokeWidth="0" />
          <circle cx="20.5" cy={10.5 + arcY} r="4.5" fill="#1a1a3a" />
        </>
      ) : (
        <>
          <circle cx="18" cy={12 + arcY} r="5" fill="#fdd835" />
          {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => {
            const rad = (angle * Math.PI) / 180;
            const x1 = 18 + Math.cos(rad) * 6.5;
            const y1 = 12 + arcY + Math.sin(rad) * 6.5;
            const x2 = 18 + Math.cos(rad) * 8;
            const y2 = 12 + arcY + Math.sin(rad) * 8;
            return (
              <line key={angle} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#fdd835" strokeWidth="1.2" strokeLinecap="round" />
            );
          })}
        </>
      )}
    </svg>
  );
}

function HealthBar({ health, maxHealth }: { health: number; maxHealth: number }) {
  const lastDamageTime = useGameStore((s) => s.lastDamageTime);
  const hearts = maxHealth / 2;
  return (
    <div
      key={lastDamageTime}
      className={`flex gap-[2px] ${lastDamageTime > 0 ? "animate-shake" : ""}`}
    >
      {Array.from({ length: hearts }, (_, i) => {
        const hp = health - i * 2;
        const fill = hp >= 2 ? "full" : hp >= 1 ? "half" : "empty";
        return <HeartIcon key={i} fill={fill} index={i} />;
      })}
    </div>
  );
}

function HungerBar({ hunger, maxHunger }: { hunger: number; maxHunger: number }) {
  const icons = maxHunger / 2;
  return (
    <div
      className={`flex flex-row-reverse gap-[2px] ${
        hunger <= 6 ? "animate-shake" : ""
      }`}
    >
      {Array.from({ length: icons }, (_, i) => {
        const h = hunger - i * 2;
        const fill = h >= 2 ? "full" : h >= 1 ? "half" : "empty";
        return <HungerIcon key={i} fill={fill} index={i} />;
      })}
    </div>
  );
}

/**
 * Minecraft-style HUD: crosshair, shard counter, health/hunger bars, completion overlay, F3 debug.
 */
export function HUD() {
  const shardsCollected = useGameStore((s) => s.shardsCollected);
  const shardsTotal = useGameStore((s) => s.shardsTotal);
  const isComplete = useGameStore((s) => s.isComplete);
  const breakProgress = useGameStore((s) => s.breakProgress);
  const timeOfDay = useGameStore((s) => s.timeOfDay);
  const health = useGameStore((s) => s.health);
  const maxHealth = useGameStore((s) => s.maxHealth);
  const hunger = useGameStore((s) => s.hunger);
  const maxHunger = useGameStore((s) => s.maxHunger);
  const multiplayerSession = useMultiplayerStore((s) => s.session);
  const multiplayerPlayers = useMultiplayerStore((s) => s.players);
  const multiplayerStatus = useMultiplayerStore((s) => s.status);
  const [showContinue, setShowContinue] = useState(false);
  const [showDebug, setShowDebug] = useState(false);

  useEffect(() => {
    if (!isComplete) return;
    const timer = setTimeout(() => setShowContinue(true), 4000);
    return () => {
      clearTimeout(timer);
      setShowContinue(false);
    };
  }, [isComplete]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code === "F3") {
        e.preventDefault();
        setShowDebug((d) => !d);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <div className="absolute inset-0 pointer-events-none z-10">
      {/* Minecraft-style crosshair — white + with slight transparency */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
        <svg width="24" height="24" viewBox="0 0 24 24" className="opacity-70">
          <rect x="11" y="4" width="2" height="7" fill="white" />
          <rect x="11" y="13" width="2" height="7" fill="white" />
          <rect x="4" y="11" width="7" height="2" fill="white" />
          <rect x="13" y="11" width="7" height="2" fill="white" />
        </svg>
      </div>

      {/* Break progress bar below crosshair */}
      {breakProgress > 0 && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 mt-5 w-24 h-1 bg-black/40 rounded-full overflow-hidden">
          <div
            className="h-full bg-white/80 transition-none"
            style={{ width: `${breakProgress * 100}%` }}
          />
        </div>
      )}

      {/* Sun/Moon indicator — top left */}
      <div className="absolute top-3 left-3 px-2 py-1 bg-black/50 border border-white/10 rounded">
        <SunMoonIcon timeOfDay={timeOfDay} />
      </div>

      {/* Shard Counter — top center, Minecraft achievement style */}
      <div
        className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3 py-1.5 bg-black/50 border border-white/10 rounded"
        style={{ textShadow: "1px 1px 0 #000" }}
      >
        <div className="w-3 h-3 rotate-45 bg-cyan-400 shadow-[0_0_6px_#00e5ff]" />
        <span className="text-white font-mono text-sm font-bold">
          {shardsCollected}
          <span className="text-white/40 font-normal">/{shardsTotal}</span>
        </span>
      </div>

      {(multiplayerSession || multiplayerStatus === "connecting") && (
        <div
          className="absolute top-3 right-3 px-3 py-2 bg-black/50 border border-white/10 rounded"
          style={{ textShadow: "1px 1px 0 #000" }}
        >
          <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-cyan-300/90">
            {multiplayerStatus === "connecting"
              ? "Linking"
              : multiplayerSession?.transport === "local"
                ? "Local Co-op"
                : "Multiplayer"}
          </p>
          {multiplayerSession && (
            <>
              <p className="font-mono text-sm font-bold text-white">
                {multiplayerSession.code}
              </p>
              <p className="font-mono text-[11px] text-white/55">
                {multiplayerPlayers.length} player
                {multiplayerPlayers.length === 1 ? "" : "s"} online
              </p>
            </>
          )}
        </div>
      )}

      {/* F3 Debug */}
      {showDebug && (
        <div
          className="absolute top-4 left-4 text-white font-mono text-[11px] leading-relaxed bg-black/60 p-2"
          style={{ textShadow: "1px 1px 0 #000" }}
        >
          <p>Voxelheim v0.1.0</p>
          <p>F3 — Debug</p>
        </div>
      )}

      {/* Health & Hunger bars — positioned above hotbar */}
      <div
        className="absolute bottom-[76px] left-1/2 -translate-x-1/2 flex items-end justify-between"
        style={{ width: "min(100vw, 560px)" }}
      >
        <div className="flex justify-end">
          <HealthBar health={health} maxHealth={maxHealth} />
        </div>
        <div className="flex justify-start">
          <HungerBar hunger={hunger} maxHunger={maxHunger} />
        </div>
      </div>

      {/* Completion Overlay */}
      {isComplete && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70">
          <h1
            className="text-5xl font-mono font-bold text-cyan-300 mb-8"
            style={{
              textShadow: "0 0 30px #00e5ff, 0 0 60px #00e5ff, 3px 3px 0 #0a3040",
            }}
          >
            ISLAND CLEARED!
          </h1>
          <p
            className="text-white/60 font-mono text-sm mb-4"
            style={{ textShadow: "1px 1px 0 #000" }}
          >
            All {shardsTotal} crystal shards collected
          </p>
          {showContinue && (
            <p className="text-white/40 font-mono text-xs animate-pulse">
              Press ESC to continue
            </p>
          )}
        </div>
      )}
    </div>
  );
}
