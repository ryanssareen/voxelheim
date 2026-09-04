"use client";

import { useEffect, useState } from "react";
import type { Engine } from "@engine/Engine";
import { useGameStore } from "@store/useGameStore";
import { useMultiplayerStore } from "@store/useMultiplayerStore";
import { useHudMetrics, type HudMetrics } from "@ui/useHudScale";

type DebugInfo = NonNullable<ReturnType<Engine["getDebugInfo"]>>;

/** Size and position of the pill-shaped bar drawn under the crosshair (break progress, eat progress). */
export function crosshairBarMetrics(m: HudMetrics): { marginTop: number; width: number; height: number } {
  return {
    marginTop: Math.round(m.crosshair * 0.85),
    width: Math.round(m.crosshair * 4.6),
    height: Math.max(3, Math.round(m.scale * 5)),
  };
}

/** Clamps a 0-1 progress fraction to an integer percent. */
export function progressPercent(progress: number): number {
  return Math.round(Math.max(0, Math.min(1, progress)) * 100);
}

const HEART_PATH = "M6.5 11.5L1.5 6.5C0.2 5.2 0.2 3.1 1.5 1.8C2.8 0.5 4.9 0.5 6.2 1.8L6.5 2.1L6.8 1.8C8.1 0.5 10.2 0.5 11.5 1.8C12.8 3.1 12.8 5.2 11.5 6.5L6.5 11.5Z";

