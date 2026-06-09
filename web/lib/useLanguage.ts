"use client";

import { useEffect, useReducer } from "react";
import { getLanguage } from "./languages";

const KEY = "tryll.lang";

/* Shared language store: a module-level value + subscribers, so changing the
   language anywhere instantly re-renders the WHOLE UI (not just the picker). */
let current = "en";
let loaded = false;
const listeners = new Set<() => void>();

function ensureLoaded() {
  if (!loaded && typeof localStorage !== "undefined") {
    current = localStorage.getItem(KEY) ?? "en";
    loaded = true;
  }
}

function setLang(code: string) {
  current = code;
  loaded = true;
  try {
    localStorage.setItem(KEY, code);
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

/** Persisted conversation/UI language, shared across all components. */
export function useLanguage() {
  const [, bump] = useReducer((x: number) => x + 1, 0);

  useEffect(() => {
    // Sync from localStorage on first mount, then subscribe to changes.
    const saved = typeof localStorage !== "undefined" ? localStorage.getItem(KEY) : null;
    if (saved && saved !== current) {
      current = saved;
      loaded = true;
      bump();
    }
    listeners.add(bump);
    return () => {
      listeners.delete(bump);
    };
  }, []);

  ensureLoaded();
  return { code: current, set: setLang, language: getLanguage(current) };
}
