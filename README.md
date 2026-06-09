# Sona — local AI characters

A website where you pick a character and chat. The AI runs **locally on your own
machine** (private, on your GPU) — no cloud, no limits. Inspired by the
polybuzz-style experience, but local-first.

## Architecture (current)

```
Website (Next.js)  →  web-llm / MLC on WebGPU, in the browser tab
   onboarding /        Qwen3-8B q4f16 (~5.7 GB VRAM; auto-falls back to
   persona gallery /   Qwen3-4B on smaller GPUs), thinking disabled
   chat UI + voice     Whisper STT + Supertonic TTS on CPU (WASM)
```

- **Website** — onboarding, persona gallery, chat UI, hands-free voice calls.
  Hosted (Vercel/Render); all inference happens in the visitor's browser.
- **Prompts** — fully localized: a Russian chat runs on a fully Russian system
  prompt with a native Russian character pack per persona (`web/PERSONAS.md`).
- **Native path (optional, `NEXT_PUBLIC_STACK=native`)** — `bridge/` is a Bun
  localhost bridge to the native `tryll_server` (TCP `:9100`, `4-byte LE len +
  FlatBuffers`, `Generate` node + `SendMessage`/`AnswerText` stream). Kept as
  the future higher-quality engine; not part of the current default flow.

## Repo layout

- `web/` — Next.js 16 (App Router, React 19, Tailwind 4, motion). `NEXT_PUBLIC_STACK`:
  unset → web-llm (default), `native` → bridge, `mock` → demo client.
- `bridge/` — Bun localhost bridge + FlatBuffers schema for the native engine.

## Develop

```bash
cd web
bun install
bun run dev      # http://localhost:3000
```

Voice (Whisper STT + Supertonic TTS, 31 languages) runs on CPU/WASM so the GPU
stays free for the LLM.
