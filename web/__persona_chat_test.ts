/* Harness: runs the REAL buildSystemPrompt from lib/personas.ts against a local
   ollama model, multi-turn, and prints the transcript. Usage:
     bun __persona_chat_test.ts <model> <personaId> <ru|en>
*/
import { buildSystemPrompt, getGreeting, getPersona } from "./lib/personas";

const [model = "qwen2.5:3b", personaId = "seraphine", lang = "ru"] = process.argv.slice(2);
const p = getPersona(personaId)!;
const langName = lang === "ru" ? "Russian" : "English";
const system = buildSystemPrompt(p, langName);
const greet = getGreeting(p, lang);

const TURNS: Record<string, string[]> = {
  ru: ["привет, кто ты?", "у меня был паршивый день, если честно", "расскажи лучше что-нибудь о себе", "ты вообще настоящая или бот?"],
  en: ["hey, who are you?", "honestly my day sucked", "tell me something about yourself instead", "are you even real or a bot?"],
};

type Msg = { role: string; content: string };
const messages: Msg[] = [{ role: "system", content: system }];

async function chat(userText: string): Promise<string> {
  // The site appends Qwen's /no_think soft switch; ollama's qwen3 template has
  // its own thinking control instead — `think: false` is the equivalent here.
  messages.push({ role: "user", content: userText });
  const r = await fetch("http://localhost:11434/api/chat", {
    method: "POST",
    body: JSON.stringify({ model, messages, stream: false, think: false, options: { temperature: 0.8, top_p: 0.9, num_predict: 256 } }),
  });
  const j = (await r.json()) as { message: { content: string } };
  let out = j.message.content.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  messages.push({ role: "assistant", content: out });
  return out;
}

console.log(`── model=${model} persona=${personaId} lang=${lang} ──\n`);
const greetInstr =
  lang === "ru"
    ? `Это твоя самая первая реплика в разговоре. Произнеси ровно это, слово в слово, и больше ничего: «${greet}»`
    : `This is your very first line to the user. Say exactly this, word for word, and nothing else: "${greet}"`;
console.log(`[greeting] ${await chat(greetInstr)}\n`);
for (const t of TURNS[lang]) {
  console.log(`User: ${t}`);
  console.log(`${p.name}: ${await chat(t)}\n`);
}