function HeartIcon({ fill, index, size }: { fill: "full" | "half" | "empty"; index: number; size: number }) {
  const clipId = `hh${index}`;
  return (
    <svg width={size} height={size} viewBox="0 0 13 13" className="block">
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

function HungerIcon({ fill, index, size }: { fill: "full" | "half" | "empty"; index: number; size: number }) {
  const clipId = `hd${index}`;
  return (
    <svg width={size} height={size} viewBox="0 0 13 13" className="block">
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

function SunMoonIcon({ timeOfDay, width, height }: { timeOfDay: number; width: number; height: number }) {
  const isNight = timeOfDay > 0.35 && timeOfDay < 0.75;
  const progress = isNight
    ? (timeOfDay - 0.35) / 0.4
    : timeOfDay <= 0.35
      ? 0.5 + timeOfDay / 0.7
      : 0.5 - (1 - timeOfDay) / 0.5;
  const arcY = 4 + Math.sin(Math.max(0, Math.min(1, progress)) * Math.PI) * -8;

  return (
    <svg width={width} height={height} viewBox="0 0 36 20" className="block">
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

function HealthBar({
  health,
  maxHealth,
  metrics,
}: {
  health: number;
  maxHealth: number;
  metrics: HudMetrics;
}) {
  const lastDamageTime = useGameStore((s) => s.lastDamageTime);
  const hearts = maxHealth / 2;
  return (
    <div
      key={lastDamageTime}
      className={`flex ${lastDamageTime > 0 ? "animate-shake" : ""}`}
      style={{ gap: metrics.statGap }}
    >
      {Array.from({ length: hearts }, (_, i) => {
        const hp = health - i * 2;
        const fill = hp >= 2 ? "full" : hp >= 1 ? "half" : "empty";
        return <HeartIcon key={i} fill={fill} index={i} size={metrics.stat} />;
      })}
    </div>
  );
}

function HungerBar({
  hunger,
  maxHunger,
  metrics,
}: {
  hunger: number;
  maxHunger: number;
  metrics: HudMetrics;
}) {
  const icons = maxHunger / 2;
  return (
    <div
      className={`flex flex-row-reverse ${hunger <= 6 ? "animate-shake" : ""}`}
      style={{ gap: metrics.statGap }}
    >
      {Array.from({ length: icons }, (_, i) => {
        const h = hunger - i * 2;
        const fill = h >= 2 ? "full" : h >= 1 ? "half" : "empty";
        return <HungerIcon key={i} fill={fill} index={i} size={metrics.stat} />;
      })}
    </div>
  );
}

/**
 * Minecraft-style HUD: crosshair, shard counter, health/hunger bars, completion overlay, F3 debug.
 */
export function HUD({ engineRef }: { engineRef?: React.RefObject<Engine | null> }) {
  const shardsCollected = useGameStore((s) => s.shardsCollected);
  const shardsTotal = useGameStore((s) => s.shardsTotal);
  const breakProgress = useGameStore((s) => s.breakProgress);
  const eatProgress = useGameStore((s) => s.eatProgress);
  const timeOfDay = useGameStore((s) => s.timeOfDay);
  const gameMode = useGameStore((s) => s.gameMode);
  const health = useGameStore((s) => s.health);
  const maxHealth = useGameStore((s) => s.maxHealth);
  const hunger = useGameStore((s) => s.hunger);
  const maxHunger = useGameStore((s) => s.maxHunger);
  const minimapVisible = useGameStore((s) => s.minimapVisible);
  const multiplayerSession = useMultiplayerStore((s) => s.session);
  const multiplayerPlayers = useMultiplayerStore((s) => s.players);
  const multiplayerStatus = useMultiplayerStore((s) => s.status);
  const [showDebug, setShowDebug] = useState(false);
  const [debugInfo, setDebugInfo] = useState<DebugInfo | null>(null);
  const m = useHudMetrics();

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

  useEffect(() => {
    if (!showDebug || !engineRef) return;
    const tick = () => setDebugInfo(engineRef.current?.getDebugInfo() ?? null);
    tick();
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, [showDebug, engineRef]);

  return (
    <div className="absolute inset-0 pointer-events-none z-10">
      {/* Minecraft-style crosshair — white + with slight transparency */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
        <svg width={m.crosshair} height={m.crosshair} viewBox="0 0 24 24" className="opacity-70">
          <rect x="11" y="4" width="2" height="7" fill="white" />
          <rect x="11" y="13" width="2" height="7" fill="white" />
          <rect x="4" y="11" width="7" height="2" fill="white" />
          <rect x="13" y="11" width="7" height="2" fill="white" />
        </svg>
      </div>

      {/* Break progress bar below crosshair */}
      {breakProgress > 0 && (
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 bg-black/40 rounded-full overflow-hidden"
          style={crosshairBarMetrics(m)}
        >
          <div
            className="h-full bg-white/80 transition-none"
            style={{ width: `${progressPercent(breakProgress)}%` }}
          />
        </div>
      )}

      {/* Eat progress bar — same slot as the break bar; the two are mutually
          exclusive (breaking needs a targeted block, eating needs none). */}
      {eatProgress > 0 && (
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 bg-black/40 rounded-full overflow-hidden"
          style={crosshairBarMetrics(m)}
        >
          <div
            className="h-full bg-amber-400/90 transition-none"
            style={{ width: `${progressPercent(eatProgress)}%` }}
          />
        </div>
      )}

      {/* Sun/Moon indicator — top left */}
      <div className="absolute top-3 left-3 px-2 py-1 bg-black/50 border border-white/10 rounded">
        <SunMoonIcon timeOfDay={timeOfDay} width={m.sunW} height={m.sunH} />
      </div>

      {/* Shard Counter — top center, Minecraft achievement style */}
      <div
        className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3 py-1.5 bg-black/50 border border-white/10 rounded"
        style={{ textShadow: "1px 1px 0 #000" }}
      >
        <div
          className="rotate-45 bg-cyan-400 shadow-[0_0_6px_#00e5ff]"
          style={{ width: Math.round(m.shardFont * 0.72), height: Math.round(m.shardFont * 0.72) }}
        />
        <span
          className="text-white font-mono font-bold leading-none"
          style={{ fontSize: m.shardFont }}
        >
          {shardsCollected}
          <span className="text-white/40 font-normal">/{shardsTotal}</span>
        </span>
      </div>

      {(multiplayerSession || multiplayerStatus === "connecting") && (
        <div
          className={`absolute top-3 ${minimapVisible ? "right-[204px]" : "right-3"} px-3 py-2 bg-black/50 border border-white/10 rounded`}
          style={{ textShadow: "1px 1px 0 #000" }}
        >
          <p
            className="font-mono uppercase tracking-[0.2em] text-cyan-300/90"
            style={{ fontSize: m.panelLabelFont }}
          >
            {multiplayerStatus === "connecting"
              ? "Linking"
              : multiplayerSession?.transport === "local"
                ? "Local Co-op"
                : "Multiplayer"}
          </p>
          {multiplayerSession && (
            <>
              <p className="font-mono font-bold text-white" style={{ fontSize: m.panelFont }}>
                {multiplayerSession.code}
              </p>
              <p className="font-mono text-white/55" style={{ fontSize: m.panelLabelFont }}>
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
          {debugInfo && (
            <>
              <p>
                XYZ: {debugInfo.position.x.toFixed(2)} / {debugInfo.position.y.toFixed(2)} /{" "}
                {debugInfo.position.z.toFixed(2)}
              </p>
              <p>
                Vel: {debugInfo.velocity.x.toFixed(2)} / {debugInfo.velocity.y.toFixed(2)} /{" "}
                {debugInfo.velocity.z.toFixed(2)}
              </p>
              <p>
                onGround: {String(debugInfo.onGround)} | flying: {String(debugInfo.isFlying)} | mode:{" "}
                {debugInfo.gameMode}
              </p>
              <p>
                Feet block: id={debugInfo.feetBlockId} solid={String(debugInfo.feetBlockSolid)}
              </p>
              <p>
                Below block: id={debugInfo.belowBlockId} solid={String(debugInfo.belowBlockSolid)}
              </p>
            </>
          )}
        </div>
      )}

      {/* Health & Hunger bars — positioned above hotbar (hidden in creative).
          Icon size and gaps come from hudMetrics, which budgets the row against
          the viewport width so the two groups never collide or overflow. */}
      {gameMode !== "creative" && (
        <div
          className="absolute left-1/2 -translate-x-1/2 flex items-end justify-center"
          style={{ bottom: m.statBottom, gap: m.barGap, maxWidth: "100vw" }}
        >
          <HealthBar health={health} maxHealth={maxHealth} metrics={m} />
          <HungerBar hunger={hunger} maxHunger={maxHunger} metrics={m} />
        </div>
      )}

    </div>
  );
}
