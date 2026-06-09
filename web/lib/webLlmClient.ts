import type { Persona, StackState } from "./types";
import type { StackClient } from "./stackClient";

/* ── WebGPU stack client (web-llm / MLC) ───────────────────────────────────
   Zero install: the model runs entirely in the browser tab on the user's GPU
   via WebGPU. "Activate" streams the model into the browser cache with progress;
   chat is an in-tab streaming completion. No exe, no local server.

   Model: Qwen3-8B (q4f16) — the strongest EN+RU model in web-llm's prebuilt
   list that still fits an 8 GB GPU (5.7 GB VRAM). Reasoning is disabled per
   turn via Qwen's /no_think soft switch (+ defensive <think> stripping).
   If the 8B fails to load (smaller GPUs), we fall back to Qwen3-4B (3.4 GB).
   Override with NEXT_PUBLIC_WEBLLM_MODEL.
*/

const MODEL_ID = process.env.NEXT_PUBLIC_WEBLLM_MODEL ?? "Qwen3-8B-q4f16_1-MLC";
const FALLBACK_MODEL_ID = "Qwen3-4B-q4f16_1-MLC";

// Qwen3 / Qwen3.5 reason by default; turn it off for a fast, clean companion.
const isThinkingModel = (id: string) => /qwen3/i.test(id);

type Msg = { role: "system" | "user" | "assistant"; content: string };
type Conversation = { messages: Msg[] };

type Engine = {
  chat: {
    completions: {
      create: (opts: {
        messages: Msg[];
        stream: boolean;
        temperature?: number;
        top_p?: number;
        frequency_penalty?: number;
        max_tokens?: number;
      }) => Promise<AsyncIterable<{ choices: { delta: { content?: string } }[] }>>;
    };
  };
  interruptGenerate?: () => void;
};

/* The wasm builds ship with a 4096-token context window; the reply reserves
   512 of those and the system prompt several hundred more. Russian tokenizes
   at roughly 2.5 chars/token on Qwen, so a 6000-char history budget keeps
   every request safely inside the window no matter how long the chat gets. */
const HISTORY_CHAR_BUDGET = 6000;

/** Sliding window over the conversation: always the system prompt, then as
 *  many of the most recent turns as fit the budget (the latest turn always
 *  makes it in, even alone). The full history stays in memory — only the
 *  request is windowed. */
function windowMessages(messages: Msg[]): Msg[] {
  const system = messages[0]?.role === "system" ? [messages[0]] : [];
  const rest = messages.slice(system.length);
  const kept: Msg[] = [];
  let used = 0;
  for (let i = rest.length - 1; i >= 0; i--) {
    used += rest[i].content.length;
    if (kept.length > 0 && used > HISTORY_CHAR_BUDGET) break;
    kept.unshift(rest[i]);
  }
  return [...system, ...kept];
}

export class WebLlmStackClient implements StackClient {
  private engine: Engine | null = null;
  private modelId = MODEL_ID;
  private loading: Promise<void> | null = null;
  private agents = new Map<string, Conversation>();
  private seq = 0;
  private busy = false;

  async health(): Promise<boolean> {
    return this.engine !== null;
  }

  async activate(onUpdate: (s: StackState) => void): Promise<void> {
    if (this.engine) {
      onUpdate({ phase: "ready" });
      return;
    }
    if (typeof navigator === "undefined" || !("gpu" in navigator)) {
      onUpdate({ phase: "error", error: "WebGPU isn't available — use Chrome or Edge (latest)." });
      throw new Error("WebGPU unavailable");
    }
    if (this.loading) return this.loading;

    this.loading = (async () => {
      onUpdate({ phase: "downloading", progress: 0, detail: "Preparing model…" });
      const webllm = await import("@mlc-ai/web-llm");
      const load = (id: string) =>
        webllm.CreateMLCEngine(id, {
          initProgressCallback: (r: { progress: number; text: string }) => {
            onUpdate({
              phase: "downloading",
              progress: r.progress,
              detail: r.text?.replace(/\[.*?\]\s*/, "") || "Loading model…",
            });
          },
        });
      let engine;
      try {
        engine = await load(MODEL_ID);
        this.modelId = MODEL_ID;
      } catch (e) {
        console.error(`[webllm] ${MODEL_ID} failed, trying ${FALLBACK_MODEL_ID}:`, e);
        if (MODEL_ID === FALLBACK_MODEL_ID) {
          const msg = e instanceof Error ? e.message : String(e);
          onUpdate({ phase: "error", error: `Couldn't load ${MODEL_ID}: ${msg}` });
          throw e;
        }
        // The 8B needs ~5.7 GB of VRAM — on smaller GPUs the device is lost or
        // allocation fails. Retry once with the 4B before giving up.
        onUpdate({ phase: "downloading", progress: 0, detail: "GPU too small for the 8B — loading the lighter model…" });
        try {
          engine = await load(FALLBACK_MODEL_ID);
          this.modelId = FALLBACK_MODEL_ID;
        } catch (e2) {
          console.error("[webllm] fallback engine creation failed:", e2);
          const msg = e2 instanceof Error ? e2.message : String(e2);
          onUpdate({ phase: "error", error: `Couldn't load ${FALLBACK_MODEL_ID}: ${msg}` });
          throw e2;
        }
      }
      this.engine = engine as unknown as Engine;
      // Pull the voice models now (during onboarding) so chat voice is instant.
      onUpdate({ phase: "downloading", detail: "Voice models (Whisper + Supertonic)…" });
      try {
        const { preloadVoice } = await import("./voice");
        await preloadVoice();
      } catch (e) {
        console.error("[voice] preload failed", e);
      }
      onUpdate({ phase: "ready" });
    })().finally(() => {
      this.loading = null;
    });
    return this.loading;
  }

