"use client";

import { useEffect, useState } from "react";
import { ShieldAlert } from "lucide-react";

const KEY = "tryll.adult";

/** 18+ confirmation gate. Blocks the app until the visitor confirms they're an
 *  adult; the choice is remembered. */
export function AgeGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<"checking" | "blocked" | "ok">("checking");

  useEffect(() => {
    setState(localStorage.getItem(KEY) === "1" ? "ok" : "blocked");
  }, []);

  if (state === "ok") return <>{children}</>;
  if (state === "checking") return null; // avoid a flash before localStorage is read

  return (
    <div className="grid min-h-dvh place-items-center px-6">
      <div className="w-full max-w-md rounded-2xl glass p-8 text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl gradient-primary text-white ring-glow">
          <ShieldAlert className="size-7" />
        </span>
        <h1 className="mt-5 text-2xl font-semibold">
          <span className="gradient-text">Tryll</span> · 18+ only
        </h1>
        <p className="mt-3 text-sm text-muted">
          This site features mature, adult-oriented AI characters and conversations.
          It is intended for adults only. By entering, you confirm that you are at
          least 18 years old and consent to viewing adult content.
        </p>
        <button
          onClick={() => {
            localStorage.setItem(KEY, "1");
            setState("ok");
          }}
          className="mt-6 w-full rounded-xl gradient-primary px-5 py-3 font-medium text-white ring-glow transition hover:brightness-110 active:scale-[0.99]"
        >
          I&apos;m 18 or older — Enter
        </button>
        <button
          onClick={() => {
            window.location.href = "https://www.google.com";
          }}
          className="mt-3 w-full rounded-xl border border-border-soft px-5 py-3 text-sm text-muted transition hover:text-fg"
        >
          Leave
        </button>
        <p className="mt-4 text-xs text-muted-2">
          Characters are fictional. Everything they say is AI-generated.
        </p>
      </div>
    </div>
  );
}
