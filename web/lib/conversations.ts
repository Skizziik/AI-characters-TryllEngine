"use client";

import { useEffect, useReducer } from "react";
import type { ChatMessage } from "./types";

/** A saved chat: one persona, one thread of messages, in one language. */
export interface Conversation {
  id: string;
  personaId: string;
  language: string; // language name injected into the system prompt
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

const KEY = "tryll.conversations";

const uid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

let cache: Conversation[] | null = null;
const listeners = new Set<() => void>();

function load(): Conversation[] {
  if (cache) return cache;
  if (typeof localStorage === "undefined") return (cache = []);
  try {
    cache = JSON.parse(localStorage.getItem(KEY) ?? "[]") as Conversation[];
  } catch {
    cache = [];
  }
  return cache!;
}

/** Cap what we WRITE per conversation — localStorage is ~5 MB total and one
 *  long chat can quietly eat it. The in-memory list stays uncapped. */
const MAX_SAVED_MESSAGES = 200;

function serialize(list: Conversation[]): string {
  return JSON.stringify(
    list.map((c) =>
      c.messages.length > MAX_SAVED_MESSAGES ? { ...c, messages: c.messages.slice(-MAX_SAVED_MESSAGES) } : c,
    ),
  );
}

function persist(list: Conversation[]) {
  cache = list;
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem(KEY, serialize(list));
    } catch {
      // Quota exceeded — drop the oldest chats from the WRITE until it fits.
      const trimmed = [...list].sort((a, b) => b.updatedAt - a.updatedAt);
      while (trimmed.length > 1) {
        trimmed.pop();
        try {
          localStorage.setItem(KEY, serialize(trimmed));
          break;
        } catch {
          /* keep dropping */
        }
      }
    }
  }
  listeners.forEach((l) => l());
}

export function listConversations(): Conversation[] {
  return [...load()].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getConversation(id: string | null): Conversation | undefined {
  if (!id) return undefined;
  return load().find((c) => c.id === id);
}

export function createConversation(personaId: string, language: string): Conversation {
  const c: Conversation = {
    id: uid(),
    personaId,
    language,
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  persist([c, ...load()]);
  return c;
}

export function saveMessages(id: string, messages: ChatMessage[]) {
  const list = load();
  const c = list.find((x) => x.id === id);
  if (!c) return;
  c.messages = messages;
  c.updatedAt = Date.now();
  persist([...list]);
}

export function removeConversation(id: string) {
  persist(load().filter((c) => c.id !== id));
}

/** React view of the conversation store; re-renders on any change. */
export function useConversations() {
  const [, bump] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    const fn = () => bump();
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);
  return {
    conversations: listConversations(),
    create: createConversation,
    save: saveMessages,
    remove: removeConversation,
    get: getConversation,
  };
}
