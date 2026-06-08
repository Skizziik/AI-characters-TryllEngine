"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { stackClient } from "./stackClient";
import type { StackState } from "./types";

/**
 * React state for the local Tryll stack lifecycle.
 * - polls /health so an already-installed runtime is detected on load
 * - exposes activate() to drive install → download → start
 */
export function useStack() {
  const [state, setState] = useState<StackState>({ phase: "unknown" });
  const activating = useRef(false);

  // Detect an existing runtime on mount (and keep watching while absent).
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;

    const poll = async () => {
      if (!alive || activating.current) return;
      const ok = await stackClient.health();
      if (!alive) return;
      setState((s) =>
        ok
          ? { phase: "ready" }
          : s.phase === "unknown"
            ? { phase: "absent" }
            : s,
      );
      if (!ok) timer = setTimeout(poll, 2500);
    };

    poll();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, []);

  const activate = useCallback(async () => {
    if (activating.current) return;
    activating.current = true;
    try {
      await stackClient.activate(setState);
    } catch (e) {
      setState({ phase: "error", error: e instanceof Error ? e.message : String(e) });
    } finally {
      activating.current = false;
    }
  }, []);

  return { state, activate, client: stackClient };
}
