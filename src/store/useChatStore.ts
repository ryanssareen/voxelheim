import { create } from "zustand";
import type { MultiplayerChatMessage } from "@lib/multiplayer/types";

const MAX_MESSAGES = 80;

interface ChatState {
  messages: MultiplayerChatMessage[];
  composing: boolean;
  draft: string;
  appendMessage: (message: MultiplayerChatMessage) => void;
  setComposing: (open: boolean) => void;
  setDraft: (draft: string) => void;
  clear: () => void;
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  composing: false,
  draft: "",

  appendMessage: (message) =>
    set((state) => {
      if (state.messages.some((m) => m.id === message.id)) return state;
      const next = [...state.messages, message];
      if (next.length > MAX_MESSAGES) {
        next.splice(0, next.length - MAX_MESSAGES);
      }
      return { messages: next };
    }),

  setComposing: (composing) =>
    set((state) => ({
      composing,
      draft: composing ? state.draft : "",
    })),

  setDraft: (draft) => set({ draft }),

  clear: () => set({ messages: [], composing: false, draft: "" }),
}));
