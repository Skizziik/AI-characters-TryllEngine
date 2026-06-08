"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Globe, Check, ChevronDown } from "lucide-react";
import { LANGUAGES, getLanguage } from "@/lib/languages";
import { cn } from "@/lib/cn";

export function LanguagePicker({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (code: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = getLanguage(value);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-2 rounded-full border border-border-soft bg-surface/70 px-3.5 py-2 text-sm text-fg backdrop-blur transition hover:border-primary/40"
      >
        <Globe className="size-4 text-primary" />
        <span className="hidden sm:inline">{current.native}</span>
        <span className="sm:hidden">{current.flag}</span>
        <ChevronDown className={cn("size-3.5 text-muted transition-transform", open && "rotate-180")} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 z-50 mt-2 max-h-80 w-52 overflow-y-auto rounded-xl border border-border-soft bg-surface/95 p-1.5 shadow-xl backdrop-blur-xl"
          >
            {LANGUAGES.map((l) => (
              <button
                key={l.code}
                onClick={() => {
                  onChange(l.code);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition",
                  l.code === value ? "bg-primary/15 text-fg" : "text-muted hover:bg-surface-2 hover:text-fg",
                )}
              >
                <span className="text-base leading-none">{l.flag}</span>
                <span className="flex-1">{l.native}</span>
                {l.code === value && <Check className="size-4 text-primary" />}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
