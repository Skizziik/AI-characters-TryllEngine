// Transport probe: connect to tryll_server (:9100), read the first unsolicited
// frame (SessionReady), and report it. Proves the bridge can speak the wire
// protocol before we layer the FlatBuffers codec on top.
//
//   bun run src/probe.ts          (server must be running on 127.0.0.1:9100)

import net from "node:net";
import { FrameReader } from "./wire.ts";

const HOST = process.env.TRYLL_HOST ?? "127.0.0.1";
const PORT = Number(process.env.TRYLL_PORT ?? 9100);

const sock = net.connect(PORT, HOST, () => {
  console.log(`[probe] connected to ${HOST}:${PORT}`);
});

let got = false;
new FrameReader(sock, (payload) => {
  got = true;
  console.log(`[probe] frame received: ${payload.length} bytes`);
  console.log(`[probe] first 32 bytes: ${payload.subarray(0, 32).toString("hex")}`);
  // FlatBuffers root: first 4 bytes = uoffset to root table.
  const rootOffset = payload.readUInt32LE(0);
  console.log(`[probe] flatbuffer root offset = ${rootOffset}`);
  console.log("[probe] transport OK — SessionReady frame decoded at the byte level.");
  sock.end();
  process.exit(0);
});

sock.on("error", (e) => {
  console.error(`[probe] socket error: ${e.message}`);
  process.exit(1);
});

setTimeout(() => {
  if (!got) {
    console.error("[probe] timeout: no frame within 5s (is the server up?)");
    process.exit(2);
  }
}, 5000);
