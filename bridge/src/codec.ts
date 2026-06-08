// Tryll session: speaks the native FlatBuffers protocol to tryll_server over TCP.
//   connect() -> waits for SessionReady
//   configureSession() -> ConfigureSessionResponse
//   createAgent(systemPrompt) -> agentId  (graph = one streaming Generate node)
//   sendMessage(agentId, text, onToken) -> resolves on TurnComplete
//   destroyAgent(agentId) -> Ack
//
// Request/response correlation is by the client-allocated request_id the server
// echoes back. AnswerText frames stream in before TurnComplete for a turn.

import net from "node:net";
import * as flatbuffers from "flatbuffers";

import { Message } from "./gen/tryll/message.js";
import { MessageBody } from "./gen/tryll/message-body.js";
import { InferenceEngine } from "./gen/tryll/inference-engine.js";
import { ConfigureSessionRequest } from "./gen/tryll/configure-session-request.js";
import { CreateAgentRequest } from "./gen/tryll/create-agent-request.js";
import { SendMessageRequest } from "./gen/tryll/send-message-request.js";
import { DestroyAgentRequest } from "./gen/tryll/destroy-agent-request.js";
import { GraphDescription } from "./gen/tryll/graph-description.js";
import { NodeDescription } from "./gen/tryll/node-description.js";
import { NodeParams } from "./gen/tryll/node-params/node-params.js";
import { GenerateParams } from "./gen/tryll/node-params/generate-params.js";
import { SamplingOverrides } from "./gen/tryll/node-params/sampling-overrides.js";

import { SessionReady } from "./gen/tryll/session-ready.js";
import { CreateAgentResponse } from "./gen/tryll/create-agent-response.js";
import { AnswerText } from "./gen/tryll/answer-text.js";
import { TurnComplete } from "./gen/tryll/turn-complete.js";
import { ErrorResponse } from "./gen/tryll/error-response.js";

import { FrameReader, frame } from "./wire.ts";

export const DEFAULT_MODEL = "Gemma 4 E4B (Q4_K_M)";

export interface Sampling {
  temperature?: number;
  topP?: number;
  topK?: number;
  minP?: number;
  maxTokens?: number;
  seed?: number;
  repeatPenalty?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
}

const CHAT_SAMPLING: Sampling = {
  temperature: 0.8,
  topP: 0.9,
  topK: 40,
  minP: 0.05,
  maxTokens: 320,
  repeatPenalty: 1.15,
  presencePenalty: 0.3,
  frequencyPenalty: 0.3,
};

type Pending = {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
  onToken?: (t: string) => void;
};

export class TryllSession {
  private sock: net.Socket | null = null;
  private nextId = 1n;
  private pending = new Map<string, Pending>();
  private readyResolve: (() => void) | null = null;
  private readyReject: ((e: Error) => void) | null = null;

  connect(host = "127.0.0.1", port = 9100): Promise<void> {
    return new Promise((resolve, reject) => {
      this.readyResolve = resolve;
      this.readyReject = reject;
      const sock = net.connect(port, host);
      this.sock = sock;
      new FrameReader(sock, (payload) => this.onFrame(payload));
      sock.on("error", (e) => {
        this.readyReject?.(e);
        this.failAll(e.message);
      });
      sock.on("close", () => this.failAll("connection closed"));
    });
  }

  close() {
    try {
      this.sock?.end();
    } catch {
      /* ignore */
    }
  }

  // ── requests ──────────────────────────────────────────────────────────
  private allocId(): bigint {
    return this.nextId++;
  }

  private send(payload: Uint8Array) {
    if (!this.sock) throw new Error("not connected");
    this.sock.write(frame(payload));
  }

  private wrap(builder: flatbuffers.Builder, bodyType: MessageBody, bodyOffset: number): Uint8Array {
    const msg = Message.createMessage(builder, bodyType, bodyOffset);
    builder.finish(msg);
    return builder.asUint8Array();
  }

