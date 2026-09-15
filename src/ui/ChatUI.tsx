"use client";

import { useEffect, useRef, useState } from "react";
import { useChatStore } from "@store/useChatStore";
import { useGameStore } from "@store/useGameStore";
import { useViewportEnv } from "@ui/useViewportEnv";
import { TOUCH_TARGET_MIN } from "@ui/TouchControls";
import type { MultiplayerChatMessage } from "@lib/multiplayer/types";

const FADE_MS = 8000;
const TAIL = 20;

/**
 * Where the log sits above the bottom of the viewport when no keyboard is up,
 * px. The hotbar strip and the touch action buttons live under this.
 */
const RESTING_BOTTOM = 140;

/**
 * Gap between the composer and the top of the soft keyboard, px.
 *
 * Small on purpose: every pixel spent here is a line of chat history pushed off
 * a landscape phone, where the visible viewport with a keyboard up can be under
 * 200 px tall.
 */
const KEYBOARD_GAP = 8;

/**
 * How far up the chat column must sit to clear the soft keyboard.
 *
 * `window.innerHeight` does not change when a keyboard opens; `visualViewport`
 * does, and the difference between them *is* the keyboard (plus any browser
 * chrome overlapping the page). So the composer is positioned against that
 * difference rather than against a guessed keyboard height, which differs by
 * device, by language, and by whether a suggestion strip is showing.
 *
 * Returns the resting offset whenever the difference is nil or negative, which
 * covers every desktop browser and a phone with the keyboard closed.
 */
export function chatBottomOffset(windowHeight: number, visualHeight: number): number {
  const occluded = windowHeight - visualHeight;
  if (!Number.isFinite(occluded) || occluded <= 0) return RESTING_BOTTOM;
  return Math.round(occluded + KEYBOARD_GAP);
}

function kindColor(kind: MultiplayerChatMessage["kind"]): string {
  if (kind === "death") return "text-red-300";
  if (kind === "system") return "text-yellow-200";
  return "text-white";
}

function formatMessage(message: MultiplayerChatMessage): React.ReactNode {
  if (message.kind === "death") {
    return (
      <span className="font-mono text-[13px] text-red-300" style={{ textShadow: "1px 1px 0 #000" }}>
        {message.text}
      </span>
    );
  }
  if (message.kind === "system") {
    return (
      <span className="font-mono text-[13px] text-yellow-200/90" style={{ textShadow: "1px 1px 0 #000" }}>
        {message.text}
      </span>
    );
  }
  return (
    <span className="font-mono text-[13px]" style={{ textShadow: "1px 1px 0 #000" }}>
      <span className="text-cyan-300">&lt;{message.name}&gt;</span>{" "}
      <span className={kindColor(message.kind)}>{message.text}</span>
    </span>
  );
}

interface ChatUIProps {
  onSend: (text: string) => void;
  /** External open trigger (e.g., T keypress from Engine input) */
  openRequest: number;
}

export function ChatUI({ onSend, openRequest }: ChatUIProps) {
  const messages = useChatStore((s) => s.messages);
  const composing = useChatStore((s) => s.composing);
  const draft = useChatStore((s) => s.draft);
  const setComposing = useChatStore((s) => s.setComposing);
  const setDraft = useChatStore((s) => s.setDraft);
  const isDead = useGameStore((s) => s.isDead);
  const isPaused = useGameStore((s) => s.isPaused);
  const touchMode = useGameStore((s) => s.inputSource) === "touch";
  const env = useViewportEnv();
  const inputRef = useRef<HTMLInputElement>(null);
  const [now, setNow] = useState(() => Date.now());

  // The window height is read here rather than from the env, which reports the
  // *visual* viewport. Both are needed: their difference is the keyboard.
  const windowHeight = typeof window === "undefined" ? env.height : window.innerHeight;
  const bottom = composing
    ? chatBottomOffset(windowHeight, env.height) + env.insets.bottom
    : RESTING_BOTTOM + env.insets.bottom;

  // Open on T keypress from Engine (via openRequest counter bump)
  useEffect(() => {
    if (openRequest === 0) return;
    if (isDead || isPaused) return;
    setComposing(true);
  }, [openRequest, isDead, isPaused, setComposing]);

  // Focus input when opening
  useEffect(() => {
    if (composing) {
      inputRef.current?.focus();
    }
  }, [composing]);

  // Tick to drive fade-out
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, []);

  const visible = composing
    ? messages.slice(-TAIL)
    : messages.slice(-TAIL).filter((m) => now - m.createdAt < FADE_MS);

  if (visible.length === 0 && !composing) return null;

  return (
    <div
      className="pointer-events-none absolute z-20 flex max-w-[520px] flex-col gap-0.5"
      style={{ left: 12 + env.insets.left, bottom }}
    >
      {visible.map((message) => {
        const age = now - message.createdAt;
        const fadeOpacity = composing
          ? 1
          : age < FADE_MS - 1500
            ? 1
            : Math.max(0, (FADE_MS - age) / 1500);
        return (
          <div
            key={message.id}
            className="bg-black/45 px-2 py-[2px] rounded-sm"
            style={{ opacity: fadeOpacity }}
          >
            {formatMessage(message)}
          </div>
        );
      })}

      {composing && (
        <form
          className="pointer-events-auto mt-1 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const text = draft.trim();
            if (text) onSend(text);
            setComposing(false);
          }}
        >
          <input
            ref={inputRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value.slice(0, 256))}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                setComposing(false);
              }
            }}
            className="flex-1 bg-black/70 border border-white/20 px-2 py-1 text-[13px] text-white font-mono outline-none focus:border-cyan-400/50"
            style={{
              textShadow: "1px 1px 0 #000",
              // 16px or larger, or iOS Safari zooms the whole page the moment
              // the field takes focus — and the game is then scrolled and
              // scaled with no way back short of a reload.
              fontSize: touchMode ? 16 : undefined,
              minHeight: touchMode ? TOUCH_TARGET_MIN : undefined,
            }}
            maxLength={256}
            placeholder="Say something..."
            // Chat is prose; the autocorrect stack helps. Capitalisation is off
            // because the first word is as often a command as a sentence.
            autoCapitalize="off"
            autoComplete="off"
            // Tells a soft keyboard to label its action key "Send" rather than
            // "Return", which is the only submit affordance on a phone besides
            // the button beside it.
            enterKeyHint="send"
          />
          {/* Touch only: a keyboard has Enter to send and Escape to leave, and
              a finger has neither. Send is a `type="submit"` rather than a
              click handler so it runs the form's own submit path — the same one
              the soft keyboard's Send key takes — leaving one code path to be
              wrong in rather than two. */}
          {touchMode && (
            <>
              <button
                type="submit"
                aria-label="Send"
                className="shrink-0 rounded border border-white/20 bg-white/10 px-3 font-mono text-[13px] text-white/90"
                style={{ minHeight: TOUCH_TARGET_MIN, minWidth: TOUCH_TARGET_MIN }}
              >
                Send
              </button>
              <button
                type="button"
                aria-label="Close chat"
                onClick={() => setComposing(false)}
                className="shrink-0 rounded border border-white/15 bg-white/5 px-3 font-mono text-[13px] text-white/60"
                style={{ minHeight: TOUCH_TARGET_MIN, minWidth: TOUCH_TARGET_MIN }}
              >
                ✕
              </button>
            </>
          )}
        </form>
      )}
    </div>
  );
}
