// Voice: Whisper (speech-to-text) + Supertonic (text-to-speech), both running in
// the browser via transformers.js on the WASM (CPU) backend — so they don't take
// VRAM from the WebGPU chat model. Models download from HF on first use, cached.

type AnyPipe = (input: unknown, opts?: Record<string, unknown>) => Promise<{ text?: string; audio?: Float32Array; sampling_rate?: number }>;

let sttPipe: AnyPipe | null = null;
let ttsPipe: AnyPipe | null = null;
let sttLoading: Promise<AnyPipe> | null = null;
let ttsLoading: Promise<AnyPipe> | null = null;

async function loadStt(): Promise<AnyPipe> {
  if (sttPipe) return sttPipe;
  if (!sttLoading) {
    sttLoading = (async () => {
      const { pipeline } = await import("@huggingface/transformers");
      return (await pipeline("automatic-speech-recognition", "onnx-community/whisper-base", {
        device: "wasm",
      })) as unknown as AnyPipe;
    })();
  }
  sttPipe = await sttLoading;
  return sttPipe;
}

async function loadTts(): Promise<AnyPipe> {
  if (ttsPipe) return ttsPipe;
  if (!ttsLoading) {
    ttsLoading = (async () => {
      const { pipeline } = await import("@huggingface/transformers");
      return (await pipeline("text-to-speech", "onnx-community/Supertonic-TTS-ONNX", {
        device: "wasm",
      })) as unknown as AnyPipe;
    })();
  }
  ttsPipe = await ttsLoading;
  return ttsPipe;
}

/** Pre-download both voice models (call during onboarding to warm the cache). */
export async function preloadVoice(): Promise<void> {
  await Promise.all([loadStt(), loadTts()]);
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

const VOICE_BASE = "https://huggingface.co/onnx-community/Supertonic-TTS-ONNX/resolve/main/voices";

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

/** Synthesize `text` with the given Supertonic voice id (e.g. "F1", "M2") and play it. */
export async function speak(text: string, voiceId: string): Promise<void> {
  const clean = text.trim();
  if (!clean) return;
  const tts = await loadTts();
  const out = await tts(clean, {
    speaker_embeddings: `${VOICE_BASE}/${voiceId}.bin`,
    num_inference_steps: 5,
    speed: 1.0,
  });
  if (!out.audio || !out.sampling_rate) return;
  stopSpeaking();
  playCtx = playCtx ?? new AudioContext();
  if (playCtx.state === "suspended") await playCtx.resume();
  const samples = new Float32Array(out.audio); // ensure ArrayBuffer-backed
  const buf = playCtx.createBuffer(1, samples.length, out.sampling_rate);
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

  if (aborted || !spoke || !chunks.length) {
    await ctx.close();
    return "";
  }
  const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
  await ctx.close();
  const audio = await toMono16k(decoded);
  return transcribe(audio, langCode);
}
