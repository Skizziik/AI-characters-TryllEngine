"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowRight,
  ArrowLeft,
  MessageSquareHeart,
  Cpu,
  ShieldCheck,
  Download,
  Users,
  Sparkles,
} from "lucide-react";
import type { StackState } from "@/lib/types";
import { ActivatePanel } from "./ActivatePanel";
import { CollageBackground } from "./CollageBackground";
import { useT } from "@/lib/i18n";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/cn";

interface Props {
  state: StackState;
  onActivate: () => void;
  onEnter: () => void;
  onSkip: () => void;
}

const HOW = [
  { icon: Download, titleKey: "onb.how1_t", bodyKey: "onb.how1_b" },
  { icon: Users, titleKey: "onb.how2_t", bodyKey: "onb.how2_b" },
  { icon: MessageSquareHeart, titleKey: "onb.how3_t", bodyKey: "onb.how3_b" },
];

export function Onboarding({ state, onActivate, onEnter, onSkip }: Props) {
  const t = useT();
  const [step, setStep] = useState(0);
  const last = 3;
  const ready = state.phase === "ready";

  return (
    <section className="relative min-h-dvh w-full overflow-hidden">
      <CollageBackground />
      {ready && (
        <button
          onClick={onSkip}
          className="absolute right-6 top-6 z-20 inline-flex items-center gap-1 rounded-full border border-border-soft bg-surface/60 px-4 py-2 text-sm text-muted backdrop-blur transition hover:text-fg"
        >
          {t("onb.skip")}
        </button>
      )}
      <div className="relative z-10 mx-auto flex min-h-dvh max-w-3xl flex-col items-center justify-center px-6 py-16">
      {/* progress dots */}
      <div className="mb-10 flex items-center gap-2">
        {Array.from({ length: last + 1 }).map((_, i) => (
          <span
            key={i}
            className={cn(
              "h-1.5 rounded-full transition-all",
              i === step ? "w-8 bg-primary" : i < step ? "w-4 bg-primary/50" : "w-4 bg-surface-2",
            )}
          />
        ))}
      </div>

      {/* Fixed-height stage (on ≥sm) so every step occupies the same box and
          the nav buttons below never move between steps. */}
      <div className="relative flex min-h-[22rem] w-full items-center justify-center sm:h-[26rem] sm:min-h-0">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.3 }}
            className="flex w-full flex-col items-center text-center"
          >
            {step === 0 && (
              <>
                <span className="grid size-14 place-items-center rounded-2xl gradient-primary text-white ring-glow">
                  <Sparkles className="size-7" />
                </span>
                <h2 className="mt-6 text-3xl font-semibold tracking-tight sm:text-4xl">
                  {t("onb.welcome")} <span className="gradient-text">{BRAND}</span>
                </h2>
                <p className="mt-3 max-w-md text-muted">{t("onb.welcome_body")}</p>
              </>
            )}

            {step === 1 && (
              <>
                <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                  {t("onb.how_title")}
                </h2>
                <div className="mt-8 grid w-full gap-4 sm:grid-cols-3">
                  {HOW.map((h, i) => (
                    <motion.div
                      key={h.titleKey}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 + i * 0.08 }}
                      className="rounded-2xl glass p-5 text-left"
                    >
                      <h.icon className="size-6 text-primary" />
                      <p className="mt-3 font-medium">{t(h.titleKey)}</p>
                      <p className="mt-1 text-sm text-muted">{t(h.bodyKey)}</p>
                    </motion.div>
                  ))}
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <span className="grid size-14 place-items-center rounded-2xl bg-success/15 text-success">
                  <ShieldCheck className="size-7" />
                </span>
                <h2 className="mt-6 text-3xl font-semibold tracking-tight sm:text-4xl">
                  {t("onb.private_title")}
                </h2>
                <p className="mt-3 max-w-md text-muted">{t("onb.private_body")}</p>
                <div className="mt-6 flex flex-wrap justify-center gap-3 text-sm">
                  <Badge icon={Cpu} text={t("onb.b_local")} />
                  <Badge icon={ShieldCheck} text={t("onb.b_nodata")} />
                  <Badge icon={Sparkles} text={t("onb.b_unlimited")} />
                </div>
              </>
            )}

            {step === 3 && (
              <>
                <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                  {ready ? t("onb.activate_title_ready") : t("onb.activate_title")}
                </h2>
                <p className="mt-3 max-w-md text-muted">
                  {ready ? t("onb.activate_body_ready") : t("onb.activate_body")}
                </p>
                <div className="mt-8 flex w-full justify-center">
                  <ActivatePanel state={state} onActivate={onActivate} />
                </div>
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* nav — centered pair; the row sits at a fixed height thanks to the
          fixed-size stage above, so buttons never drift vertically. The pair
          re-centers once when Back appears after step 0 — by design. */}
      <div className="mt-12 flex items-center justify-center gap-3">
        {step > 0 && (
          <button
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            className="inline-flex items-center gap-1.5 rounded-full border border-border-soft px-5 py-2.5 text-sm text-muted transition hover:text-fg"
          >
            <ArrowLeft className="size-4" />
            {t("onb.back")}
          </button>
        )}

        {step < last ? (
          <button
            onClick={() => setStep((s) => Math.min(last, s + 1))}
            className="group inline-flex min-w-44 items-center justify-center gap-2 rounded-full gradient-primary px-7 py-2.5 font-medium text-white ring-glow transition hover:brightness-110 active:scale-[0.98]"
          >
            {t("onb.continue")}
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </button>
        ) : (
          <button
            onClick={onEnter}
            disabled={!ready}
            className={cn(
              "group inline-flex min-w-44 items-center justify-center gap-2 rounded-full px-7 py-2.5 font-medium transition",
              ready
                ? "gradient-primary text-white ring-glow hover:brightness-110 active:scale-[0.98]"
                : "cursor-not-allowed border border-border-soft text-muted-2",
            )}
          >
            {t("onb.meet")}
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </button>
        )}
      </div>
      </div>
    </section>
  );
}

function Badge({ icon: Icon, text }: { icon: typeof Cpu; text: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border-soft bg-surface/50 px-3.5 py-1.5 text-muted backdrop-blur">
      <Icon className="size-4 text-primary" />
      {text}
    </span>
  );
}
