// Localhost bridge HTTP/SSE server.
// Browser  <--HTTP/SSE+CORS-->  this bridge  <--TCP/FlatBuffers-->  tryll_server
//
// Implements the contract web/lib/stackClient.ts (HttpStackClient) targets:
//   GET    /health                 -> { ready, version }
//   POST   /persona  {name,system} -> { agentId }
//   POST   /chat     {agentId,text}-> SSE: data:{token} ... data:{done:true}
//   DELETE /persona/:id            -> { ok }
//   POST   /models/download        -> SSE: data:{progress,detail} (local = instant)
//
//   bun run src/server.ts          (tryll_server must be on :9100)

import { TryllSession } from "./codec.ts";

const PORT = Number(process.env.BRIDGE_PORT ?? 9123);
const TRYLL_HOST = process.env.TRYLL_HOST ?? "127.0.0.1";
const TRYLL_PORT = Number(process.env.TRYLL_PORT ?? 9100);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};

const enc = new TextEncoder();
const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json", ...CORS },
  });

// ── shared session (connect + configure once; reconnect on drop) ──────────
let session: TryllSession | null = null;
let ready = false;
let connecting: Promise<void> | null = null;

async function ensureSession(): Promise<void> {
  if (ready) return;
  if (connecting) return connecting;
  connecting = (async () => {
    const s = new TryllSession();
    await s.connect(TRYLL_HOST, TRYLL_PORT);
    await s.configureSession("tryll-web");
    session = s;
    ready = true;
    console.log("[bridge] session ready");
  })().catch((e) => {
    console.error(`[bridge] session connect failed: ${e}`);
    ready = false;
    session = null;
    throw e;
  }).finally(() => {
    connecting = null;
  });
  return connecting;
}

function sse(run: (send: (obj: unknown) => void) => Promise<void>): Response {
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));
      try {
        await run(send);
      } catch (e) {
        send({ error: e instanceof Error ? e.message : String(e) });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
      ...CORS,
    },
  });
}

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const { pathname } = url;

    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

    // GET /health
    if (req.method === "GET" && pathname === "/health") {
      try {
        await ensureSession();
        return json({ ready: true, version: 1 });
      } catch {
        return json({ ready: false }, 503);
      }
    }

    // POST /persona { name, system } -> { agentId }
    if (req.method === "POST" && pathname === "/persona") {
      await ensureSession();
      const { system } = (await req.json()) as { name?: string; system: string };
      const agentId = await session!.createAgent(system);
      return json({ agentId: agentId.toString() });
    }

    // DELETE /persona/:id
    if (req.method === "DELETE" && pathname.startsWith("/persona/")) {
      const id = decodeURIComponent(pathname.slice("/persona/".length));
      try {
        if (session && id) await session.destroyAgent(BigInt(id));
      } catch {
        /* agent may already be gone */
      }
      return json({ ok: true });
    }

    // POST /chat { agentId, text } -> SSE tokens
    if (req.method === "POST" && pathname === "/chat") {
      await ensureSession();
      const { agentId, text } = (await req.json()) as { agentId: string; text: string };
      return sse(async (send) => {
        await session!.sendMessage(BigInt(agentId), text, (t) => send({ token: t }));
        send({ done: true });
      });
    }

    // POST /models/download -> SSE progress (local model = instant)
    if (req.method === "POST" && pathname === "/models/download") {
      return sse(async (send) => {
        await ensureSession();
        send({ progress: 1, detail: "Model ready (local)" });
      });
    }

    return new Response("not found", { status: 404, headers: CORS });
  },
});

console.log(`[bridge] listening on http://127.0.0.1:${PORT}  ->  tryll_server ${TRYLL_HOST}:${TRYLL_PORT}`);
