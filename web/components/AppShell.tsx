"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { Persona } from "@/lib/types";
import { useStack } from "@/lib/useStack";
import { useLanguage } from "@/lib/useLanguage";
import { Landing } from "./Landing";
import { Onboarding } from "./Onboarding";
import { PersonaGallery } from "./PersonaGallery";
import { ChatView } from "./ChatView";

type View = "landing" | "onboarding" | "gallery" | "chat";

export function AppShell() {
  const { state, activate, client } = useStack();
  const { code, set, language } = useLanguage();
  const [view, setView] = useState<View>("landing");
  const [persona, setPersona] = useState<Persona | null>(null);

  const go = (v: View) => setView(v);
  const ready = state.phase === "ready";

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={view}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
      >
        {view === "landing" && (
          // Skip onboarding entirely if the stack is already installed & ready.
          <Landing ready={ready} onStart={() => go(ready ? "gallery" : "onboarding")} />
        )}

        {view === "onboarding" && (
          <Onboarding
            state={state}
            onActivate={activate}
            onEnter={() => go("gallery")}
            onSkip={() => go("gallery")}
          />
        )}

        {view === "gallery" && (
          <PersonaGallery
            state={state}
            onActivate={activate}
            onPick={(p) => {
              setPersona(p);
              go("chat");
            }}
            language={code}
            onLanguageChange={set}
          />
        )}

        {view === "chat" && persona && (
          <ChatView
            persona={persona}
            client={client}
            language={language.name}
            onBack={() => go("gallery")}
          />
        )}
      </motion.div>
    </AnimatePresence>
  );
}
