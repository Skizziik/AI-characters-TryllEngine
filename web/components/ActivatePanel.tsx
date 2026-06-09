"use client";

import { motion } from "motion/react";
import { Download, Loader2, Check, HardDriveDownload, Server } from "lucide-react";
import type { StackState } from "@/lib/types";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/cn";

export function ActivatePanel({
  state,
  onActivate,
  className,
}: {
  state: StackState;
  onActivate: () => void;
  className?: string;
}) {
  const t = useT();
  const busy =
    state.phase === "installing" ||
    state.phase === "downloading" ||
    state.phase === "starting";
  const phaseLabel =
    state.phase === "installing"
      ? t("act.installing")
      : state.phase === "downloading"
        ? t("act.downloading")
        : t("act.starting");

  return (
    <div
      className={cn(
        "w-full max-w-md rounded-2xl glass p-6 text-left",
        className,
      )}
    >
      {state.phase === "ready" ? (
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-full bg-success/15 text-success">
            <Check className="size-5" />
          </span>
          <div>
            <p className="font-medium">{t("act.ready_t")}</p>
            <p className="text-sm text-muted">{t("act.ready_b")}</p>
          </div>
        </div>
      ) : busy ? (
        <div>
          <div className="flex items-center gap-3">
            <Loader2 className="size-5 animate-spin text-primary" />
            <p className="font-medium">{phaseLabel}…</p>
          </div>
          <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-surface-2">
            <motion.div
              className="h-full gradient-primary"
              initial={false}
              animate={{
                width:
                  state.progress != null
                    ? `${Math.round(state.progress * 100)}%`
                    : "40%",
              }}
              transition={{ ease: "linear", duration: 0.2 }}
            />
          </div>
          <p className="mt-2 font-mono text-xs text-muted">
            {state.detail ?? t("act.working")}
          </p>
        </div>
      ) : (
        <div>
          <span className="grid size-11 place-items-center rounded-xl gradient-primary text-white ring-glow">
            <Download className="size-5" />
          </span>
          <h3 className="mt-4 text-lg font-semibold">{t("act.title")}</h3>
          <p className="mt-1.5 text-sm text-muted">{t("act.body")}</p>

          <ul className="mt-4 space-y-2 text-sm text-muted">
            <li className="flex items-center gap-2">
              <HardDriveDownload className="size-4 text-primary" />
              {t("act.b1")}
            </li>
            <li className="flex items-center gap-2">
              <Server className="size-4 text-primary" />
              {t("act.b2")}
            </li>
          </ul>

          {state.phase === "error" && state.error && (
            <p className="mt-4 break-words rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
              {state.error}
            </p>
          )}

          <button
            onClick={onActivate}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl gradient-primary px-5 py-3 font-medium text-white ring-glow transition hover:brightness-110 active:scale-[0.99]"
          >
            <Download className="size-4" />
            {state.phase === "error" ? "Retry" : t("act.button")}
          </button>
        </div>
      )}
    </div>
  );
}
