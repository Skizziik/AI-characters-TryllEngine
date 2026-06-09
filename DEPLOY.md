# Deploying the Tryll website to Render

The **website** (`web/`, Next.js 16) is what gets hosted. It talks to the user's
**local** bridge at `http://127.0.0.1:9123` (installed via the Tryll desktop app),
so the cloud host only ever serves the UI + the `/api/runs` counter — no AI runs
in the cloud.

> **Why https→http://localhost works:** browsers treat `127.0.0.1`/`localhost` as a
> *secure context*, so an HTTPS page on Render is allowed to call the visitor's
> local `http://127.0.0.1:9123` without a mixed-content block. This is the whole
> trick that lets a hosted site drive a local engine.

## 1. Create the Web Service

1. Push the repo to GitHub (already done: `Skizziik/AI-characters-TryllEngine`).
2. Render dashboard → **New → Web Service** → connect the repo.
3. Settings:
   - **Root Directory:** `web`
   - **Runtime:** `Node`
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm start`   _(runs `next start`)_
   - **Instance Type:** Free (fine for a demo; see note below)
4. **Environment** → add:
   - `NODE_VERSION = 20`  (Next 16 needs Node ≥ 18.18; 20 is safe)
5. Create. First build takes a few minutes; you get a URL like
   `https://tryll-xxxx.onrender.com`.

That's it — the site is live. Visitors who haven't installed the desktop app see
the onboarding / "Activate" flow; those who have it installed get straight into
the personas (the site detects their local bridge).

### Bun alternative (optional)
Render auto-detects `bun.lock`. If you prefer Bun:
- Build: `bun install && bun run build`
- Start: `bun run start`

## 2. Make the chat counter persistent (recommended)

`/api/runs` currently uses an in-memory store — counts reset on restart and the
free tier sleeps. For real, shared counts use **Upstash Redis** (free):

1. Create a database at [upstash.com](https://upstash.com) → copy the
   **REST URL** and **REST TOKEN**.
2. In Render → Environment, add:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`
3. Swap the store in [web/app/api/runs/route.ts](web/app/api/runs/route.ts):
   - `GET`  → `MGET runs:<id>` for each persona (or a hash)
   - `POST` → `INCR runs:<id>`
   Use the Upstash REST API directly with `fetch` (no SDK needed):
   ```ts
   const base = process.env.UPSTASH_REDIS_REST_URL!;
   const auth = { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}` };
   // incr: await fetch(`${base}/incr/runs:${id}`, { headers: auth })
   ```
   Keep the in-memory fallback when the env vars are absent (local dev).

## 3. Notes / gotchas

- **Free tier sleeps** after ~15 min idle → first request has a ~50s cold start.
  For an always-on landing, upgrade to the cheapest paid instance later.
- **Persona/collage images** (~38 MB in `web/public`) ship as static assets. Fine
  to start; optimize to WebP before heavy traffic.
- **No secrets needed** for the core site — the AI is the visitor's local stack.
- **Custom domain:** Render → Settings → Custom Domains, point a CNAME.

## 4. The downloadable runtime (`tryll.exe`)

The site needs the visitor's local engine. That's a single **portable exe** — no
installer, no window — built from `bridge/`:

```bash
cd bridge && bun run compile   # → bridge/dist/tryll.exe (self-contained, ~114 MB)
```

`tryll.exe` is the whole local stack manager:
- runs **windowless** (hides its own console);
- on first run downloads the engine + model weights from the CDN with progress
  (the site shows the bars via `POST /setup`);
- registers **silent autostart** (set `TRYLL_AUTOSTART=1`; uses a logon Scheduled
  Task) so the user never launches it again;
- spawns `tryll_server` only while a chat is open, stops it on leave;
- exposes the localhost API the site talks to (`:9123`).

**Hosting the components** (set `TRYLL_CDN` to your R2 base, default
`https://cdn.tryllengine.com/stack`):
- `tryll.exe`            → linked from the site's "Activate" button (`NEXT_PUBLIC_DOWNLOAD_URL`)
- `<TRYLL_CDN>/server.zip`  → `tryll_server.exe` + CUDA DLLs + `data/`
- `<TRYLL_CDN>/weights.zip` → Gemma gguf (+ later Supertonic/Whisper)

The exe extracts these into `%LOCALAPPDATA%\Tryll`. Use **Cloudflare R2** (free
egress) for the multi-GB archives.

**Before public release:** code-sign `tryll.exe` (EV/OV cert) so Windows
SmartScreen doesn't warn on first run, and ship a clean `server-config.json` with
telemetry **off**.
