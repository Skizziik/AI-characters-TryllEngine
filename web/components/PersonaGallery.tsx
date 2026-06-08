"use client";

import { AnimatePresence, motion } from "motion/react";
import { Sparkles } from "lucide-react";
import { PERSONAS } from "@/lib/personas";
import type { Persona, StackState } from "@/lib/types";
import { PersonaCard } from "./PersonaCard";
import { ActivatePanel } from "./ActivatePanel";

export function PersonaGallery({
  state,
  onActivate,
  onPick,
}: {
  state: StackState;
  onActivate: () => void;
  onPick: (p: Persona) => void;
}) {
  const ready = state.phase === "ready";

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <header className="flex flex-col gap-2">
        <div className="inline-flex items-center gap-2 text-sm text-primary">
          <Sparkles className="size-4" />
          Characters
        </div>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Who do you want to talk to?
        </h1>
        <p className="max-w-xl text-muted">
          Each character runs live on your machine. Pick one and start a
          conversation — switch any time.
        </p>
      </header>

      <AnimatePresence>
        {!ready && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-8 flex justify-center">
              <ActivatePanel state={state} onActivate={onActivate} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {PERSONAS.map((p, i) => (
          <PersonaCard key={p.id} persona={p} locked={!ready} onPick={onPick} index={i} />
        ))}
      </div>
    </div>
  );
}
