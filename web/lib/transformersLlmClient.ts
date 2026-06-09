import type { Persona, StackState } from "./types";
import type { StackClient } from "./stackClient";

/* ── Gemma 4 stack client (transformers.js / ONNX on WebGPU) ────────────────
   Runs Google's Gemma 4 (E4B by default — 140-language, far more fluent in
   Russian than the 3B models) entirely in the browser via @huggingface/
   transformers on WebGPU. This is the route that actually works for Gemma 4:
   the MLC/web-llm build crashes at decode, but the official ONNX build runs.
   (Approach mirrors the kessler/gemma-gem reference.)

   Gemma 4 "thinks" in a <|channel> … <channel|> block before answering; we hide
   that and stream only the answer. Gemma has no system role, so the persona
   prompt is folded into the first user turn.
*/

const MODEL_ID =
  process.env.NEXT_PUBLIC_GEMMA_MODEL ?? "onnx-community/gemma-4-E4B-it-ONNX";

type Msg = { role: "user" | "assistant"; content: string };
type Conversation = { system: string; messages: Msg[] };

// Special tokens Gemma emits that must never reach the UI.
const SPECIAL_TOKENS = [
  "<eos>", "<bos>", "<end_of_turn>", "<start_of_turn>",
  "<|turn>", "<turn|>", "<|channel>", "<channel|>",
  "<|think|>", "<|image|>", "<|tool_call>", "<tool_call|>",
  "<|tool_response>", "<tool_response|>",
];
function stripSpecial(text: string): string {
  let r = text;
  for (const tok of SPECIAL_TOKENS) if (r.includes(tok)) r = r.split(tok).join("");
  return r;
}

export class TransformersLlmClient implements StackClient {
  private model: any = null;
  private processor: any = null;
  private loading: Promise<void> | null = null;
  private agents = new Map<string, Conversation>();
  private seq = 0;
  private busy = false;

  async health(): Promise<boolean> {
    return this.model !== null;
  }

