"use client";

import { useEffect, useRef, useState } from "react";
import type { Engine } from "@engine/Engine";
import type { EdgeIntent, HeldIntent, InputSource } from "@engine/input/intents";
import { DEFAULT_TOUCH_CONFIG, type JoystickView } from "@engine/input/touchSource";
import { readLocal, writeLocal } from "@lib/storage";
import { useGameStore } from "@store/useGameStore";
import { useInventoryStore } from "@store/useInventoryStore";
import { HOTBAR_DOCK_INTENT } from "@ui/HotbarUI";
import { useHudMetrics, type HudMetrics } from "@ui/useHudScale";
import { NO_INSETS, useViewportEnv, type Insets } from "@ui/useViewportEnv";

/**
 * The on-screen half of touch play: joystick, jump/crouch, and the corner
 * controls for the actions that have no gesture.
 *
 * What is *not* here is the point of it. Mining, placing and looking get no
 * buttons at all — they are the play surface itself, resolved in
 * `@engine/input/touchSource` — because they are the most frequent actions in
 * the game and buttons for them would cost play area on the smallest screens.
 * Everything this file draws is either infrequent (chat, map, pause) or has no
 * gesture to carry it (jump, crouch, hotbar), and nothing floats over the
 * middle of the screen.
 *
 * It presses the touch source's buttons rather than writing stores or
 * dispatching key events, so a thumb produces the same named intents a keyboard
 * does and every guard downstream — paused, panel open, dead — applies
 * unchanged. These controls are also real DOM elements, which is what keeps
 * moving, looking and pressing a button three genuinely independent touches
 * (R12): their contacts never reach the canvas listener at all.
 */

/**
 * Smallest edge this overlay gives an interactive control, px.
 *
 * A floor for the controls introduced here, not the global minimum R16 asks
 * for — raising that floor across the inventory and hotbar slots belongs to
 * U10, which owns the metric modules.
 */
export const TOUCH_TARGET_MIN = 48;

/** Whether the on-screen controls are drawn at all. */
export function touchControlsVisible(source: InputSource): boolean {
  return source === "touch";
}

