import type { Persona, StackState } from "./types";
import type { StackClient } from "./stackClient";

/* ── WebGPU stack client (web-llm / MLC) ───────────────────────────────────
   Zero install: the model runs entirely in the browser tab on the user's GPU
   via WebGPU. "Activate" streams the model into the browser cache with progress;
   chat is an in-tab streaming completion. No exe, no local server.

   Model: Gemma 4 E2B (instruct, q4f16) — Google's 2026 edge model, trained on
   140 languages, so Russian and other non-English chats are far more fluent than
   the older 3B models. It isn't in web-llm's prebuilt list yet, so we register a
   community-compiled MLC build (welcoma/gemma-4-E2B-it-q4f16_1-MLC) via a custom
   appConfig. Requires the WebGPU "shader-f16" feature (standard on modern GPUs).
   Override with NEXT_PUBLIC_WEBLLM_MODEL (any prebuilt id still works — we extend
   the prebuilt list rather than replace it).
*/

const GEMMA4_E2B = "gemma-4-E2B-it-q4f16_1-MLC";
const GEMMA4_REPO = "https://huggingface.co/welcoma/gemma-4-E2B-it-q4f16_1-MLC/resolve/main";

const MODEL_ID = process.env.NEXT_PUBLIC_WEBLLM_MODEL ?? GEMMA4_E2B;

type Msg = { role: "system" | "user" | "assistant"; content: string };
type Conversation = { messages: Msg[] };

type Engine = {
  chat: {
    completions: {
      create: (opts: {
        messages: Msg[];
        stream: boolean;
        temperature?: number;
        max_tokens?: number;
      }) => Promise<AsyncIterable<{ choices: { delta: { content?: string } }[] }>>;
    };
  };
  interruptGenerate?: () => void;
};

export class WebLlmStackClient implements StackClient {
  private engine: Engine | null = null;
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
      // Register Gemma 4 E2B (not in the prebuilt list yet) by extending the
      // prebuilt model_list, so the default id resolves and any prebuilt id
      // passed via NEXT_PUBLIC_WEBLLM_MODEL still works too.
      const appConfig = {
        ...webllm.prebuiltAppConfig,
        model_list: [
          ...webllm.prebuiltAppConfig.model_list,
          {
            model: GEMMA4_REPO,
            model_id: GEMMA4_E2B,
            model_lib: `${GEMMA4_REPO}/libs/gemma-4-E2B-it-q4f16_1-MLC-webgpu.wasm`,
            required_features: ["shader-f16"],
          },
        ],
      };
      let engine;
      try {
        engine = await webllm.CreateMLCEngine(MODEL_ID, {
          appConfig,
          initProgressCallback: (r: { progress: number; text: string }) => {
            onUpdate({
              phase: "downloading",
              progress: r.progress,
              detail: r.text?.replace(/\[.*?\]\s*/, "") || "Loading model…",
            });
          },
        });
      } catch (e) {
        console.error("[webllm] engine creation failed:", e);
        const msg = e instanceof Error ? e.message : String(e);
        onUpdate({ phase: "error", error: `Couldn't load ${MODEL_ID}: ${msg}` });
        throw e;
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

    let full = "";
    try {
      const stream = await this.engine.chat.completions.create({
        messages: conv.messages,
        stream: true,
        temperature: 0.8,
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
        const delta = chunk.choices[0]?.delta?.content ?? "";
        if (delta) {
          full += delta;
          onToken(delta);
        }
      }
      conv.messages.push({ role: "assistant", content: full });
    } catch (e) {
      console.error("[webllm] generation failed:", e);
      const msg = e instanceof Error ? e.message : String(e);
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
