import type { Persona, StackState } from "./types";

/* ── Stack client ──────────────────────────────────────────────────────
   Abstraction over the local Tryll runtime. The website never speaks the
   raw TCP/FlatBuffers protocol — it talks to the localhost bridge that
   Tryll Desktop exposes. Until that bridge exists we run a MockStackClient
   so the whole experience is demoable end-to-end.

   Bridge HTTP contract (what HttpStackClient will target):
     GET  /health                 -> { version, ready }
     POST /persona  {system,name} -> { agentId }
     POST /chat     {agentId,text}-> SSE: data:{token} ... data:{done:true}
     POST /models/download        -> SSE: data:{progress,detail}
*/

export const BRIDGE_BASE =
  process.env.NEXT_PUBLIC_BRIDGE_URL ?? "http://127.0.0.1:9123";

export interface StackClient {
  /** is a local runtime up and the model loaded? */
  health(): Promise<boolean>;
  /** drive install → weight download → server start; reports progress */
  activate(onUpdate: (s: StackState) => void): Promise<void>;
  /** create/select an agent for a persona, returns its id */
  createPersona(p: Persona, systemPrompt: string): Promise<string>;
  /** send a user turn; streams assistant tokens */
  chat(
    agentId: string,
    text: string,
    onToken: (t: string) => void,
    signal?: AbortSignal,
  ): Promise<void>;
  /** tear the agent down — bridge stops the server when the last agent closes */
  closeAgent(agentId: string): Promise<void>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ── Mock implementation ───────────────────────────────────────────── */

const REPLY_BANK: Record<string, string[]> = {
  seraphine: [
    "Mm. How charmingly direct. I've had centuries to learn patience — indulge me a little longer.",
    "You amuse me, and that is rarer than you'd think. Go on, mortal. I'm listening.",
    "Darling, I've outlived empires and worse conversationalists than you. Surprise me.",
  ],
  kade: [
    "Huh. Most people lie about that. You didn't. Noted. Keep talking.",
    "Out here, a story like that gets you killed or paid. Sometimes both. Go on.",
    "I don't do reassurance. But for what it's worth — that's not the dumbest plan I've heard.",
  ],
  mira: [
    "Oh — that made something flutter in my chest. I think I like it. Tell me more?",
    "I'm recording this feeling so I don't forget it. Is that strange? It feels important.",
    "Humans carry so much in so few words. I want to understand all of it. Please, continue.",
  ],
  aria: [
    "Heh. That's either genius or a great way to get flatlined. I'm in either way.",
    "Give me a second — pinging the grid. ...Okay, talk to me, what's the play?",
    "Cute. But you and I both know you didn't ping me for small talk.",
  ],
  kael: [
    "Aye, now that's a question worth a pint. Sit, sit — let me think on it proper.",
    "Hah! Reminds me of an apprentice I had. Twice as clever, half as careful.",
    "Steel doesn't lie and neither do I, friend. Speak plain and I'll do the same.",
  ],
  yuki: [
    "Ooh good one! Okay okay, let's figure it out together — you've totally got this!",
    "Yes!! That's exactly the right energy. Fight-o! What's the next step?",
    "Don't you dare give up now, we're so close. I'm cheering for you, promise!",
  ],
  reeves: [
    "Funny. Everybody's got a story like that. Yours just happens to be true.",
    "I've seen that look before. Usually right before things get interesting.",
    "Keep talking. The good part's always buried a little deeper than people think.",
  ],
  nova: [
    "Mm, I like the way you put that. Tell me more — I'm genuinely curious about you.",
    "You're more interesting than you let on, you know that? Go on.",
    "Careful, say things like that and I might actually start looking forward to these chats.",
  ],
  oda: [
    "A still mind sees the path. Tell me what truly weighs on you.",
    "Even the longest river begins as a single drop. Begin, and we will follow it.",
    "You already know the answer. I am only here so you say it aloud.",
  ],
  bex: [
    "OKAY that's actually unhinged and I'm OBSESSED, please continue immediately.",
    "Chat is gonna lose it. Wait — it's just us. Whatever, I'M losing it. Go on!",
    "Plot twist nobody saw coming! Okay okay what happens next, don't leave me hanging.",
  ],
  quill: [
    "Fascinating! That gives me an idea — possibly explosive, definitely brilliant. Continue!",
    "Yes, yes! Now if we just bolted a small steam valve onto that notion... go on, go on.",
    "Marvellous question. I shall ponder it whilst not setting the workshop alight. Probably.",
  ],
};

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export class MockStackClient implements StackClient {
  private ready = false;

  async health(): Promise<boolean> {
    return this.ready;
  }

  async activate(onUpdate: (s: StackState) => void): Promise<void> {
    onUpdate({ phase: "installing", detail: "Installing Tryll Desktop…" });
    await sleep(1100);

    const total = 3.8;
    onUpdate({ phase: "downloading", progress: 0, detail: `Gemma 4 · 0.0 / ${total} GB` });
    for (let i = 1; i <= 40; i++) {
      await sleep(70);
      const got = ((i / 40) * total).toFixed(1);
      onUpdate({
        phase: "downloading",
        progress: i / 40,
        detail: `Gemma 4 · ${got} / ${total} GB`,
      });
    }

    onUpdate({ phase: "starting", detail: "Starting local server & loading model…" });
    await sleep(1400);

    this.ready = true;
    onUpdate({ phase: "ready" });
  }

  async createPersona(p: Persona): Promise<string> {
    await sleep(250);
    return `mock-${p.id}-${Date.now()}`;
  }

  async chat(
    agentId: string,
    text: string,
    onToken: (t: string) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    const id = agentId.split("-")[1] ?? "aria";
    const bank = REPLY_BANK[id] ?? REPLY_BANK.aria;
    const reply = bank[hash(text + agentId) % bank.length];
    const words = reply.split(" ");
    await sleep(380); // "thinking"
    for (const w of words) {
      if (signal?.aborted) return;
      onToken(w + " ");
      await sleep(45 + (hash(w) % 40));
    }
  }

  async closeAgent(): Promise<void> {
    // The real bridge stops tryll_server when the last agent closes.
    await sleep(50);
  }
}

/* ── Real bridge implementation (used once Tryll Desktop is installed) ── */

export class HttpStackClient implements StackClient {
  constructor(private base = BRIDGE_BASE) {}

