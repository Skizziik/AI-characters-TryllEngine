"use client";

import { useCallback, useEffect, useState } from "react";
import { getLanguage } from "./languages";

const KEY = "tryll.lang";

/** Persisted conversation-language choice (localStorage). */
export function useLanguage() {
  const [code, setCode] = useState("en");

  useEffect(() => {
    const saved = typeof localStorage !== "undefined" ? localStorage.getItem(KEY) : null;
    if (saved) setCode(saved);
  }, []);

  const set = useCallback((c: string) => {
    setCode(c);
    try {
      localStorage.setItem(KEY, c);
    } catch {
      /* ignore */
    }
  }, []);

  return { code, set, language: getLanguage(code) };
}