  configureSession(gameName = "tryll-web"): Promise<void> {
    const id = this.allocId();
    const b = new flatbuffers.Builder(256);
    const nameOff = b.createString(gameName);
    const body = ConfigureSessionRequest.createConfigureSessionRequest(
      b,
      id,
      InferenceEngine.LlamaCpp,
      true, // allow_auto_model_downloading
      nameOff,
      InferenceEngine.Mock, // stt (text-only)
      InferenceEngine.Mock, // tts
      InferenceEngine.Mock, // embedding
      0, // storage_data_folder (none)
    );
    const payload = this.wrap(b, MessageBody.ConfigureSessionRequest, body);
    return new Promise((resolve, reject) => {
      this.pending.set(id.toString(), { resolve: () => resolve(), reject });
      this.send(payload);
    });
  }

  createAgent(systemPrompt: string, model = DEFAULT_MODEL, sampling = CHAT_SAMPLING): Promise<bigint> {
    const id = this.allocId();
    const b = new flatbuffers.Builder(1024);

    // leaf strings + sub-tables first
    const sysOff = b.createString(systemPrompt);
    const samplingOff = buildSampling(b, sampling);

    GenerateParams.startGenerateParams(b);
    GenerateParams.addSystemPrompt(b, sysOff);
    GenerateParams.addStream(b, true);
    if (samplingOff) GenerateParams.addSampling(b, samplingOff);
    const gpOff = GenerateParams.endGenerateParams(b);

    const nodeNameOff = b.createString("speak");
    NodeDescription.startNodeDescription(b);
    NodeDescription.addName(b, nodeNameOff);
    NodeDescription.addParamsType(b, NodeParams.GenerateParams);
    NodeDescription.addParams(b, gpOff);
    const ndOff = NodeDescription.endNodeDescription(b);

    const nodesOff = GraphDescription.createNodesVector(b, [ndOff]);
    const startNodeOff = b.createString("speak");
    GraphDescription.startGraphDescription(b);
    GraphDescription.addNodes(b, nodesOff);
    GraphDescription.addStartNode(b, startNodeOff);
    const graphOff = GraphDescription.endGraphDescription(b);

    const modelOff = b.createString(model);
    CreateAgentRequest.startCreateAgentRequest(b);
    CreateAgentRequest.addRequestId(b, id);
    CreateAgentRequest.addGraph(b, graphOff);
    CreateAgentRequest.addDefaultModelName(b, modelOff);
    CreateAgentRequest.addEnableDiagnostics(b, false);
    const carOff = CreateAgentRequest.endCreateAgentRequest(b);

    const payload = this.wrap(b, MessageBody.CreateAgentRequest, carOff);
    return new Promise<bigint>((resolve, reject) => {
      this.pending.set(id.toString(), { resolve: (v) => resolve(v as bigint), reject });
      this.send(payload);
    });
  }

  sendMessage(agentId: bigint, text: string, onToken: (t: string) => void): Promise<void> {
    const id = this.allocId();
    const b = new flatbuffers.Builder(512);
    const textOff = b.createString(text);
    const body = SendMessageRequest.createSendMessageRequest(b, id, agentId, textOff);
    const payload = this.wrap(b, MessageBody.SendMessageRequest, body);
    return new Promise<void>((resolve, reject) => {
      this.pending.set(id.toString(), { resolve: () => resolve(), reject, onToken });
      this.send(payload);
    });
  }

  destroyAgent(agentId: bigint): Promise<void> {
    const id = this.allocId();
    const b = new flatbuffers.Builder(128);
    const body = DestroyAgentRequest.createDestroyAgentRequest(b, id, agentId);
    const payload = this.wrap(b, MessageBody.DestroyAgentRequest, body);
    return new Promise<void>((resolve, reject) => {
      this.pending.set(id.toString(), { resolve: () => resolve(), reject });
      this.send(payload);
    });
  }

