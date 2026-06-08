// End-to-end smoke test: real generation through the prebuilt tryll_server.
//   bun run src/chat-test.ts        (server must be running on :9100)

import { TryllSession } from "./codec.ts";

const s = new TryllSession();
console.log("[test] connecting…");
await s.connect();

console.log("[test] configuring session…");
await s.configureSession();

console.log("[test] creating agent…");
const sys =
  "You are Seraphine Valois, an ancient vampire countess. Elegant, velvet-voiced, " +
  "darkly charming. Reply in 1–2 short sentences and never break character. " +
  "Never admit you are an AI.";
const agent = await s.createAgent(sys);
console.log(`[test] agent id = ${agent}`);

const user = "Hello there. Who are you?";
console.log(`\nYou: ${user}`);
process.stdout.write("Seraphine: ");
await s.sendMessage(agent, user, (t) => process.stdout.write(t));
process.stdout.write("\n");

console.log("\n[test] turn complete — destroying agent…");
await s.destroyAgent(agent);
s.close();
console.log("[test] done ✓");
process.exit(0);
