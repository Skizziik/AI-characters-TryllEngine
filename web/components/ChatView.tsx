"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ArrowLeft, SendHorizontal, Loader2, Plus, Trash2, History as HistoryIcon, PanelRight } from "lucide-react";
import type { ChatMessage } from "@/lib/types";
import { buildSystemPrompt, getPersona } from "@/lib/personas";
import type { StackClient } from "@/lib/stackClient";
import { useConversations, getConversation, saveMessages } from "@/lib/conversations";
import { Avatar } from "./Avatar";
import { cn } from "@/lib/cn";

const uid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

export function ChatView({
  conversationId,
  client,
  onBack,
  onSwitch,
  onNewChat,
}: {
  conversationId: string;
  client: StackClient;
  onBack: () => void;
  onSwitch: (id: string) => void;
  onNewChat: () => void;
}) {
  const { conversations, remove } = useConversations();
  const conv = getConversation(conversationId);
  const persona = conv ? getPersona(conv.personaId) : undefined;

  const [messages, setMessages] = useState<ChatMessage[]>(conv?.messages ?? []);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [panel, setPanel] = useState(false); // right panel on mobile
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const commit = (msgs: ChatMessage[]) => {
    setMessages(msgs);
    saveMessages(conversationId, msgs);
  };

  // (Re)create the agent when the conversation changes; greet a fresh one.
  useEffect(() => {
    if (!persona || !conv) return;
    let alive = true;
    setAgentId(null);
    setMessages(conv.messages);

    (async () => {
      const id = await client.createPersona(persona, buildSystemPrompt(persona, conv.language));
      if (!alive) return;
      setAgentId(id);

      if (conv.messages.length === 0) {
        const botId = uid();
        setMessages([{ id: botId, role: "assistant", text: "", streaming: true, ts: Date.now() }]);
        const ac = new AbortController();
        abortRef.current = ac;
        let acc = "";
        try {
          await client.chat(
            id,
            `Open the conversation: greet me in character to start, in ${conv.language}. One or two short sentences.`,
            (t) => {
              acc += t;
              if (alive) setMessages([{ id: botId, role: "assistant", text: acc, streaming: true, ts: Date.now() }]);
            },
            ac.signal,
          );
        } finally {
          if (alive) commit([{ id: botId, role: "assistant", text: acc, ts: Date.now() }]);
        }
      }
    })();

    return () => {
      alive = false;
      abortRef.current?.abort();
      setAgentId((cur) => {
        if (cur) void client.closeAgent(cur);
        return null;
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, client]);

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
    setMessages((m) => [...m, userMsg, { id: botId, role: "assistant", text: "", streaming: true, ts: Date.now() }]);

    const ac = new AbortController();
    abortRef.current = ac;
    let acc = "";
    try {
      await client.chat(
        agentId,
        text,
        (t) => {
          acc += t;
          setMessages((m) => m.map((x) => (x.id === botId ? { ...x, text: acc } : x)));
        },
        ac.signal,
      );
    } finally {
      setMessages((m) => {
        const final = m.map((x) => (x.id === botId ? { ...x, text: acc, streaming: false } : x));
        saveMessages(conversationId, final);
        return final;
      });
      setSending(false);
    }
  }

  if (!conv || !persona) {
    return (
      <div className="grid h-dvh place-items-center text-muted">
        <button onClick={onBack} className="rounded-full border border-border-soft px-5 py-2.5">
          ← Back to characters
        </button>
      </div>
    );
  }

  const connecting = agentId === null;

  return (
    <div className="flex h-dvh">
      {/* main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2.5 px-4 py-3.5">
          <button onClick={onBack} className="grid size-9 place-items-center rounded-full text-muted transition hover:bg-surface hover:text-fg" aria-label="Back">
            <ArrowLeft className="size-5" />
          </button>
          <Avatar name={persona.name} gradient={persona.gradient} src={persona.image} size={34} ring />
          <p className="truncate font-semibold">{persona.name}</p>
          <span className={cn("ml-1 text-xs", connecting ? "text-muted-2" : "text-success")}>
            {connecting ? "connecting…" : "online · local"}
          </span>
          <button onClick={() => setPanel((p) => !p)} className="ml-auto grid size-9 place-items-center rounded-full text-muted hover:bg-surface hover:text-fg lg:hidden" aria-label="Panel">
            <PanelRight className="size-5" />
          </button>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-2xl px-4 pb-6">
            {/* centered character intro (c.ai style) */}
            <div className="flex flex-col items-center pt-6 pb-8 text-center">
              <Avatar name={persona.name} gradient={persona.gradient} src={persona.image} size={84} ring />
              <h2 className="mt-3 text-xl font-semibold">{persona.name}</h2>
              <p className="mt-1 max-w-md text-sm text-muted">{persona.blurb}</p>
            </div>

            <div className="space-y-4">
              <AnimatePresence initial={false}>
                {messages.map((m) => (
                  <motion.div
                    key={m.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={cn("flex items-end gap-2.5", m.role === "user" && "flex-row-reverse")}
                  >
                    {m.role === "assistant" && <Avatar name={persona.name} gradient={persona.gradient} src={persona.image} size={30} />}
                    <div
                      className={cn(
                        "max-w-[80%] rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed",
                        m.role === "user" ? "gradient-primary text-white" : "border border-border-soft bg-surface text-fg",
                      )}
                    >
                      {m.text}
                      {m.streaming && <span className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 animate-pulse bg-primary align-middle" />}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
        </div>

        <div className="mx-auto w-full max-w-2xl px-4 pb-4">
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
              {sending ? <Loader2 className="size-4 animate-spin" /> : <SendHorizontal className="size-4" />}
            </button>
          </form>
        </div>
      </div>

      {/* right panel: New chat + History (c.ai style) */}
      <aside
        className={cn(
          "w-72 shrink-0 border-l border-border-soft bg-bg-2/40",
          panel ? "absolute right-0 z-30 h-dvh bg-bg/95 backdrop-blur lg:static lg:bg-bg-2/40" : "hidden lg:block",
        )}
      >
        <div className="flex items-center gap-2.5 px-4 py-4">
          <Avatar name={persona.name} gradient={persona.gradient} src={persona.image} size={40} ring />
          <div className="min-w-0">
            <p className="truncate font-semibold leading-tight">{persona.name}</p>
            <p className="truncate text-xs text-muted">{persona.tagline}</p>
          </div>
        </div>

        <div className="px-3">
          <button
            onClick={onNewChat}
            className="flex w-full items-center gap-2 rounded-xl gradient-primary px-4 py-2.5 text-sm font-medium text-white ring-glow transition hover:brightness-110"
          >
            <Plus className="size-4" /> New chat
          </button>
        </div>

        <div className="mt-5 flex items-center gap-2 px-4 text-xs font-medium uppercase tracking-wide text-muted-2">
          <HistoryIcon className="size-3.5" /> History
        </div>
        <div className="no-scrollbar mt-1 max-h-[calc(100dvh-12rem)] overflow-y-auto px-2 pb-4">
          {conversations.map((c) => {
            const p = getPersona(c.personaId);
            const last = c.messages[c.messages.length - 1]?.text ?? "New chat";
            return (
              <div
                key={c.id}
                onClick={() => {
                  setPanel(false);
                  if (c.id !== conversationId) onSwitch(c.id);
                }}
                className={cn(
                  "group mb-1 flex cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 transition",
                  c.id === conversationId ? "bg-surface" : "hover:bg-surface/60",
                )}
              >
                {p && <Avatar name={p.name} gradient={p.gradient} src={p.image} size={32} />}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{p?.name ?? "Chat"}</p>
                  <p className="truncate text-xs text-muted-2">{last}</p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    remove(c.id);
                    if (c.id === conversationId) onNewChat();
                  }}
                  className="opacity-0 transition group-hover:opacity-100"
                  aria-label="Delete chat"
                >
                  <Trash2 className="size-4 text-muted-2 hover:text-danger" />
                </button>
              </div>
            );
          })}
        </div>
      </aside>
    </div>
  );
}
