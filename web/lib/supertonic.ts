// Supertonic 3 — multilingual on-device TTS, ported from the official browser
// example (supertone-inc/supertonic, web/helper.js, MIT). Runs the four ONNX
// graphs (duration predictor → text encoder → vector estimator denoise loop →
// vocoder) directly via onnxruntime-web. Tokenization is a pure Unicode
// code-point lookup + a <lang>…</lang> wrapper — no g2p/espeak — so every one
// of the 31 supported languages (incl. Russian) works in the browser.
//
// We load all assets straight from Hugging Face (Supertone/supertonic-3) and
// cache them, exactly like the rest of the stack. Nothing leaves the device.

import type * as Ort from "onnxruntime-web";

type OrtNS = typeof import("onnxruntime-web");
type Session = Ort.InferenceSession;
type Tensor = Ort.Tensor;

const HF_BASE = "https://huggingface.co/Supertone/supertonic-3/resolve/main";
const ONNX_DIR = `${HF_BASE}/onnx`;
const VOICE_DIR = `${HF_BASE}/voice_styles`;

// Languages Supertonic 3 understands (ISO codes + "na" = language-agnostic).
export const AVAILABLE_LANGS = [
  "en", "ko", "ja", "ar", "bg", "cs", "da", "de", "el", "es", "et", "fi", "fr",
  "hi", "hr", "hu", "id", "it", "lt", "lv", "nl", "pl", "pt", "ro", "ru", "sk",
  "sl", "sv", "tr", "uk", "vi", "na",
];

export function isValidLang(lang: string): boolean {
  return AVAILABLE_LANGS.includes(lang);
}

interface Cfgs {
  ae: { sample_rate: number; base_chunk_size: number };
  ttl: { chunk_compress_factor: number; latent_dim: number };
}

interface VoiceStyleJSON {
  style_ttl: { dims: number[]; data: unknown };
  style_dp: { dims: number[]; data: unknown };
}

/** Holds the two per-voice conditioning tensors (timbre/TTL + duration/DP). */
export class Style {
  constructor(public ttl: Tensor, public dp: Tensor) {}
}

// ── Unicode text processor (faithful port of helper.js) ─────────────────────
class UnicodeProcessor {
  constructor(private indexer: number[]) {}

  call(textList: string[], langList: string[]) {
    const processedTexts = textList.map((text, i) => this.preprocessText(text, langList[i]));
    const textIdsLengths = processedTexts.map((t) => t.length);
    const maxLen = Math.max(...textIdsLengths);

    const textIds = processedTexts.map((text) => {
      const row = new Array<number>(maxLen).fill(0);
      for (let j = 0; j < text.length; j++) {
        const codePoint = text.codePointAt(j) ?? 0;
        row[j] = codePoint < this.indexer.length ? this.indexer[codePoint] : -1;
      }
      return row;
    });

    const textMask = this.lengthToMask(textIdsLengths, maxLen);
    return { textIds, textMask };
  }

  private preprocessText(input: string, lang: string): string {
    let text = input.normalize("NFKD");

    const emojiPattern =
      /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}]+/gu;
    text = text.replace(emojiPattern, "");

    const replacements: Record<string, string> = {
      "–": "-", "‑": "-", "—": "-", "_": " ",
      "“": '"', "”": '"', "‘": "'", "’": "'",
      "´": "'", "`": "'", "[": " ", "]": " ", "|": " ", "/": " ",
      "#": " ", "→": " ", "←": " ",
    };
    for (const [k, v] of Object.entries(replacements)) text = text.replaceAll(k, v);

    text = text.replace(/[♥☆♡©\\]/g, "");

    const exprReplacements: Record<string, string> = {
      "@": " at ",
      "e.g.,": "for example, ",
      "i.e.,": "that is, ",
    };
    for (const [k, v] of Object.entries(exprReplacements)) text = text.replaceAll(k, v);

    text = text.replace(/ ,/g, ",");
    text = text.replace(/ \./g, ".");
    text = text.replace(/ !/g, "!");
    text = text.replace(/ \?/g, "?");
    text = text.replace(/ ;/g, ";");
    text = text.replace(/ :/g, ":");
    text = text.replace(/ '/g, "'");

    while (text.includes('""')) text = text.replace('""', '"');
    while (text.includes("''")) text = text.replace("''", "'");
    while (text.includes("``")) text = text.replace("``", "`");

    text = text.replace(/\s+/g, " ").trim();

    if (!/[.!?;:,'"')\]}…。」』】〉》›»]$/.test(text)) text += ".";

    if (!isValidLang(lang)) {
      throw new Error(`Invalid language: ${lang}. Available: ${AVAILABLE_LANGS.join(", ")}`);
    }
    return `<${lang}>${text}</${lang}>`;
  }

  lengthToMask(lengths: number[], maxLen: number): number[][][] {
    return lengths.map((len) => {
      const row = new Array<number>(maxLen).fill(0);
      for (let j = 0; j < Math.min(len, maxLen); j++) row[j] = 1.0;
      return [row];
    });
  }
}

