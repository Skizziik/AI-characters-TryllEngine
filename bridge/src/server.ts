// Localhost bridge HTTP/SSE server + tryll_server lifecycle manager.
// Browser  <--HTTP/SSE+CORS-->  this bridge  <--TCP/FlatBuffers-->  tryll_server
//
// Lifecycle: the heavy tryll_server is NOT running at rest. It is spawned on the
// first /persona (entering a chat), and killed shortly after the last agent is
// closed (leaving the chat). /health reports only that the bridge (stack) is
// installed — it never boots the server.
//
//   GET    /health                 -> { ready, serverRunning }
//   POST   /persona  {name,system} -> { agentId }   (boots server if needed; waits until ready)
//   POST   /chat     {agentId,text}-> SSE: data:{token} ... data:{done:true}
//   DELETE /persona/:id            -> { ok }         (stops server when no agents remain)
//   POST   /models/download        -> SSE: data:{progress,detail}
//
//   bun run src/server.ts

import net from "node:net";
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { TryllSession } from "./codec.ts";

const PORT = Number(process.env.BRIDGE_PORT ?? 9123);
const TRYLL_HOST = process.env.TRYLL_HOST ?? "127.0.0.1";
const TRYLL_PORT = Number(process.env.TRYLL_PORT ?? 9100);
// Folder containing tryll_server.exe + its DLLs + data/ (cwd must be here).
const SERVER_DIR =
  process.env.TRYLL_SERVER_DIR ?? "D:/DEV/Claude/UNITYGAMES/server";
const SERVER_EXE = path.join(SERVER_DIR, "tryll_server.exe");
// Grace before shutting the server after the last agent leaves (ms).
const SHUTDOWN_GRACE_MS = Number(process.env.TRYLL_SHUTDOWN_GRACE_MS ?? 1500);

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
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── tryll_server process + session lifecycle ──────────────────────────────
let serverProc: ChildProcess | null = null;
let session: TryllSession | null = null;
let ready = false; // session connected + configured
let booting: Promise<void> | null = null;
const agents = new Set<string>();
let shutdownTimer: ReturnType<typeof setTimeout> | null = null;

function portOpen(host: string, port: number, timeoutMs = 800): Promise<boolean> {
  return new Promise((resolve) => {
    const s = net.connect({ host, port });
    const done = (ok: boolean) => {
      s.destroy();
      resolve(ok);
    };
    s.once("connect", () => done(true));
    s.once("error", () => resolve(false));
    s.setTimeout(timeoutMs, () => done(false));
  });
}

async function spawnServer(): Promise<void> {
  if (await portOpen(TRYLL_HOST, TRYLL_PORT)) return; // already up (manual/dev)
  console.log(`[bridge] spawning tryll_server (${SERVER_EXE})`);
  serverProc = spawn(SERVER_EXE, [], {
    cwd: SERVER_DIR,
    stdio: "ignore",
    windowsHide: true,
  });
  serverProc.on("exit", (code) => {
    console.log(`[bridge] tryll_server exited (${code})`);
    serverProc = null;
    session = null;
    ready = false;
  });
  // wait for the chat port to accept
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (await portOpen(TRYLL_HOST, TRYLL_PORT)) return;
    await sleep(300);
  }
  throw new Error("tryll_server did not start within 30s");
}

function stopServer() {
  agents.clear();
  ready = false;
  try {
    session?.close();
  } catch {
    /* ignore */
  }
  session = null;
  if (serverProc && !serverProc.killed) {
    console.log("[bridge] stopping tryll_server (no active chats)");
    try {
      serverProc.kill();
    } catch {
      /* ignore */
    }
  }
  serverProc = null;
}

/** Boot the server (if needed) + connect & configure the session. */
async function ensureReady(): Promise<void> {
  if (shutdownTimer) {
    clearTimeout(shutdownTimer);
    shutdownTimer = null;
  }
  if (ready && session) return;
  if (booting) return booting;
  booting = (async () => {
    await spawnServer();
    const s = new TryllSession();
    await s.connect(TRYLL_HOST, TRYLL_PORT);
    await s.configureSession("tryll-web");
    session = s;
    ready = true;
    console.log("[bridge] session ready");
  })().finally(() => {
    booting = null;
  });
  return booting;
}

function scheduleShutdownIfIdle() {
  if (agents.size > 0) return;
  if (shutdownTimer) clearTimeout(shutdownTimer);
  shutdownTimer = setTimeout(() => {
    shutdownTimer = null;
    if (agents.size === 0) stopServer();
  }, SHUTDOWN_GRACE_MS);
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
    const { pathname } = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

    // /health never boots the heavy server — it only says the stack is installed.
    if (req.method === "GET" && pathname === "/health") {
      return json({ ready: true, serverRunning: !!serverProc, version: 1 });
    }

    // Enter chat: boot server (waits until ready) + create agent.
    if (req.method === "POST" && pathname === "/persona") {
      await ensureReady();
      const { system } = (await req.json()) as { name?: string; system: string };
      const agentId = await session!.createAgent(system);
      agents.add(agentId.toString());
      return json({ agentId: agentId.toString() });
    }

    // Leave chat: destroy agent; stop server when none remain.
    if (req.method === "DELETE" && pathname.startsWith("/persona/")) {
      const id = decodeURIComponent(pathname.slice("/persona/".length));
      try {
        if (session && id) await session.destroyAgent(BigInt(id));
      } catch {
        /* may already be gone */
      }
      agents.delete(id);
      scheduleShutdownIfIdle();
      return json({ ok: true });
    }

    if (req.method === "POST" && pathname === "/chat") {
      await ensureReady();
      const { agentId, text } = (await req.json()) as { agentId: string; text: string };
      return sse(async (send) => {
        await session!.sendMessage(BigInt(agentId), text, (t) => send({ token: t }));
        send({ done: true });
      });
    }

    if (req.method === "POST" && pathname === "/models/download") {
      // Local prebuilt weights are already present — nothing to fetch.
      return sse(async (send) => send({ progress: 1, detail: "Model ready (local)" }));
    }

    return new Response("not found", { status: 404, headers: CORS });
  },
});

process.on("exit", stopServer);
process.on("SIGINT", () => {
  stopServer();
  process.exit(0);
});

console.log(`[bridge] listening on http://127.0.0.1:${PORT}`);
console.log(`[bridge] tryll_server: ${SERVER_EXE} (spawned on first chat, stopped when idle)`);
