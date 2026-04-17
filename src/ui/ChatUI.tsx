"use client";

import { useEffect, useRef, useState } from "react";
import { useChatStore } from "@store/useChatStore";
import { useGameStore } from "@store/useGameStore";
import type { MultiplayerChatMessage } from "@lib/multiplayer/types";

const FADE_MS = 8000;
const TAIL = 20;

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
  const inputRef = useRef<HTMLInputElement>(null);
  const [now, setNow] = useState(() => Date.now());

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
    <div className="pointer-events-none absolute left-3 bottom-[140px] z-20 flex max-w-[520px] flex-col gap-0.5">
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
            style={{ textShadow: "1px 1px 0 #000" }}
            maxLength={256}
            placeholder="Say something..."
          />
        </form>
      )}
    </div>
  );
}
