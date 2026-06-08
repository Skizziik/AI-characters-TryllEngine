/** Shared domain types for the Tryll web client. */

export interface Persona {
  id: string;
  name: string;
  /** one-line hook shown on the card */
  tagline: string;
  /** longer blurb for the profile / hover */
  blurb: string;
  /** two hex colors for the avatar/card gradient (fallback when no image) */
  gradient: [string, string];
  /** portrait shown on the big gallery card — drop a file at /public{image} */
  image?: string;
  /** short tags shown as chips */
  tags: string[];
  /** the in-character description folded into the system prompt */
  persona: string;
  /** the character's opening line in a fresh chat */
  greeting: string;
  /** optional override of the whole system block (flagship characters) */
  systemOverride?: string;
}

export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  text: string;
  /** true while tokens are still streaming in */
  streaming?: boolean;
  ts: number;
}

/**
 * Lifecycle of the local Tryll stack, as the website sees it.
 *  absent       — no local runtime detected
 *  installing   — Tryll Desktop installer running
 *  downloading  — pulling model weights (~4 GB)
 *  starting     — tryll_server.exe booting + loading the model
 *  ready        — /health is green, personas unlocked
 */
export type StackPhase =
  | "unknown"
  | "absent"
  | "installing"
  | "downloading"
  | "starting"
  | "ready"
  | "error";

export interface StackState {
  phase: StackPhase;
  /** 0..1 for the active long-running step (download), else undefined */
  progress?: number;
  /** human label e.g. "Gemma 4 · 2.1 / 3.8 GB" */
  detail?: string;
  error?: string;
}
