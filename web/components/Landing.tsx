"use client";

import { motion } from "motion/react";
import { ArrowRight, ShieldCheck, Cpu, Sparkles } from "lucide-react";
import { PERSONAS } from "@/lib/personas";
import { Avatar } from "./Avatar";
import { CollageBackground } from "./CollageBackground";

const FEATURES = [
  { icon: ShieldCheck, label: "100% private" },
  { icon: Cpu, label: "Runs on your GPU" },
  { icon: Sparkles, label: "No subscription" },
];

export function Landing({ onStart, ready }: { onStart: () => void; ready?: boolean }) {
  return (
    <section className="relative min-h-dvh w-full overflow-hidden">
      <CollageBackground />
      <div className="relative z-10 mx-auto flex min-h-dvh max-w-6xl flex-col items-center justify-center px-6 py-16 text-center">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="inline-flex items-center gap-2 rounded-full border border-border-soft bg-surface/60 px-4 py-1.5 text-sm text-muted backdrop-blur"
      >
        <span className="size-1.5 rounded-full bg-success" />
        Local AI characters · powered by the Tryll engine
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, delay: 0.05 }}
        className="mt-7 text-balance text-5xl font-semibold leading-[1.05] tracking-tight sm:text-7xl"
      >
        Talk to anyone.
        <br />
        <span className="gradient-text">On your own machine.</span>
      </motion.h1>

      <motion.p
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, delay: 0.12 }}
        className="mt-6 max-w-xl text-balance text-lg text-muted"
      >
        Pick a character and start chatting. The AI runs entirely on your
        computer — nothing leaves your device, no cloud, no limits.
      </motion.p>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, delay: 0.19 }}
        className="mt-9 flex flex-col items-center gap-4 sm:flex-row"
      >
        <button
          onClick={onStart}
          className="group inline-flex items-center gap-2 rounded-full gradient-primary px-7 py-3.5 font-medium text-white ring-glow transition hover:brightness-110 active:scale-[0.98]"
        >
          {ready ? "Open characters" : "Get started"}
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
        </button>
        <div className="flex items-center gap-5 text-sm text-muted">
          {FEATURES.map((f) => (
            <span key={f.label} className="inline-flex items-center gap-1.5">
              <f.icon className="size-4 text-primary" />
              {f.label}
            </span>
          ))}
        </div>
      </motion.div>

      {/* floating cast preview */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.3 }}
        className="mt-16 flex flex-wrap items-center justify-center gap-3"
      >
        {PERSONAS.map((p, i) => (
          <motion.div
            key={p.id}
            animate={{ y: [0, i % 2 ? -6 : 6, 0] }}
            transition={{ duration: 4 + (i % 3), repeat: Infinity, ease: "easeInOut" }}
            className="flex items-center gap-2 rounded-full border border-border-soft bg-surface/50 py-1.5 pl-1.5 pr-4 backdrop-blur"
          >
            <Avatar name={p.name} gradient={p.gradient} src={p.image} size={32} />
            <span className="text-sm font-medium">{p.name}</span>
          </motion.div>
        ))}
      </motion.div>
      </div>
    </section>
  );
}
