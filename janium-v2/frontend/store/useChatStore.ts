import { create } from "zustand";
import { persist } from "zustand/middleware";
import { ChatCompletionRequestMessage } from "openai";

interface ChatStore {
  messages: ChatCompletionRequestMessage[];

  // Actions
  addMessage: (message: ChatCompletionRequestMessage) => void;
  setMessages: (messages: ChatCompletionRequestMessage[]) => void;
  clearMessages: () => void;
  removeLastMessage: () => void;
}

export const useChatStore = create<ChatStore>()(
  persist(
    (set) => ({
      messages: [],

      addMessage: (message) =>
        set((state) => ({
          messages: [...state.messages, message],
        })),

      setMessages: (messages) => set({ messages }),

      clearMessages: () => set({ messages: [] }),

      removeLastMessage: () =>
        set((state) => ({
          messages: state.messages.slice(0, -1),
        })),
    }),
    {
      name: "chat-storage", // unique name for localStorage
    }
  )
);