  // ── inbound ───────────────────────────────────────────────────────────
  private onFrame(payload: Buffer) {
    const bb = new flatbuffers.ByteBuffer(new Uint8Array(payload));
    const msg = Message.getRootAsMessage(bb);
    const type = msg.bodyType();

    switch (type) {
      case MessageBody.SessionReady: {
        const sr = msg.body(new SessionReady()) as SessionReady;
        console.log(`[codec] SessionReady proto=${sr.protocolVersion()} session=${sr.sessionId()}`);
        this.readyResolve?.();
        this.readyResolve = null;
        break;
      }
      case MessageBody.ConfigureSessionResponse: {
        this.resolveById(readReqId(msg, MessageBody.ConfigureSessionResponse));
        break;
      }
      case MessageBody.CreateAgentResponse: {
        const r = msg.body(new CreateAgentResponse()) as CreateAgentResponse;
        this.resolveById(r.requestId().toString(), r.agentId());
        break;
      }
      case MessageBody.AnswerText: {
        const a = msg.body(new AnswerText()) as AnswerText;
        const p = this.pending.get(a.requestId().toString());
        const t = stripSpecial(a.text() ?? "");
        if (p?.onToken && t) p.onToken(t);
        break;
      }
      case MessageBody.TurnComplete: {
        const tc = msg.body(new TurnComplete()) as TurnComplete;
        this.resolveById(tc.requestId().toString());
        break;
      }
      case MessageBody.Ack: {
        // Ack has request_id at field 4; reuse a tiny reader.
        this.resolveById(readReqId(msg, MessageBody.Ack));
        break;
      }
      case MessageBody.ErrorResponse: {
        const e = msg.body(new ErrorResponse()) as ErrorResponse;
        const key = e.requestId().toString();
        const p = this.pending.get(key);
        this.pending.delete(key);
        p?.reject(new Error(`server error ${e.code()}: ${e.message() ?? ""}`));
        break;
      }
      default:
        // DownloadProgress, NodeEvent, etc. — ignored for text v1.
        break;
    }
  }

  private resolveById(key: string, value?: unknown) {
    const p = this.pending.get(key);
    if (!p) return;
    this.pending.delete(key);
    p.resolve(value);
  }

  private failAll(reason: string) {
    for (const [, p] of this.pending) p.reject(new Error(reason));
    this.pending.clear();
  }
}

// ── helpers ───────────────────────────────────────────────────────────────

/** Strip Gemma chat-template control tokens that occasionally leak into output. */
function stripSpecial(s: string): string {
  return s.replace(/<end_of_turn>|<start_of_turn>|<eos>|<bos>|<pad>/g, "");
}

function buildSampling(b: flatbuffers.Builder, s: Sampling): number | null {
  SamplingOverrides.startSamplingOverrides(b);
  if (s.temperature != null) SamplingOverrides.addTemperature(b, s.temperature);
  if (s.topP != null) SamplingOverrides.addTopP(b, s.topP);
  if (s.topK != null) SamplingOverrides.addTopK(b, s.topK);
  if (s.minP != null) SamplingOverrides.addMinP(b, s.minP);
  if (s.maxTokens != null) SamplingOverrides.addMaxTokens(b, s.maxTokens);
  if (s.seed != null) SamplingOverrides.addSeed(b, s.seed);
  if (s.repeatPenalty != null) SamplingOverrides.addRepeatPenalty(b, s.repeatPenalty);
  if (s.presencePenalty != null) SamplingOverrides.addPresencePenalty(b, s.presencePenalty);
  if (s.frequencyPenalty != null) SamplingOverrides.addFrequencyPenalty(b, s.frequencyPenalty);
  return SamplingOverrides.endSamplingOverrides(b);
}

// ConfigureSessionResponse and Ack both expose request_id at vtable slot 4.
import { ConfigureSessionResponse } from "./gen/tryll/configure-session-response.js";
import { Ack } from "./gen/tryll/ack.js";
function readReqId(msg: Message, type: MessageBody): string {
  if (type === MessageBody.Ack) {
    return (msg.body(new Ack()) as Ack).requestId().toString();
  }
  return (msg.body(new ConfigureSessionResponse()) as ConfigureSessionResponse).requestId().toString();
}
