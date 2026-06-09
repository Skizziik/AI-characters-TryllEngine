// Voice: Whisper (speech-to-text) + Supertonic (text-to-speech), both running in
// the browser via transformers.js on the WASM (CPU) backend — so they don't take
// VRAM from the WebGPU chat model. Models download from HF on first use, cached.

type AnyPipe = (input: unknown, opts?: Record<string, unknown>) => Promise<{ text?: string; audio?: Float32Array; sampling_rate?: number }>;

let sttPipe: AnyPipe | null = null;
let sttLoading: Promise<AnyPipe> | null = null;

async function loadStt(): Promise<AnyPipe> {
  if (sttPipe) return sttPipe;
  if (!sttLoading) {
    sttLoading = (async () => {
      const { pipeline } = await import("@huggingface/transformers");
      // Pin dtype to fp32: the auto-selected default pulls the broken 4-bit
      // (MatMulNBits) variant whose scales are missing, so session creation
      // throws "TransposeDQWeightsForMatMulNBits Missing required scale". fp32
      // is unquantized — no NBits nodes at all — and the files exist in the repo.
      return (await pipeline("automatic-speech-recognition", "onnx-community/whisper-base", {
        device: "wasm",
        dtype: "fp32",
      })) as unknown as AnyPipe;
    })();
  }
  sttPipe = await sttLoading;
  return sttPipe;
}

/** Pre-download the voice models (Whisper STT + Supertonic TTS engine + a
 *  default voice) — call during onboarding to warm the cache. */
export async function preloadVoice(): Promise<void> {
  const { loadEngine, loadStyle } = await import("./supertonic");
  await Promise.all([loadStt(), loadEngine().then(() => loadStyle("F1"))]);
}

const WHISPER_LANG: Record<string, string> = { en: "english", ru: "russian" };

/** Transcribe mic audio (16 kHz mono Float32) to text in the given UI language. */
export async function transcribe(audio: Float32Array, langCode: string): Promise<string> {
  const stt = await loadStt();
  const out = await stt(audio, {
    language: WHISPER_LANG[langCode] ?? "english",
    task: "transcribe",
    return_timestamps: false,
  });
  return (out.text ?? "").trim();
}

// UI/chat language code -> Supertonic language tag. Unknown languages fall back
// to "na" (language-agnostic) so we never throw on an unsupported pick.
const TTS_LANG: Record<string, string> = { en: "en", ru: "ru" };
function ttsLang(code: string): string {
  return TTS_LANG[code] ?? "na";
}

// Quality/latency knob for the denoising loop. The official demo defaults to 8;
// 6 keeps call-mode replies snappy with no audible quality loss.
const TTS_STEPS = 6;

let playCtx: AudioContext | null = null;
let currentSource: AudioBufferSourceNode | null = null;

export function stopSpeaking() {
  try {
    currentSource?.stop();
  } catch {
    /* ignore */
  }
  currentSource = null;
}

/** Synthesize `text` with the given Supertonic voice id (e.g. "F1", "M2") in the
 *  given language and play it. Resolves when playback ends. */
export async function speak(text: string, voiceId: string, langCode = "en"): Promise<void> {
  const clean = text.trim();
  if (!clean) return;
  const { loadEngine, loadStyle } = await import("./supertonic");
  const [engine, style] = await Promise.all([loadEngine(), loadStyle(voiceId)]);
  const { wav, duration } = await engine.call(clean, ttsLang(langCode), style, TTS_STEPS);

  // Trim trailing padding using the predicted duration.
  const wavLen = Math.floor(engine.sampleRate * duration[0]);
  const samples = Float32Array.from(wav.slice(0, wavLen > 0 ? wavLen : wav.length));
  if (!samples.length) return;

  stopSpeaking();
  playCtx = playCtx ?? new AudioContext();
  if (playCtx.state === "suspended") await playCtx.resume();
  const buf = playCtx.createBuffer(1, samples.length, engine.sampleRate);
  buf.copyToChannel(samples, 0);
  const src = playCtx.createBufferSource();
  src.buffer = buf;
  src.connect(playCtx.destination);
  currentSource = src;
  // resolve when playback finishes (so a call loop can listen again after)
  await new Promise<void>((resolve) => {
    src.onended = () => resolve();
    src.start();
  });
}

export interface SpeechStream {
  /** feed streamed reply text as it arrives */
  push(text: string): void;
  /** mark the reply finished; resolves when all audio has played */
  end(): Promise<void>;
}

