"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ArrowLeft, SendHorizontal, Loader2, Plus, Trash2, History as HistoryIcon, PanelRight, Mic, Volume2, VolumeX } from "lucide-react";
import type { ChatMessage } from "@/lib/types";
import { buildSystemPrompt, getPersona, getVoice, localize } from "@/lib/personas";
import type { StackClient } from "@/lib/stackClient";
import { useConversations, getConversation, saveMessages } from "@/lib/conversations";
import { useLanguage } from "@/lib/useLanguage";
import { codeFromName } from "@/lib/languages";
import { speak, speakStream, stopSpeaking, listenOnce, preloadVoice } from "@/lib/voice";
import { useT } from "@/lib/i18n";
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
  const t = useT();
  const { conversations, remove } = useConversations();
  const conv = getConversation(conversationId);
  const persona = conv ? getPersona(conv.personaId) : undefined;
  // History is per-character: only show chats with this persona.
  const personaChats = conv ? conversations.filter((c) => c.personaId === conv.personaId) : [];

  const [messages, setMessages] = useState<ChatMessage[]>(conv?.messages ?? []);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [panel, setPanel] = useState(false); // right panel on mobile
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // voice
  const { code } = useLanguage();
  const [voiceOn, setVoiceOn] = useState(true);
  const [call, setCall] = useState(false);
  const [voiceState, setVoiceState] = useState<"idle" | "preparing" | "listening" | "thinking" | "speaking">("idle");
  const [voiceErr, setVoiceErr] = useState<string | null>(null);
  const callRef = useRef(false);
  const callAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setVoiceOn(localStorage.getItem("tryll.voice") !== "0");
  }, []);

  const toggleVoice = () =>
    setVoiceOn((v) => {
      const nv = !v;
      try {
        localStorage.setItem("tryll.voice", nv ? "1" : "0");
      } catch {
        /* ignore */
      }
      if (!nv) stopSpeaking();
      return nv;
    });

  // The reply is in the conversation's language — tell the TTS engine so it
  // pronounces Russian (and the rest) correctly instead of as English.
  const chatLang = conv ? codeFromName(conv.language) : code;

  const sayReply = (text: string) => {
    if (voiceOn && text && persona) void speak(text, getVoice(persona.id), chatLang).catch(() => {});
  };

  const commit = (msgs: ChatMessage[]) => {
    setMessages(msgs);
    saveMessages(conversationId, msgs);
  };

  function stopCall() {
    callRef.current = false;
    setCall(false);
    callAbortRef.current?.abort();
    stopSpeaking();
    setVoiceState("idle");
  }

  // Hands-free call: listen (VAD) -> auto-send -> voiced reply -> listen again.
  async function startCall() {
    if (callRef.current) {
      stopCall();
      return;
    }
    callRef.current = true;
    setCall(true);
    setVoiceErr(null);

    // Make sure the voice models are in the browser cache before we listen,
    // otherwise the very first turn hangs silently on a multi-hundred-MB
    // model download with no feedback.
    setVoiceState("preparing");
    try {
      await preloadVoice();
    } catch (e) {
      console.error("[voice] preload failed", e);
      if (callRef.current) setVoiceErr(e instanceof Error ? e.message : String(e));
      callRef.current = false;
      setCall(false);
      setVoiceState("idle");
      return;
    }
    if (!callRef.current) {
      setVoiceState("idle");
      return;
    }

    let first = true;
    while (callRef.current) {
      setVoiceState("listening");
      const ac = new AbortController();
      callAbortRef.current = ac;
      let text = "";
      try {
        text = await listenOnce(code, { silenceMs: first ? 1500 : 2500, signal: ac.signal });
      } catch (e) {
        console.error("[voice] listen failed", e);
        if (callRef.current) setVoiceErr(e instanceof Error ? e.message : String(e));
        break;
      }
      first = false;
      if (!callRef.current) break;
      if (!text.trim()) continue;
      setVoiceState("thinking");
      await sendText(text, { speakAndWait: true, onSpeakStart: () => setVoiceState("speaking") });
      if (!callRef.current) break;
    }
    callRef.current = false;
    setCall(false);
    setVoiceState("idle");
  }

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
        // English: use the persona's hand-written greeting verbatim (best
        // quality, zero cost). Other languages: GENERATE a fresh greeting in
        // that language — asking a 3B model to "translate this line" is
        // unreliable (it often just echoes the English), so we let it speak
        // its own opening instead. The system prompt's anti-impersonation
        // block keeps it greeting the user, not itself.
        const greetInstr =
          chatLang === "en"
            ? `This is your very first line to the user. Say exactly this, word for word, and nothing else: "${persona.greeting}"`
            : `This is the very first message of the chat. Greet the user — a newcomer you've just met, whose name you don't know — in character, written in ${conv.language}, in one or two short natural sentences. Greet THEM and invite them to talk; never use your own name for them.`;
        try {
          await client.chat(
            id,
            greetInstr,
            (t) => {
              acc += t;
              if (alive) setMessages([{ id: botId, role: "assistant", text: acc, streaming: true, ts: Date.now() }]);
            },
            ac.signal,
          );
        } finally {
          if (alive) {
            commit([{ id: botId, role: "assistant", text: acc, ts: Date.now() }]);
            sayReply(acc);
          }
        }
      }
    })();

    return () => {
      alive = false;
      abortRef.current?.abort();
      stopSpeaking();
      callRef.current = false;
      callAbortRef.current?.abort();
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

  async function sendText(
    raw: string,
    opts: { speakAndWait?: boolean; onSpeakStart?: () => void } = {},
  ): Promise<string> {
    const text = raw.trim();
    if (!text || !agentId || sending) return "";
    setSending(true);

    const userMsg: ChatMessage = { id: uid(), role: "user", text, ts: Date.now() };
    const botId = uid();
    setMessages((m) => [...m, userMsg, { id: botId, role: "assistant", text: "", streaming: true, ts: Date.now() }]);

    const ac = new AbortController();
    abortRef.current = ac;
    let acc = "";
    // Stream the voice sentence-by-sentence so the first sentence plays while
    // the rest of the reply is still being generated, instead of waiting for
    // the whole reply to finish.
    const speech =
      persona && (voiceOn || opts.speakAndWait)
        ? speakStream(getVoice(persona.id), chatLang, { onStart: opts.onSpeakStart })
        : null;
    try {
      await client.chat(
        agentId,
        text,
        (t) => {
          acc += t;
          setMessages((m) => m.map((x) => (x.id === botId ? { ...x, text: acc } : x)));
          speech?.push(t);
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

    // Wait for all audio to finish playing (call mode listens again after this).
    if (speech) await speech.end();
    return acc;
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
          <span className={cn("ml-1 text-xs", call ? "text-primary" : connecting ? "text-muted-2" : "text-success")}>
            {call && voiceState !== "idle"
              ? t(`chat.${voiceState}`)
              : connecting
                ? t("chat.connecting")
                : t("chat.online")}
          </span>
          <button
            onClick={toggleVoice}
            className={cn(
              "ml-auto grid size-9 place-items-center rounded-full transition hover:bg-surface",
              voiceOn ? "text-primary" : "text-muted-2 hover:text-fg",
            )}
            aria-label="Toggle voice"
            title={voiceOn ? "Voice on" : "Voice off"}
          >
            {voiceOn ? <Volume2 className="size-5" /> : <VolumeX className="size-5" />}
          </button>
          <button onClick={() => setPanel((p) => !p)} className="grid size-9 place-items-center rounded-full text-muted hover:bg-surface hover:text-fg lg:hidden" aria-label="Panel">
            <PanelRight className="size-5" />
          </button>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-2xl px-4 pb-6">
            {/* centered character intro (c.ai style) */}
            <div className="flex flex-col items-center pt-6 pb-8 text-center">
              <Avatar name={persona.name} gradient={persona.gradient} src={persona.image} size={84} ring />
              <h2 className="mt-3 text-xl font-semibold">{persona.name}</h2>
              <p className="mt-1 max-w-md text-sm text-muted">{localize(persona, code).blurb}</p>
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
          {voiceErr && (
            <div className="mb-2 flex items-start justify-between gap-3 rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
              <span>Voice: {voiceErr}</span>
              <button type="button" onClick={() => setVoiceErr(null)} className="shrink-0 opacity-70 hover:opacity-100">
                ✕
              </button>
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const txt = input;
              setInput("");
              void sendText(txt);
            }}
            className="flex items-center gap-2 rounded-full border border-border-soft bg-surface px-2 py-1.5 focus-within:border-primary/50"
          >
            <button
              type="button"
              onClick={startCall}
              disabled={connecting}
              className={cn(
                "grid size-10 shrink-0 place-items-center rounded-full transition disabled:opacity-40",
                call ? "animate-pulse bg-danger text-white" : "text-muted hover:bg-surface-2 hover:text-fg",
              )}
              aria-label="Voice call"
              title="Hands-free voice chat"
            >
              <Mic className="size-4" />
            </button>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={connecting ? t("chat.waking") : t("chat.placeholder", { name: persona.name })}
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
            <Plus className="size-4" /> {t("chat.newchat")}
          </button>
        </div>

        <div className="mt-5 flex items-center gap-2 px-4 text-xs font-medium uppercase tracking-wide text-muted-2">
          <HistoryIcon className="size-3.5" /> {t("chat.history")}
        </div>
        <div className="no-scrollbar mt-1 max-h-[calc(100dvh-12rem)] overflow-y-auto px-2 pb-4">
          {personaChats.map((c) => {
            const p = getPersona(c.personaId);
            const last = c.messages[c.messages.length - 1]?.text ?? t("chat.newchat");
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