export interface TouchControlLayout {
  /**
   * Reach gap between a control and the nearest viewport edge, px. Derived from
   * viewport size, and deliberately separate from the safe-area insets below —
   * one is about a thumb's arc, the other about what the hardware occludes.
   */
  inset: number;
  /** Distance from the left edge a left-anchored control sits at, px. */
  edgeLeft: number;
  /** Distance from the right edge a right-anchored control sits at, px. */
  edgeRight: number;
  /** Distance from the top edge a top-anchored control sits at, px. */
  edgeTop: number;
  /** Jump / crouch button edge, px. */
  actionButton: number;
  /** Vertical gap between the two stacked action buttons, px. */
  actionGap: number;
  /** Distance from the viewport bottom to the lower action button, px. */
  actionBottom: number;
  /** Corner icon button edge, px. */
  iconButton: number;
  /** Gap between corner icons, px. */
  iconGap: number;
  /** Distance from the viewport top to the corner icon column, px. */
  iconTop: number;
  /** Joystick ring radius, px. */
  joystickRadius: number;
  /** Joystick knob diameter, px. */
  joystickKnob: number;
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/**
 * Resolves every control's size and position for a viewport.
 *
 * Sizes come off the *shorter* viewport edge, which in landscape is the height:
 * a thumb's reach is a physical arc from the corner it is anchored in, and on a
 * short screen that arc is what runs out first.
 *
 * Two placements are load-bearing rather than aesthetic:
 *  - The action stack sits above the hotbar strip, not over it, so a jump never
 *    lands on a hotbar slot.
 *  - The corner icons sit below the sun/moon box the HUD draws at the top left,
 *    so neither covers the other.
 */
export function touchControlLayout(
  vw: number,
  vh: number,
  m: HudMetrics,
  insets: Insets = NO_INSETS,
): TouchControlLayout {
  const shortest = Math.max(1, Math.min(vw, vh));
  const inset = Math.round(clamp(shortest * 0.035, 12, 32));
  const actionButton = Math.round(clamp(shortest * 0.17, TOUCH_TARGET_MIN, 96));
  const iconButton = Math.round(clamp(shortest * 0.1, TOUCH_TARGET_MIN, 60));

  return {
    inset,
    // The reach gap and the occluded strip stack: a notch does not make a thumb
    // reach further, so the control clears both rather than the larger of them.
    edgeLeft: inset + insets.left,
    edgeRight: inset + insets.right,
    edgeTop: inset + insets.top,
    actionButton,
    actionGap: Math.round(clamp(actionButton * 0.22, 8, 24)),
    actionBottom: m.hotbarHeight + inset + insets.bottom,
    iconButton,
    iconGap: Math.round(clamp(iconButton * 0.2, 6, 14)),
    // 12px is the HUD's own `top-3`; the rest clears the sun/moon box under it.
    iconTop: 12 + m.sunH + 14 + insets.top,
    // The ring is drawn at the deflection radius the source actually uses, so
    // the knob reaching the rim means the stick is at full tilt rather than
    // approximately so.
    joystickRadius: DEFAULT_TOUCH_CONFIG.joystickRadiusPx,
    joystickKnob: Math.round(clamp(shortest * 0.13, TOUCH_TARGET_MIN, 72)),
  };
}

/** Where to draw the joystick ring and its knob, in client coordinates. */
export interface JoystickPlacement {
  anchorX: number;
  anchorY: number;
  knobX: number;
  knobY: number;
}

/**
 * Places the knob for a live joystick.
 *
 * The stick vector is already clamped to magnitude 1 by the source, so the knob
 * cannot escape the ring however far the thumb slides. Screen Y grows downward
 * while the vector's `y` is forward-positive, hence the subtraction: sliding the
 * thumb up walks the player forward and moves the knob up with it.
 */
export function joystickPlacement(view: JoystickView, radius: number): JoystickPlacement {
  return {
    anchorX: view.anchorX,
    anchorY: view.anchorY,
    knobX: view.anchorX + view.vector.x * radius,
    knobY: view.anchorY - view.vector.y * radius,
  };
}

/** A button that asserts a held intent for as long as a finger is on it. */
export interface TouchHoldControl {
  intent: HeldIntent;
  label: string;
  glyph: "up" | "down";
}

/**
 * Jump and crouch, stacked bottom-right (R9), lowest first.
 *
 * Jump takes the lower slot because it is the more frequent of the two and the
 * lower slot is the shorter reach for a thumb anchored in the corner.
 */
export const TOUCH_HOLD_CONTROLS: readonly TouchHoldControl[] = [
  { intent: "jump", label: "Jump", glyph: "up" },
  { intent: "sneak", label: "Crouch", glyph: "down" },
];

/** A control that means exactly one press. */
export interface TouchEdgeControl {
  intent: EdgeIntent;
  label: string;
  glyph: "pause" | "chat" | "map" | "close";
}

/**
 * The corner icons, top of the column first.
 *
 * Each one presses the same intent its key presses, so the consumer that reacts
 * is the same one in both cases — `PauseMenu` for pause (R22, which is what
 * stops pause depending on a pointer lock that a finger can never hold),
 * `GameCanvas` for chat, `MinimapUI` for the map.
 */
export const TOUCH_CORNER_CONTROLS: readonly TouchEdgeControl[] = [
  { intent: "pause", label: "Pause", glyph: "pause" },
  { intent: "openChat", label: "Chat", glyph: "chat" },
  { intent: "toggleMinimap", label: "Map", glyph: "map" },
];

/** One line of the first-session hint. */
export interface TouchHintLine {
  gesture: string;
  meaning: string;
}

/**
 * The three play-surface gestures that carry no label anywhere on screen (R13).
 *
 * Buttons teach themselves; a bare surface does not. These three are the only
 * controls in the game a first-time player could not find by looking, which is
 * exactly the set this hint covers — and why it is one card shown once rather
 * than permanent chrome.
 */
export const TOUCH_HINT_LINES: readonly TouchHintLine[] = [
  { gesture: "Drag", meaning: "Look around" },
  { gesture: "Hold", meaning: "Mine the block you are facing" },
  { gesture: "Tap", meaning: "Place the block you are holding" },
];

export const TOUCH_HINT_STORAGE_KEY = "voxelheim-touch-hint-seen";

/**
 * Is one of the four full-screen panels up?
 *
 * A module-level selector, not an inline arrow: it returns a primitive, so
 * zustand can skip the re-render when nothing changed, and defining it once
 * keeps this list in step with the identical one the engine and the UI router
 * read.
 */
export function panelIsOpen(s: {
  isOpen: boolean;
  tableOpen: boolean;
  furnaceOpen: boolean;
  creativeOpen: boolean;
}): boolean {
  return s.isOpen || s.tableOpen || s.furnaceOpen || s.creativeOpen;
}

/** True once the player has dismissed the hint, on this device. */
export function touchHintSeen(): boolean {
  return readLocal(TOUCH_HINT_STORAGE_KEY) === "true";
}

/** Records the dismissal. A browser that blocks storage simply shows it again. */
export function markTouchHintSeen(): void {
  writeLocal(TOUCH_HINT_STORAGE_KEY, "true");
}

/**
 * Always mounted, and deliberately shaped as a wrapper with exactly one store
 * selector above its early return, with every other hook in the inner
 * component.
 *
 * That split is not style: an always-mounted component whose hook list changes
 * reproduces a Fast Refresh hook-order failure that looks like a real bug and
 * is not (docs/solutions/developer-experience/fast-refresh-hook-order-error-on-
 * always-mounted-ui-during-branch-merge.md). Keeping the conditional and the
 * hooks in different components makes "no hooks before the conditional"
 * structurally true rather than a thing to remember.
 */
export function TouchControls({ engineRef }: { engineRef?: React.RefObject<Engine | null> }) {
  const source = useGameStore((s) => s.inputSource);

  if (!touchControlsVisible(source)) return null;
  return <TouchOverlay engineRef={engineRef} />;
}

function TouchOverlay({ engineRef }: { engineRef?: React.RefObject<Engine | null> }) {
  const m = useHudMetrics();
  const viewport = useViewport();
  const env = useViewportEnv();
  const layout = touchControlLayout(viewport.w, viewport.h, m, env.insets);
  const [hintDismissed, setHintDismissed] = useState(() => touchHintSeen());
  const panelOpen = useInventoryStore(panelIsOpen);

  const ringRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const radius = layout.joystickRadius;

  // The joystick is drawn from the source's own state rather than from a second
  // copy of the thumb kept here, and it is written straight to the DOM in an
  // animation frame instead of through React state: a floating stick moves on
  // every frame it is held, and re-rendering the whole overlay at that rate to
  // move one circle would be the most expensive thing on the screen.
  useEffect(() => {
    let frame = 0;
    const tick = () => {
      frame = requestAnimationFrame(tick);
      const ring = ringRef.current;
      const knob = knobRef.current;
      if (!ring || !knob) return;

      const view = engineRef?.current?.touch.getJoystick() ?? null;
      if (!view) {
        ring.style.opacity = "0";
        knob.style.opacity = "0";
        return;
      }

      const place = joystickPlacement(view, radius);
      ring.style.opacity = "1";
      knob.style.opacity = "1";
      ring.style.transform = `translate(${place.anchorX}px, ${place.anchorY}px) translate(-50%, -50%)`;
      knob.style.transform = `translate(${place.knobX}px, ${place.knobY}px) translate(-50%, -50%)`;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [engineRef, radius]);

  const hold = (intent: HeldIntent, down: boolean) => {
    engineRef?.current?.touch.holdButton(intent, down);
  };
  const press = (intent: EdgeIntent) => {
    engineRef?.current?.touch.pressButton(intent);
  };

  const dismissHint = () => {
    markTouchHintSeen();
    setHintDismissed(true);
  };

  // With a panel up, every control below is either suppressed (the frame loop
  // drains gameplay input while a panel is open) or hidden behind it, and the
  // panels themselves say "Press E to close" — which a phone cannot do. So the
  // overlay collapses to the one control that is still meaningful: the same
  // press the dock control makes, which toggles whichever panel is up shut.
  //
  // Above the panels rather than under them, unlike everything else here.
  if (panelOpen) {
    return (
      <div className="absolute inset-0 pointer-events-none z-40 select-none">
        <div className="absolute" style={{ right: layout.edgeRight, top: layout.edgeTop }}>
          <IconButton
            control={{ intent: HOTBAR_DOCK_INTENT, label: "Close", glyph: "close" }}
            size={layout.iconButton}
            onPress={press}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 pointer-events-none z-20 select-none">
      {/* Floating joystick — anchored wherever the thumb landed (R6). */}
      <div
        ref={ringRef}
        className="absolute top-0 left-0 rounded-full border-2 border-white/45 bg-black/25"
        style={{
          width: radius * 2,
          height: radius * 2,
          opacity: 0,
          transition: "opacity 120ms linear",
        }}
      />
      <div
        ref={knobRef}
        className="absolute top-0 left-0 rounded-full border-2 border-white/70 bg-white/35"
        style={{
          width: layout.joystickKnob,
          height: layout.joystickKnob,
          opacity: 0,
          transition: "opacity 120ms linear",
        }}
      />

      {/* Jump and crouch, stacked in the bottom-right corner (R9). */}
      <div
        className="absolute flex flex-col-reverse items-center"
        style={{
          right: layout.edgeRight,
          bottom: layout.actionBottom,
          gap: layout.actionGap,
        }}
      >
        {TOUCH_HOLD_CONTROLS.map((control) => (
          <HoldButton
            key={control.intent}
            control={control}
            size={layout.actionButton}
            onHold={hold}
          />
        ))}
      </div>

      {/* Chat, map and pause — small icons down the left edge, under the HUD's
          sun/moon box. */}
      <div
        className="absolute flex flex-col"
        style={{ left: layout.edgeLeft, top: layout.iconTop, gap: layout.iconGap }}
      >
        {TOUCH_CORNER_CONTROLS.map((control) => (
          <IconButton
            key={control.intent}
            control={control}
            size={layout.iconButton}
            onPress={press}
          />
        ))}
      </div>

      {!hintDismissed && <GestureHint onDismiss={dismissHint} scale={m.scale} />}
    </div>
  );
}

/** Viewport size, kept current across rotation. */
function useViewport(): { w: number; h: number } {
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const read = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    read();
    window.addEventListener("resize", read);
    // Some mobile browsers report the pre-rotation size on "resize" alone.
    window.addEventListener("orientationchange", read);
    return () => {
      window.removeEventListener("resize", read);
      window.removeEventListener("orientationchange", read);
    };
  }, []);

  return size;
}

const CONTROL_CLASS =
  "flex items-center justify-center rounded-full border border-white/25 bg-black/45 text-white/90 active:bg-white/25";

/**
 * A button that holds an intent down.
 *
 * It captures the pointer on press so a thumb that slides off the button while
 * ascending keeps flying, and releases on every way the gesture can end —
 * lift, cancel, lost capture — because the one path left out is the one that
 * leaves the player jumping forever.
 */
function HoldButton({
  control,
  size,
  onHold,
}: {
  control: TouchHoldControl;
  size: number;
  onHold: (intent: HeldIntent, down: boolean) => void;
}) {
  return (
    <button
      type="button"
      aria-label={control.label}
      className={CONTROL_CLASS}
      style={{ width: size, height: size, pointerEvents: "auto", touchAction: "none" }}
      onPointerDown={(e) => {
        e.preventDefault();
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // Capture is an optimisation; without it the release handlers below
          // still fire on the element the finger started on.
        }
        onHold(control.intent, true);
      }}
      onPointerUp={(e) => {
        e.preventDefault();
        onHold(control.intent, false);
      }}
      onPointerCancel={() => onHold(control.intent, false)}
      onLostPointerCapture={() => onHold(control.intent, false)}
    >
      <ArrowGlyph direction={control.glyph} size={Math.round(size * 0.42)} />
    </button>
  );
}

/** A corner icon that means one press. */
function IconButton({
  control,
  size,
  onPress,
}: {
  control: TouchEdgeControl;
  size: number;
  onPress: (intent: EdgeIntent) => void;
}) {
  return (
    <button
      type="button"
      aria-label={control.label}
      className={CONTROL_CLASS}
      style={{ width: size, height: size, pointerEvents: "auto", touchAction: "none" }}
      onPointerDown={(e) => {
        // On press, not on click: a synthesized click after a tap is exactly
        // what the compatibility-mouse suppression elsewhere exists to drop.
        e.preventDefault();
        onPress(control.intent);
      }}
    >
      <CornerGlyph kind={control.glyph} size={Math.round(size * 0.45)} />
    </button>
  );
}

/** The one-time card teaching the three unlabelled play-surface gestures (R13). */
function GestureHint({ onDismiss, scale }: { onDismiss: () => void; scale: number }) {
  const font = Math.round(clamp(14 * scale, 11, 16));
  return (
    <div
      className="absolute left-1/2 -translate-x-1/2 rounded-lg border border-white/15 bg-black/75 px-4 py-3"
      style={{ top: "18%", pointerEvents: "auto", maxWidth: "70vw" }}
    >
      <ul className="flex flex-col gap-1">
        {TOUCH_HINT_LINES.map((line) => (
          <li key={line.gesture} className="font-mono text-white/85" style={{ fontSize: font }}>
            <span className="font-bold text-cyan-300">{line.gesture}</span> — {line.meaning}
          </li>
        ))}
      </ul>
      <button
        type="button"
        onPointerDown={(e) => {
          e.preventDefault();
          onDismiss();
        }}
        className="mt-3 w-full rounded border border-white/20 bg-white/10 font-mono text-white/90"
        style={{
          fontSize: font,
          minHeight: TOUCH_TARGET_MIN,
          pointerEvents: "auto",
          touchAction: "none",
        }}
      >
        Got it
      </button>
    </div>
  );
}

function ArrowGlyph({ direction, size }: { direction: "up" | "down"; size: number }) {
  const points = direction === "up" ? "12,4 20,16 4,16" : "4,8 20,8 12,20";
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="block">
      <polygon points={points} fill="currentColor" />
    </svg>
  );
}

function CornerGlyph({ kind, size }: { kind: TouchEdgeControl["glyph"]; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="block">
      {kind === "close" && (
        <path
          d="M5 5l14 14M19 5L5 19"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      )}
      {kind === "pause" && (
        <>
          <rect x="6" y="4" width="4" height="16" fill="currentColor" />
          <rect x="14" y="4" width="4" height="16" fill="currentColor" />
        </>
      )}
      {kind === "chat" && (
        <path
          d="M3 5h18v11H9l-6 4V5z"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      )}
      {kind === "map" && (
        <path
          d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2V6z"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}
