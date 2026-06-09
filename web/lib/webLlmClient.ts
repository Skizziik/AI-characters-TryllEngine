import type { Persona, StackState } from "./types";
import type { StackClient } from "./stackClient";

/* ── WebGPU stack client (web-llm / MLC) ───────────────────────────────────
   Zero install: the model runs entirely in the browser tab on the user's GPU
   via WebGPU. "Activate" streams the model weights into the browser cache with
   progress; chat is an in-tab streaming completion. No exe, no local server.

   Trade-off vs the native client: this is NOT tryll_server — it's a browser
   inference engine, so it uses an MLC-format model (Gemma here). v1 = text only.
*/

const MODEL_ID =
  process.env.NEXT_PUBLIC_WEBLLM_MODEL ?? "Qwen3.5-4B-q4f16_1-MLC";

type Conversation = { messages: { role: "system" | "user" | "assistant"; content: string }[] };

/** Remove Qwen3 chain-of-thought from output (complete blocks + an unclosed
 *  trailing one), then left-trim the leftover whitespace. */
function stripThink(s: string): string {
  let out = s.replace(/<think>[\s\S]*?<\/think>/g, "");
  const open = out.indexOf("<think>");
  if (open !== -1) out = out.slice(0, open);
  return out.replace(/^\s+/, "");
}

// web-llm's MLCEngine — loaded lazily (browser-only).
type Engine = {
  chat: {
    completions: {
      create: (opts: {
        messages: { role: string; content: string }[];
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

  async health(): Promise<boolean> {
    return this.engine !== null;
  }

  async activate(onUpdate: (s: StackState) => void): Promise<void> {
    if (this.engine) {
      onUpdate({ phase: "ready" });
      return;
    }
    if (typeof navigator === "undefined" || !("gpu" in navigator)) {
      onUpdate({
        phase: "error",
        error: "WebGPU isn't available — use Chrome or Edge (latest).",
      });
      throw new Error("WebGPU unavailable");
    }
    if (this.loading) return this.loading;

    this.loading = (async () => {
      onUpdate({ phase: "downloading", progress: 0, detail: "Preparing model…" });
      const webllm = await import("@mlc-ai/web-llm");
      const engine = await webllm.CreateMLCEngine(MODEL_ID, {
        initProgressCallback: (r: { progress: number; text: string }) => {
          onUpdate({
            phase: "downloading",
            progress: r.progress,
            detail: r.text?.replace(/\[.*?\]\s*/, "") || "Loading model…",
          });
        },
      });
      this.engine = engine as unknown as Engine;
      onUpdate({ phase: "ready" });
    })().finally(() => {
      this.loading = null;
    });
    return this.loading;
  }

  async createPersona(_p: Persona, systemPrompt: string): Promise<string> {
    const id = `web-${++this.seq}`;
    // /no_think = Qwen3 soft switch that disables chain-of-thought.
    this.agents.set(id, {
      messages: [{ role: "system", content: `${systemPrompt}\n\n/no_think` }],
    });
    return id;
  }

  async chat(
    agentId: string,
    text: string,
    onToken: (t: string) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    if (!this.engine) throw new Error("model not loaded");
    const conv = this.agents.get(agentId) ?? { messages: [] };
    conv.messages.push({ role: "user", content: text });

    const stream = await this.engine.chat.completions.create({
      messages: conv.messages,
      stream: true,
      temperature: 0.8,
      max_tokens: 320,
    });

    let full = "";
    let emitted = 0;
    for await (const chunk of stream) {
      if (signal?.aborted) {
        this.engine.interruptGenerate?.();
        break;
      }
      const delta = chunk.choices[0]?.delta?.content ?? "";
      if (!delta) continue;
      full += delta;
      // Emit only the think-stripped visible text, holding back any open block.
      const visible = stripThink(full);
      if (visible.length > emitted) {
        onToken(visible.slice(emitted));
        emitted = visible.length;
      }
    }
    conv.messages.push({ role: "assistant", content: stripThink(full).trim() });
  }

  async closeAgent(agentId: string): Promise<void> {
    // Keep the model warm; just drop the conversation history.
    this.agents.delete(agentId);
  }
}
