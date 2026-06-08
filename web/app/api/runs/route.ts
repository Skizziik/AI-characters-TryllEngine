import { PERSONAS } from "@/lib/personas";

/* ── Chat counter (REAL counts, start at zero) ─────────────────────────
   GET  /api/runs            -> { counts: { [id]: number } }
   POST /api/runs { id }     -> { id, count }

   DEV store: in-memory, starts empty (every persona at 0) and counts real
   chat launches. Resets on server restart and is per-instance.

   PRODUCTION: swap `bump`/`all` for a persistent store so counts survive and
   are shared across visitors. With Upstash Redis (works from Render):
     GET  -> MGET runs:<id> for each persona
     POST -> INCR runs:<id>
   gate behind process.env.UPSTASH_REDIS_REST_URL + token.                 */

export const dynamic = "force-dynamic";

const counts = new Map<string, number>();

export async function GET() {
  // Report every known persona, defaulting to 0 so the UI renders real values.
  const out: Record<string, number> = {};
  for (const p of PERSONAS) out[p.id] = counts.get(p.id) ?? 0;
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
  const next = (counts.get(id) ?? 0) + 1;
  counts.set(id, next);
  return Response.json({ id, count: next });
}