  async health(): Promise<boolean> {
    try {
      const r = await fetch(`${this.base}/health`, { cache: "no-store" });
      if (!r.ok) return false;
      const j = (await r.json()) as { ready?: boolean };
      return !!j.ready;
    } catch {
      return false;
    }
  }

  async activate(onUpdate: (s: StackState) => void): Promise<void> {
    // Install handoff happens via the tryll:// deep link + Tryll Desktop.
    // Here we drive the model download over SSE and wait for /health.
    const res = await fetch(`${this.base}/models/download`, { method: "POST" });
    if (res.body) {
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";
        for (const part of parts) {
          const line = part.replace(/^data:\s*/, "").trim();
          if (!line) continue;
          const j = JSON.parse(line) as { progress?: number; detail?: string };
          onUpdate({ phase: "downloading", progress: j.progress, detail: j.detail });
        }
      }
    }
    onUpdate({ phase: "starting", detail: "Loading model…" });
    while (!(await this.health())) await sleep(800);
    onUpdate({ phase: "ready" });
  }

  async createPersona(p: Persona, systemPrompt: string): Promise<string> {
    const r = await fetch(`${this.base}/persona`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: p.name, system: systemPrompt }),
    });
    const j = (await r.json()) as { agentId: string };
    return j.agentId;
  }

  async chat(
    agentId: string,
    text: string,
    onToken: (t: string) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    const res = await fetch(`${this.base}/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ agentId, text }),
      signal,
    });
    if (!res.body) return;
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const parts = buf.split("\n\n");
      buf = parts.pop() ?? "";
      for (const part of parts) {
        const line = part.replace(/^data:\s*/, "").trim();
        if (!line) continue;
        const j = JSON.parse(line) as { token?: string; done?: boolean };
        if (j.token) onToken(j.token);
      }
    }
  }

  async closeAgent(agentId: string): Promise<void> {
    try {
      await fetch(`${this.base}/persona/${encodeURIComponent(agentId)}`, { method: "DELETE" });
    } catch {
      /* ignore — bridge may already be down */
    }
  }
}

/** Singleton client for the app.
 *  Default: the real localhost bridge (HttpStackClient). Set
 *  NEXT_PUBLIC_STACK=mock to demo the flow without a local stack. */
export const stackClient: StackClient =
  process.env.NEXT_PUBLIC_STACK === "mock" ? new MockStackClient() : new HttpStackClient();