// ── Chunking (faithful port) ────────────────────────────────────────────────
function chunkText(text: string, maxLen = 300): string[] {
  const paragraphs = text.trim().split(/\n\s*\n+/).filter((p) => p.trim());
  const chunks: string[] = [];
  for (let paragraph of paragraphs) {
    paragraph = paragraph.trim();
    if (!paragraph) continue;
    const sentences = paragraph.split(
      /(?<!Mr\.|Mrs\.|Ms\.|Dr\.|Prof\.|Sr\.|Jr\.|Ph\.D\.|etc\.|e\.g\.|i\.e\.|vs\.|Inc\.|Ltd\.|Co\.|Corp\.|St\.|Ave\.|Blvd\.)(?<!\b[A-Z]\.)(?<=[.!?])\s+/,
    );
    let currentChunk = "";
    for (const sentence of sentences) {
      if (currentChunk.length + sentence.length + 1 <= maxLen) {
        currentChunk += (currentChunk ? " " : "") + sentence;
      } else {
        if (currentChunk) chunks.push(currentChunk.trim());
        currentChunk = sentence;
      }
    }
    if (currentChunk) chunks.push(currentChunk.trim());
  }
  return chunks.length ? chunks : [text.trim()];
}

// ── TTS engine ────────────────────────────────────────────────────────────--
export class TextToSpeech {
  readonly sampleRate: number;
  constructor(
    private ort: OrtNS,
    private cfgs: Cfgs,
    private textProcessor: UnicodeProcessor,
    private dpOrt: Session,
    private textEncOrt: Session,
    private vectorEstOrt: Session,
    private vocoderOrt: Session,
  ) {
    this.sampleRate = cfgs.ae.sample_rate;
  }