  async activate(onUpdate: (s: StackState) => void): Promise<void> {
    if (this.model) {
      onUpdate({ phase: "ready" });
      return;
    }
    if (typeof navigator === "undefined" || !("gpu" in navigator)) {
      onUpdate({ phase: "error", error: "WebGPU isn't available — use Chrome or Edge (latest)." });
      throw new Error("WebGPU unavailable");
    }
    if (this.loading) return this.loading;

    this.loading = (async () => {
      onUpdate({ phase: "downloading", progress: 0, detail: "Preparing Gemma 4…" });
      const tf = await import("@huggingface/transformers");

      // Average per-file download progress into one 0..1 bar.
      const fileProgress = new Map<string, number>();
      let last = -1;
      const progress_callback = (info: { status: string; file?: string; progress?: number }) => {
        if (info.status === "progress" && info.file) {
          fileProgress.set(info.file, info.progress ?? 0);
          const vals = [...fileProgress.values()];
          const overall = vals.reduce((a, b) => a + b, 0) / Math.max(vals.length, 1);
          const pct = Math.round(overall);
          if (pct !== last) {
            last = pct;
            // After 100% there's a silent step where the weights are uploaded to
            // the GPU and shaders compile — say so, so it doesn't look frozen.
            const detail = pct >= 100 ? "Загрузка в видеопамять…" : `Gemma 4 · ${pct}%`;
            onUpdate({ phase: "downloading", progress: overall / 100, detail });
          }
        } else if (info.status === "done" && info.file) {
          fileProgress.set(info.file, 100);
        }
      };

      try {
        const [model, processor] = await Promise.all([
          tf.Gemma4ForConditionalGeneration.from_pretrained(MODEL_ID, {
            // Uniform q4f16 (string). This is the ONLY config that loads on the
            // WebGPU EP here. A per-component dtype OBJECT (any combo, incl.
            // fp16) hangs session init — it forces the unused multimodal
            // vision/audio encoders to initialize on WebGPU, which stalls. int8
            // ("q8") also hangs (transformers.js #1317). So we accept the larger
            // ~5.2 GB uniform q4f16 load in exchange for it actually working.
            dtype: "q4f16",
            device: "webgpu",
            progress_callback,
          }),
          tf.AutoProcessor.from_pretrained(MODEL_ID),
        ]);
        this.model = model;
        this.processor = processor;
      } catch (e) {
        console.error("[gemma] model load failed:", e);
        const msg = e instanceof Error ? e.message : String(e);
        onUpdate({ phase: "error", error: `Couldn't load Gemma 4: ${msg}` });
        throw e;
      }

      // Voice models alongside, so chat voice is instant (Whisper + Supertonic).
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
    const id = `gemma-${++this.seq}`;
    this.agents.set(id, { system: systemPrompt, messages: [] });
    return id;
  }

  async chat(
    agentId: string,
    text: string,
    onToken: (t: string) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    if (!this.model || !this.processor) {
      onToken("⚠️ The model isn't loaded. Reload the page to re-activate.");
      return;
    }
    if (this.busy) {
      onToken("…one moment, finishing the previous reply.");
      return;
    }
    this.busy = true;

    const conv = this.agents.get(agentId) ?? { system: "", messages: [] };
    conv.messages.push({ role: "user", content: text });

    // Gemma has no system role — fold the persona prompt into the first user turn.
    const apiMessages = conv.messages.map((m, i) =>
      i === 0 && m.role === "user" && conv.system
        ? { role: "user", content: `${conv.system}\n\n${m.content}` }
        : { role: m.role, content: m.content },
    );

    let full = "";
    let inThinking = false;
    const tf = await import("@huggingface/transformers");
    const ac = new AbortController();
    const onAbort = () => ac.abort();
    signal?.addEventListener("abort", onAbort);

    try {
      let inputs = this.processor.tokenizer.apply_chat_template(apiMessages, {
        add_generation_prompt: true,
        tokenize: true,
        return_dict: true,
      });
      // Normalize: some versions return the input_ids tensor directly.
      if (inputs && !inputs.input_ids) inputs = { input_ids: inputs };

      const streamer = new tf.TextStreamer(this.processor.tokenizer, {
        skip_prompt: true,
        skip_special_tokens: false,
        callback_function: (chunk: string) => {
          // Hide Gemma's <|channel> … <channel|> thinking block.
          if (chunk.includes("<|channel>")) { inThinking = true; return; }
          if (chunk.includes("<channel|>")) { inThinking = false; return; }
          if (inThinking) return;
          const clean = stripSpecial(chunk);
          if (clean) {
            full += clean;
            onToken(clean);
          }
        },
      });

      const output = await this.model.generate({
        ...inputs,
        max_new_tokens: 512,
        do_sample: true,
        temperature: 0.8,
        top_p: 0.9,
        repetition_penalty: 1.1,
        streamer,
        abort_signal: ac.signal,
      });

      // Free native WebGPU/ONNX tensors.
      try {
        (output as { dispose?: () => void })?.dispose?.();
        for (const k of Object.keys(inputs)) (inputs as Record<string, { dispose?: () => void }>)[k]?.dispose?.();
      } catch { /* ignore */ }

      conv.messages.push({ role: "assistant", content: full });
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        // user stopped — keep whatever streamed so far
        if (full) conv.messages.push({ role: "assistant", content: full });
        else if (conv.messages[conv.messages.length - 1]?.role === "user") conv.messages.pop();
      } else {
        console.error("[gemma] generation failed:", e);
        const msg = e instanceof Error ? e.message : String(e);
        if (!full) onToken(`⚠️ Generation failed: ${msg}. Try reloading the page.`);
        if (conv.messages[conv.messages.length - 1]?.role === "user") conv.messages.pop();
      }
    } finally {
      signal?.removeEventListener("abort", onAbort);
      this.busy = false;
    }
  }

  async closeAgent(agentId: string): Promise<void> {
    this.agents.delete(agentId);
  }
}