/** Streaming TTS: synthesize & speak sentence-by-sentence as the reply streams
 *  in, so the first sentence plays while the rest is still being generated
 *  (instead of waiting for the whole reply). Sentences play in order. */
export function speakStream(
  voiceId: string,
  langCode = "en",
  opts: { onStart?: () => void } = {},
): SpeechStream {
  let buffer = "";
  const queue: string[] = [];
  let processing = false;
  let ended = false;
  let started = false;
  let resolveDone!: () => void;
  const done = new Promise<void>((r) => (resolveDone = r));

  async function pump() {
    if (processing) return;
    processing = true;
    try {
      while (queue.length) {
        const sentence = queue.shift()!;
        if (!started) {
          started = true;
          opts.onStart?.();
        }
        await speak(sentence, voiceId, langCode).catch(() => {});
      }
    } finally {
      processing = false;
      if (ended && !queue.length) resolveDone();
    }
  }

  function drain() {
    // pull complete sentences (terminator + trailing space), keep the rest
    let m: RegExpMatchArray | null;
    while ((m = buffer.match(/^([\s\S]*?[.!?…]+["'»)\]]*)(\s+)([\s\S]*)$/))) {
      const s = m[1].trim();
      if (s) queue.push(s);
      buffer = m[3];
    }
    void pump();
  }

  return {
    push(text: string) {
      buffer += text;
      drain();
    },
    end() {
      const rest = buffer.trim();
      if (rest) queue.push(rest);
      buffer = "";
      ended = true;
      if (!processing && !queue.length) resolveDone();
      else void pump();
      return done;
    },
  };
}

// ── Mic recording → 16 kHz mono Float32 (what Whisper expects) ──────────────
async function toMono16k(audioBuffer: AudioBuffer): Promise<Float32Array> {
  const length = Math.ceil(audioBuffer.duration * 16000);
  const off = new OfflineAudioContext(1, length, 16000);
  const src = off.createBufferSource();
  src.buffer = audioBuffer;
  src.connect(off.destination);
  src.start();
  const rendered = await off.startRendering();
  return rendered.getChannelData(0);
}

export interface ListenOpts {
  silenceMs?: number; // stop after this much silence following speech
  maxMs?: number; // hard cap
  signal?: AbortSignal; // abort the listen (e.g. when call mode is stopped)
  onSpeechStart?: () => void;
}

/** Listen on the mic until the user goes quiet (VAD), then transcribe in the
 *  given language. Returns the transcript ("" if nothing was said / aborted). */
export async function listenOnce(langCode: string, opts: ListenOpts = {}): Promise<string> {
  const silenceMs = opts.silenceMs ?? 1500;
  const maxMs = opts.maxMs ?? 20000;

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const ctx = new AudioContext();
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  source.connect(analyser);
  const rec = new MediaRecorder(stream);
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };
  rec.start();

  const data = new Uint8Array(analyser.fftSize);
  let spoke = false;
  let silentSince = 0;
  let aborted = false;
  const startT = performance.now();

  await new Promise<void>((resolve) => {
    const tick = () => {
      if (opts.signal?.aborted) {
        aborted = true;
        resolve();
        return;
      }
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const v = (data[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / data.length);
      const now = performance.now();
      if (rms > 0.025) {
        if (!spoke) opts.onSpeechStart?.();
        spoke = true;
        silentSince = 0;
      } else if (spoke) {
        if (!silentSince) silentSince = now;
        else if (now - silentSince > silenceMs) {
          resolve();
          return;
        }
      }
      if (now - startT > maxMs) {
        resolve();
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  const blob = await new Promise<Blob>((res) => {
    rec.onstop = () => res(new Blob(chunks, { type: chunks[0]?.type || "audio/webm" }));
    try {
      rec.stop();
    } catch {
      res(new Blob(chunks));
    }
  });
  stream.getTracks().forEach((t) => t.stop());

  console.log(`[voice] listen done: spoke=${spoke} chunks=${chunks.length} aborted=${aborted}`);
  if (aborted || !spoke || !chunks.length) {
    await ctx.close();
    return "";
  }
  try {
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
    await ctx.close();
    const audio = await toMono16k(decoded);
    console.log(`[voice] transcribing ${audio.length} samples (${langCode})`);
    const text = await transcribe(audio, langCode);
    console.log(`[voice] transcript: "${text}"`);
    return text;
  } catch (e) {
    try {
      await ctx.close();
    } catch {
      /* ignore */
    }
    console.error("[voice] decode/transcribe failed", e);
    throw e;
  }
}
