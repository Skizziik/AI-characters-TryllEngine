import { PERSONAS } from "@/lib/personas";

/* ── Global chat counter ───────────────────────────────────────────────
   GET  /api/runs        -> { counts: { [id]: number } }
   POST /api/runs { id } -> { id, count }

   Shared across ALL visitors via Upstash Redis (REST). Add the integration in
   Vercel (Storage → Upstash Redis / KV) — it sets the env vars below — and the
   count becomes global. Without the env vars it falls back to a per-instance
   in-memory map (fine for local dev; not shared).                          */

export const dynamic = "force-dynamic";

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
const hasRedis = !!(REDIS_URL && REDIS_TOKEN);

async function redis<T = unknown>(cmd: (string | number)[]): Promise<T | null> {
  try {
    const r = await fetch(REDIS_URL!, {
      method: "POST",
      headers: { Authorization: `Bearer ${REDIS_TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify(cmd),
      cache: "no-store",
    });
    const j = (await r.json()) as { result?: T };
    return j.result ?? null;
  } catch {
    return null;
  }
}

const mem = new Map<string, number>();

export async function GET() {
  const out: Record<string, number> = {};
  if (hasRedis) {
    const keys = PERSONAS.map((p) => `runs:${p.id}`);
    const res = (await redis<(string | null)[]>(["MGET", ...keys])) ?? [];
    PERSONAS.forEach((p, i) => (out[p.id] = Number(res[i] ?? 0)));
  } else {
    for (const p of PERSONAS) out[p.id] = mem.get(p.id) ?? 0;
  }
  return Response.json({ counts: out });
}

export async function POST(req: Request) {
  let id = "";
  try {
    ({ id } = (await req.json()) as { id: string });
  } catch {
    return Response.json({ error: "bad body" }, { status: 400 });
  }
  if (!id || !PERSONAS.some((p) => p.id === id)) {
    return Response.json({ error: "unknown id" }, { status: 400 });
  }
  if (hasRedis) {
    const n = (await redis<number>(["INCR", `runs:${id}`])) ?? 0;
    return Response.json({ id, count: Number(n) });
  }
  const n = (mem.get(id) ?? 0) + 1;
  mem.set(id, n);
  return Response.json({ id, count: n });
}
