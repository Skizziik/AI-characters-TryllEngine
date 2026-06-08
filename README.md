# Tryll — local AI characters

A website where you pick a character and chat. The AI runs **locally on your own
machine** (private, on your GPU) via the native Tryll engine — no cloud, no limits.
Inspired by the polybuzz-style experience, but local-first.

## Architecture (planned)

```
Website (Next.js)  →  localhost bridge (Tauri)  →  tryll_server.exe (Gemma 4)
   onboarding /          TCP + FlatBuffers           local inference on GPU
   persona gallery /
   chat UI
```

- **Website** — onboarding, persona gallery, chat UI. Hosted (Vercel/Cloudflare Pages).
- **Tryll Desktop** — one-time install (Tauri). Runs a localhost bridge and auto-starts
  the server. Weights download from CDN to `%LOCALAPPDATA%\Tryll`.
- **Engine** — native `tryll_server`, TCP `:9100`, `4-byte LE len + FlatBuffers`.
  v1 text chat uses the `Generate` node + `SendMessage`/`AnswerText` stream.

## Repo layout

- `web/` — Next.js 16 (App Router, React 19, Tailwind 4, motion). Built first against a
  `MockStackClient` so the full flow is demoable without the bridge.
- _later_: `desktop/` (Tauri bridge), persona backstories, runs counter API.

## Develop

```bash
cd web
bun install
bun run dev      # http://localhost:3000
```

v1 scope: **text chat only** (voice STT/TTS deferred).
