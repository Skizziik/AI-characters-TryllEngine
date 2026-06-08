"use client";

import { useCallback, useEffect, useState } from "react";

/** Per-persona chat counts. Fetches the map on mount; increment() bumps the
 *  count optimistically and persists it via /api/runs. */
export function useRuns() {
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    let alive = true;
    fetch("/api/runs", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { counts?: Record<string, number> }) => {
        if (alive && j.counts) setCounts(j.counts);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const increment = useCallback((id: string) => {
    setCounts((c) => ({ ...c, [id]: (c[id] ?? 0) + 1 }));
    fetch("/api/runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    })
      .then((r) => r.json())
      .then((j: { id?: string; count?: number }) => {
        if (j.id && typeof j.count === "number") {
          setCounts((c) => ({ ...c, [j.id as string]: j.count as number }));
        }
      })
      .catch(() => {});
  }, []);

  return { counts, increment };
}
