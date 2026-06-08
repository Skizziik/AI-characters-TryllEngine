"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ArrowLeft, SendHorizontal, Loader2 } from "lucide-react";
import type { ChatMessage, Persona } from "@/lib/types";
import { buildSystemPrompt } from "@/lib/personas";
import type { StackClient } from "@/lib/stackClient";
import { Avatar } from "./Avatar";
import { cn } from "@/lib/cn";

const uid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

export function ChatView({
  persona,
  client,
  onBack,
}: {
  persona: Persona;
  client: StackClient;
  onBack: () => void;
}) {
  const [agentId, setAgentId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // create the agent for this persona on mount
  useEffect(() => {
    let alive = true;
    setMessages([]);
    setAgentId(null);
    (async () => {
      const id = await client.createPersona(persona, buildSystemPrompt(persona));
      if (!alive) return;
      setAgentId(id);
      setMessages([
        { id: uid(), role: "assistant", text: persona.greeting, ts: Date.now() },
      ]);
    })();
    return () => {
      alive = false;
      abortRef.current?.abort();
    };
  }, [persona, client]);

  // autoscroll
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || !agentId || sending) return;
    setInput("");
    setSending(true);

    const userMsg: ChatMessage = { id: uid(), role: "user", text, ts: Date.now() };
    const botId = uid();
    setMessages((m) => [
      ...m,
      userMsg,
      { id: botId, role: "assistant", text: "", streaming: true, ts: Date.now() },
    ]);

    const ac = new AbortController();
    abortRef.current = ac;
    try {
      await client.chat(
        agentId,
        text,
        (tok) =>
          setMessages((m) =>
            m.map((msg) => (msg.id === botId ? { ...msg, text: msg.text + tok } : msg)),
          ),
        ac.signal,
      );
    } finally {
      setMessages((m) => m.map((msg) => (msg.id === botId ? { ...msg, streaming: false } : msg)));
      setSending(false);
    }
  }

  const connecting = agentId === null;

  return (
    <div className="mx-auto flex h-dvh max-w-3xl flex-col px-4">
      {/* header */}
      <header className="flex items-center gap-3 border-b border-border-soft py-3.5">
        <button
          onClick={onBack}
          className="grid size-9 place-items-center rounded-full text-muted transition hover:bg-surface hover:text-fg"
          aria-label="Back"
        >
          <ArrowLeft className="size-5" />
        </button>
        <Avatar name={persona.name} gradient={persona.gradient} src={persona.image} size={40} ring />
        <div className="min-w-0">
          <p className="truncate font-semibold leading-tight">{persona.name}</p>
          <p className="truncate text-xs text-muted">
            {connecting ? "connecting…" : "online · local"}
          </p>
        </div>
      </header>

      {/* messages */}
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto py-6">
        <AnimatePresence initial={false}>
          {messages.map((m) => (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn("flex items-end gap-2.5", m.role === "user" && "flex-row-reverse")}
            >
              {m.role === "assistant" && (
                <Avatar name={persona.name} gradient={persona.gradient} src={persona.image} size={30} />
              )}
              <div
                className={cn(
                  "max-w-[78%] rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed",
                  m.role === "user"
                    ? "gradient-primary text-white"
                    : "border border-border-soft bg-surface text-fg",
                )}
              >
                {m.text}
                {m.streaming && (
                  <span className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 animate-pulse bg-primary align-middle" />
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* composer */}
      <div className="border-t border-border-soft py-3.5">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
          className="flex items-center gap-2 rounded-full border border-border-soft bg-surface px-2 py-1.5 focus-within:border-primary/50"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={connecting ? "Waking up the character…" : `Message ${persona.name}…`}
            disabled={connecting}
            className="flex-1 bg-transparent px-3 py-2 text-[15px] outline-none placeholder:text-muted-2 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={connecting || sending || !input.trim()}
            className="grid size-10 place-items-center rounded-full gradient-primary text-white transition enabled:hover:brightness-110 disabled:opacity-40"
            aria-label="Send"
          >
            {sending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <SendHorizontal className="size-4" />
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