  async createPersona(_p: Persona, systemPrompt: string): Promise<string> {
    const id = `web-${++this.seq}`;
    this.agents.set(id, { messages: [{ role: "system", content: systemPrompt }] });
    return id;
  }

  async chat(
    agentId: string,
    text: string,
    onToken: (t: string) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    if (!this.engine) {
      onToken("⚠️ The model isn't loaded. Reload the page to re-activate.");
      return;
    }
    if (this.busy) {
      // web-llm runs one generation at a time; never overlap them.
      onToken("…one moment, finishing the previous reply.");
      return;
    }
    this.busy = true;

    const conv = this.agents.get(agentId) ?? { messages: [] };
    conv.messages.push({ role: "user", content: text });
    // Window the history to fit the context, and append /no_think to the last
    // user turn at send time (Qwen3.x soft switch — answers directly, no
    // reasoning pass) so the stored history stays clean.
    const request = windowMessages(conv.messages).map((m, i, arr) =>
      isThinkingModel(this.modelId) && i === arr.length - 1 && m.role === "user"
        ? { ...m, content: `${m.content} /no_think` }
        : m,
    );

    let full = "";
    let reasoning = "";
    let logged = false;
    let inThink = false; // defensively strip any <think>…</think> that slips through
    const emit = (delta: string) => {
      let s = delta;
      while (s) {
        if (inThink) {
          const close = s.indexOf("</think>");
          if (close === -1) return;
          s = s.slice(close + 8);
          inThink = false;
        } else {
          const open = s.indexOf("<think>");
          if (open === -1) {
            full += s;
            onToken(s);
            return;
          }
          const before = s.slice(0, open);
          if (before) {
            full += before;
            onToken(before);
          }
          s = s.slice(open + 7);
          inThink = true;
        }
      }
    };
    try {
      const stream = await this.engine.chat.completions.create({
        messages: request,
        stream: true,
        temperature: 0.8,
        top_p: 0.9,
        frequency_penalty: 0.3,
        max_tokens: 512,
      });
      for await (const chunk of stream) {
        if (signal?.aborted) {
          try {
            this.engine.interruptGenerate?.();
          } catch {
            /* ignore */
          }
          break;
        }
        const choice = chunk.choices[0] as
          | { delta?: { content?: string; reasoning_content?: string }; finish_reason?: string }
          | undefined;
        const d = choice?.delta;
        if (!logged) {
          console.log("[webllm] first delta:", JSON.stringify(d));
          logged = true;
        }
        if (d?.reasoning_content) reasoning += d.reasoning_content;
        const delta = d?.content ?? "";
        if (delta) emit(delta);
        if (choice?.finish_reason) console.log("[webllm] finish_reason:", choice.finish_reason);
      }
      console.log(`[webllm] done: content=${full.length} chars, reasoning=${reasoning.length} chars`);
      if (!full && reasoning) console.log("[webllm] reasoning (no content!):", reasoning.slice(0, 300));
      if (!full && !reasoning) console.log("[webllm] EMPTY generation (no content, no reasoning)");
      conv.messages.push({ role: "assistant", content: full });
    } catch (e) {
      console.error("[webllm] generation failed:", e);
      // web-llm sometimes throws a plain object (not an Error), which stringifies
      // to "[object Object]" — dig out a real message.
      const err = e as { message?: string; detail?: string; name?: string } | undefined;
      let msg = err?.message || err?.detail || "";
      if (!msg) {
        try {
          msg = JSON.stringify(e);
        } catch {
          msg = String(e);
        }
      }
      if (err?.name && !msg.includes(err.name)) msg = `${err.name}: ${msg}`;
      // Surface the real reason instead of an empty bubble.
      if (!full) onToken(`⚠️ Generation failed: ${msg}. Try reloading the page.`);
      // Roll back the unanswered user turn so history stays consistent.
      if (conv.messages[conv.messages.length - 1]?.role === "user") conv.messages.pop();
    } finally {
      this.busy = false;
    }
  }

  async closeAgent(agentId: string): Promise<void> {
    this.agents.delete(agentId);
  }
}
