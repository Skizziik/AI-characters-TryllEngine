import { PERSONAS } from "@/lib/personas";

/* ── Chat counter ──────────────────────────────────────────────────────
   GET  /api/runs            -> { counts: { [id]: number } }
   POST /api/runs { id }     -> { id, count }

   DEV store: in-memory, seeded with a deterministic baseline so cards look
   alive. Resets on server restart and is per-instance — fine for local dev
   and previews. For production swap `store` for Upstash Redis (INCR):
     await fetch(`${UPSTASH_URL}/incr/runs:${id}`, { headers: { Authorization }})
   gate it behind process.env.UPSTASH_REDIS_REST_URL.                      */

export const dynamic = "force-dynamic";

function seed(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return 600 + (Math.abs(h) % 9000);
}

const counts = new Map<string, number>();
function ensureSeeded() {
  if (counts.size === 0) for (const p of PERSONAS) counts.set(p.id, seed(p.id));
}

export async function GET() {
  ensureSeeded();
  return Response.json({ counts: Object.fromEntries(counts) });
}

export async function POST(req: Request) {
  ensureSeeded();
  let id = "";
  try {
    ({ id } = (await req.json()) as { id: string });
  } catch {
    return Response.json({ error: "bad body" }, { status: 400 });
  }
  if (!id || !PERSONAS.some((p) => p.id === id)) {
    return Response.json({ error: "unknown id" }, { status: 400 });
  }
  const next = (counts.get(id) ?? seed(id)) + 1;
  counts.set(id, next);
  return Response.json({ id, count: next });
}
