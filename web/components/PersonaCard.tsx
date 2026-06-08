"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { Lock, MessageCircle } from "lucide-react";
import type { Persona } from "@/lib/types";
import { cn } from "@/lib/cn";

/** Large portrait card (polybuzz-style). Image fills the card; text sits
 *  over a dark gradient at the bottom. Falls back to the persona gradient
 *  + monogram when no portrait is present. */
export function PersonaCard({
  persona,
  locked,
  onPick,
  index = 0,
}: {
  persona: Persona;
  locked: boolean;
  onPick: (p: Persona) => void;
  index?: number;
}) {
  const [imgOk, setImgOk] = useState(true);
  const hasImg = !!persona.image && imgOk;

  return (
    <motion.button
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: Math.min(index * 0.05, 0.35) }}
      whileHover={locked ? undefined : { y: -6 }}
      onClick={() => !locked && onPick(persona)}
      disabled={locked}
      className={cn(
        "group relative flex aspect-[4/5] w-full flex-col justify-end overflow-hidden rounded-[1.4rem] text-left",
        "border border-border-soft ring-1 ring-black/40 transition",
        locked ? "cursor-not-allowed" : "hover:border-primary/50",
      )}
    >
      {/* portrait / gradient base */}
      <div
        className="absolute inset-0"
        style={{ backgroundImage: `linear-gradient(150deg, ${persona.gradient[0]}, ${persona.gradient[1]})` }}
      />
      {persona.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={persona.image}
          alt={persona.name}
          onError={() => setImgOk(false)}
          className={cn(
            "absolute inset-0 h-full w-full object-cover transition-transform duration-700",
            !locked && "group-hover:scale-[1.04]",
          )}
        />
      )}
      {/* monogram watermark when no image */}
      {!hasImg && (
        <span className="absolute inset-0 grid place-items-center text-7xl font-bold text-white/15">
          {persona.name.slice(0, 1)}
        </span>
      )}

      {/* legibility scrim */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-transparent" />

      {/* content */}
      <div className={cn("relative z-10 p-5", locked && "opacity-60 blur-[1px]")}>
        <h3 className="text-lg font-semibold leading-tight text-white drop-shadow">
          {persona.name}
        </h3>
        <p className="mt-1 line-clamp-2 text-sm text-white/70">{persona.tagline}</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {persona.tags.map((t) => (
            <span
              key={t}
              className="rounded-full border border-white/15 bg-black/30 px-2.5 py-0.5 text-xs text-white/80 backdrop-blur-sm"
            >
              {t}
            </span>
          ))}
        </div>

        {!locked && (
          <div className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
            <MessageCircle className="size-4" />
            Start chatting
          </div>
        )}
      </div>

      {/* locked overlay */}
      {locked && (
        <div className="absolute inset-0 z-20 grid place-items-center bg-black/40 backdrop-blur-[2px]">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-black/60 px-3.5 py-1.5 text-xs text-white/90">
            <Lock className="size-3.5" />
            Activate to unlock
          </span>
        </div>
      )}
    </motion.button>
  );
}
