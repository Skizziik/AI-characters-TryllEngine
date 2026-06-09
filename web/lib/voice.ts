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
  src.start();
  currentSource = src;
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

export interface Recorder {
  stop: () => Promise<Float32Array>;
  cancel: () => void;
}

/** Start recording from the mic; returns a controller. stop() resolves with the
 *  decoded 16 kHz mono samples ready for transcribe(). */
export async function startRecording(): Promise<Recorder> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const rec = new MediaRecorder(stream);
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };
  rec.start();

  const cleanup = () => stream.getTracks().forEach((t) => t.stop());

  return {
    cancel: () => {
      try {
        rec.stop();
      } catch {
        /* ignore */
      }
      cleanup();
    },
    stop: () =>
      new Promise<Float32Array>((resolve, reject) => {
        rec.onstop = async () => {
          cleanup();
          try {
            const blob = new Blob(chunks, { type: chunks[0]?.type || "audio/webm" });
            const ctx = new AudioContext();
            const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
            await ctx.close();
            resolve(await toMono16k(decoded));
          } catch (e) {
            reject(e instanceof Error ? e : new Error(String(e)));
          }
        };
        try {
          rec.stop();
        } catch (e) {
          reject(e instanceof Error ? e : new Error(String(e)));
        }
      }),
  };
}