  private async infer(
    textList: string[],
    langList: string[],
    style: Style,
    totalStep: number,
    speed: number,
  ): Promise<{ wav: number[]; duration: number[] }> {
    const ort = this.ort;
    const bsz = textList.length;

    const { textIds, textMask } = this.textProcessor.call(textList, langList);

    const textIdsFlat = new BigInt64Array(textIds.flat().map((x) => BigInt(x)));
    const textIdsTensor = new ort.Tensor("int64", textIdsFlat, [bsz, textIds[0].length]);

    const textMaskFlat = new Float32Array(textMask.flat(2));
    const textMaskTensor = new ort.Tensor("float32", textMaskFlat, [bsz, 1, textMask[0][0].length]);

    // Duration predictor
    const dpOutputs = await this.dpOrt.run({
      text_ids: textIdsTensor,
      style_dp: style.dp,
      text_mask: textMaskTensor,
    });
    const duration = Array.from(dpOutputs.duration.data as Float32Array);
    for (let i = 0; i < duration.length; i++) duration[i] /= speed;

    // Text encoder
    const textEncOutputs = await this.textEncOrt.run({
      text_ids: textIdsTensor,
      style_ttl: style.ttl,
      text_mask: textMaskTensor,
    });
    const textEmb = textEncOutputs.text_emb;

    // Sample noisy latent
    let { xt, latentMask } = this.sampleNoisyLatent(
      duration,
      this.sampleRate,
      this.cfgs.ae.base_chunk_size,
      this.cfgs.ttl.chunk_compress_factor,
      this.cfgs.ttl.latent_dim,
    );

    const latentMaskFlat = new Float32Array(latentMask.flat(2));
    const latentMaskTensor = new ort.Tensor("float32", latentMaskFlat, [bsz, 1, latentMask[0][0].length]);

    const totalStepTensor = new ort.Tensor("float32", new Float32Array(bsz).fill(totalStep), [bsz]);

    // Denoising loop
    for (let step = 0; step < totalStep; step++) {
      const currentStepTensor = new ort.Tensor("float32", new Float32Array(bsz).fill(step), [bsz]);
      const xtTensor = new ort.Tensor("float32", new Float32Array(xt.flat(2)), [bsz, xt[0].length, xt[0][0].length]);

      const vectorEstOutputs = await this.vectorEstOrt.run({
        noisy_latent: xtTensor,
        text_emb: textEmb,
        style_ttl: style.ttl,
        latent_mask: latentMaskTensor,
        text_mask: textMaskTensor,
        current_step: currentStepTensor,
        total_step: totalStepTensor,
      });

      const denoised = Array.from(vectorEstOutputs.denoised_latent.data as Float32Array);
      const latentDim = xt[0].length;
      const latentLen = xt[0][0].length;
      xt = [];
      let idx = 0;
      for (let b = 0; b < bsz; b++) {
        const batch: number[][] = [];
        for (let d = 0; d < latentDim; d++) {
          const row: number[] = [];
          for (let t = 0; t < latentLen; t++) row.push(denoised[idx++]);
          batch.push(row);
        }
        xt.push(batch);
      }
    }

    // Vocoder
    const finalXtTensor = new ort.Tensor("float32", new Float32Array(xt.flat(2)), [bsz, xt[0].length, xt[0][0].length]);
    const vocoderOutputs = await this.vocoderOrt.run({ latent: finalXtTensor });
    const wav = Array.from(vocoderOutputs.wav_tts.data as Float32Array);

    return { wav, duration };
  }

  /** Synthesize `text` in `lang` with `style`. Returns mono float samples. */
  async call(
    text: string,
    lang: string,
    style: Style,
    totalStep: number,
    speed = 1.05,
    silenceDuration = 0.3,
  ): Promise<{ wav: number[]; duration: number[] }> {
    if (style.ttl.dims[0] !== 1) throw new Error("Single speaker only");
    const maxLen = lang === "ko" || lang === "ja" ? 120 : 300;
    const textList = chunkText(text, maxLen);

    let wavCat: number[] = [];
    let durCat = 0;
    for (let i = 0; i < textList.length; i++) {
      const { wav, duration } = await this.infer([textList[i]], [lang], style, totalStep, speed);
      if (wavCat.length === 0) {
        wavCat = wav;
        durCat = duration[0];
      } else {
        const silence = new Array<number>(Math.floor(silenceDuration * this.sampleRate)).fill(0);
        wavCat = [...wavCat, ...silence, ...wav];
        durCat += duration[0] + silenceDuration;
      }
    }
    return { wav: wavCat, duration: [durCat] };
  }

  private sampleNoisyLatent(
    duration: number[],
    sampleRate: number,
    baseChunkSize: number,
    chunkCompress: number,
    latentDim: number,
  ): { xt: number[][][]; latentMask: number[][][] } {
    const bsz = duration.length;
    const maxDur = Math.max(...duration);
    const wavLenMax = Math.floor(maxDur * sampleRate);
    const wavLengths = duration.map((d) => Math.floor(d * sampleRate));

    const chunkSize = baseChunkSize * chunkCompress;
    const latentLen = Math.floor((wavLenMax + chunkSize - 1) / chunkSize);
    const latentDimVal = latentDim * chunkCompress;

    const xt: number[][][] = [];
    for (let b = 0; b < bsz; b++) {
      const batch: number[][] = [];
      for (let d = 0; d < latentDimVal; d++) {
        const row: number[] = [];
        for (let t = 0; t < latentLen; t++) {
          // Box-Muller transform for standard-normal noise.
          const u1 = Math.max(0.0001, Math.random());
          const u2 = Math.random();
          row.push(Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2));
        }
        batch.push(row);
      }
      xt.push(batch);
    }

