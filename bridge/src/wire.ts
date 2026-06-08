// Tryll wire framing: 4-byte little-endian length prefix + FlatBuffers payload.
// Mirrors server/common/include/tryll/Protocol.h and the C# ClientWire.cs.

import type { Socket } from "node:net";

export const MAX_FRAME_BYTES = 1_048_576; // 1 MB
export const LEN_PREFIX = 4;

/** Encode one frame: [len:u32le][payload]. */
export function frame(payload: Uint8Array): Uint8Array {
  if (payload.length === 0 || payload.length > MAX_FRAME_BYTES) {
    throw new Error(`frame: bad payload length ${payload.length}`);
  }
  const out = new Uint8Array(LEN_PREFIX + payload.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, payload.length, true);
  out.set(payload, LEN_PREFIX);
  return out;
}

/**
 * Reads length-prefixed frames off a socket and invokes `onFrame` per payload.
 * Buffers partial reads across TCP chunks.
 */
export class FrameReader {
  private buf = Buffer.alloc(0);

  constructor(
    socket: Socket,
    private onFrame: (payload: Buffer) => void,
  ) {
    socket.on("data", (chunk: Buffer) => this.push(chunk));
  }

  private push(chunk: Buffer) {
    this.buf = this.buf.length ? Buffer.concat([this.buf, chunk]) : chunk;
    for (;;) {
      if (this.buf.length < LEN_PREFIX) return;
      const len = this.buf.readUInt32LE(0);
      if (len === 0 || len > MAX_FRAME_BYTES) {
        throw new Error(`FrameReader: bad frame length ${len}`);
      }
      if (this.buf.length < LEN_PREFIX + len) return; // wait for more
      const payload = this.buf.subarray(LEN_PREFIX, LEN_PREFIX + len);
      this.buf = this.buf.subarray(LEN_PREFIX + len);
      this.onFrame(Buffer.from(payload));
    }
  }
}
