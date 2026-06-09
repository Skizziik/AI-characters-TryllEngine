"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useStack } from "@/lib/useStack";
import { useLanguage } from "@/lib/useLanguage";
import { createConversation, getConversation } from "@/lib/conversations";
import { Landing } from "./Landing";
import { Onboarding } from "./Onboarding";
import { PersonaGallery } from "./PersonaGallery";
import { ChatView } from "./ChatView";

type View = "landing" | "onboarding" | "gallery" | "chat";

/** Count a real chat launch (global counter — see /api/runs). */
function bumpRuns(personaId: string) {
  fetch("/api/runs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: personaId }),
  }).catch(() => {});
}

export function AppShell() {
  const { state, activate, client } = useStack();
  const { code, set, language } = useLanguage();
  const [view, setView] = useState<View>("landing");
  const [convId, setConvId] = useState<string | null>(null);

  const ready = state.phase === "ready";

  const startChat = (personaId: string) => {
    const c = createConversation(personaId, language.name);
    bumpRuns(personaId);
    setConvId(c.id);
    setView("chat");
  };

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
          <Landing ready={ready} onStart={() => setView(ready ? "gallery" : "onboarding")} />
        )}

        {view === "onboarding" && (
          <Onboarding
            state={state}
            onActivate={activate}
            onEnter={() => setView("gallery")}
            onSkip={() => setView("gallery")}
          />
        )}

        {view === "gallery" && (
          <PersonaGallery
            state={state}
            onActivate={activate}
            onPick={(p) => startChat(p.id)}
            language={code}
            onLanguageChange={set}
          />
        )}

        {view === "chat" && convId && (
          <ChatView
            conversationId={convId}
            client={client}
            onBack={() => setView("gallery")}
            onSwitch={(id) => setConvId(id)}
            onNewChat={() => {
              const cur = getConversation(convId);
              if (cur) startChat(cur.personaId);
              else setView("gallery");
            }}
          />
        )}
      </motion.div>
    </AnimatePresence>
  );
}