    const latentLengths = wavLengths.map((len) => Math.floor((len + chunkSize - 1) / chunkSize));
    const latentMask = this.lengthToMask(latentLengths, latentLen);

    for (let b = 0; b < bsz; b++)
      for (let d = 0; d < latentDimVal; d++)
        for (let t = 0; t < latentLen; t++) xt[b][d][t] *= latentMask[b][0][t];

    return { xt, latentMask };
  }

  private lengthToMask(lengths: number[], maxLen: number): number[][][] {
    return lengths.map((len) => {
      const row = new Array<number>(maxLen).fill(0);
      for (let j = 0; j < Math.min(len, maxLen); j++) row[j] = 1.0;
      return [row];
    });
  }
}

// ── Loaders ──────────────────────────────────────────────────────────────---
let ortNS: OrtNS | null = null;
let engine: TextToSpeech | null = null;
let engineLoading: Promise<TextToSpeech> | null = null;
const styleCache = new Map<string, Promise<Style>>();

async function getOrt(): Promise<OrtNS> {
  if (ortNS) return ortNS;
  const ort = (await import("onnxruntime-web")) as unknown as OrtNS;
  // Load the wasm/jsep runtime from a CDN so we don't have to bundle the .wasm
  // files through Turbopack. Version must match the installed package.
  ort.env.wasm.wasmPaths = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.26.0/dist/";
  ortNS = ort;
  return ort;
}

async function fetchJSON<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`fetch ${url} -> ${r.status}`);
  return (await r.json()) as T;
}

async function createSession(ort: OrtNS, url: string): Promise<Session> {
  // Prefer WebGPU (fast); fall back to WASM if it isn't available. The reply is
  // synthesized after the LLM finishes generating, so they don't fight for the
  // GPU at the same instant.
  const buf = await (await fetch(url)).arrayBuffer();
  try {
    return await ort.InferenceSession.create(buf, {
      executionProviders: ["webgpu"],
      graphOptimizationLevel: "all",
    });
  } catch {
    return await ort.InferenceSession.create(buf, {
      executionProviders: ["wasm"],
      graphOptimizationLevel: "all",
    });
  }
}

/** Load (and cache) the full Supertonic engine: 4 ONNX graphs + config + indexer. */
export async function loadEngine(): Promise<TextToSpeech> {
  if (engine) return engine;
  if (!engineLoading) {
    engineLoading = (async () => {
      const ort = await getOrt();
      const [cfgs, indexer, dp, te, ve, voc] = await Promise.all([
        fetchJSON<Cfgs>(`${ONNX_DIR}/tts.json`),
        fetchJSON<number[]>(`${ONNX_DIR}/unicode_indexer.json`),
        createSession(ort, `${ONNX_DIR}/duration_predictor.onnx`),
        createSession(ort, `${ONNX_DIR}/text_encoder.onnx`),
        createSession(ort, `${ONNX_DIR}/vector_estimator.onnx`),
        createSession(ort, `${ONNX_DIR}/vocoder.onnx`),
      ]);
      engine = new TextToSpeech(ort, cfgs, new UnicodeProcessor(indexer), dp, te, ve, voc);
      return engine;
    })();
  }
  return engineLoading;
}

/** Load (and cache) one voice style (e.g. "F1", "M2") as conditioning tensors. */
export async function loadStyle(voiceId: string): Promise<Style> {
  let p = styleCache.get(voiceId);
  if (!p) {
    p = (async () => {
      const ort = await getOrt();
      const v = await fetchJSON<VoiceStyleJSON>(`${VOICE_DIR}/${voiceId}.json`);
      const ttlDims = v.style_ttl.dims;
      const dpDims = v.style_dp.dims;
      const ttlData = Float32Array.from((v.style_ttl.data as number[]).flat(Infinity) as number[]);
      const dpData = Float32Array.from((v.style_dp.data as number[]).flat(Infinity) as number[]);
      return new Style(
        new ort.Tensor("float32", ttlData, ttlDims),
        new ort.Tensor("float32", dpData, dpDims),
      );
    })();
    styleCache.set(voiceId, p);
  }
  return p;
}
