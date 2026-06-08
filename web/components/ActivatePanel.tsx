"use client";

import { motion } from "motion/react";
import { Download, Loader2, Check, HardDriveDownload, Server } from "lucide-react";
import type { StackState } from "@/lib/types";
import { cn } from "@/lib/cn";

const PHASE_LABEL: Record<string, string> = {
  installing: "Installing Tryll Desktop",
  downloading: "Downloading the model",
  starting: "Starting your local server",
};

export function ActivatePanel({
  state,
  onActivate,
  className,
}: {
  state: StackState;
  onActivate: () => void;
  className?: string;
}) {
  const busy =
    state.phase === "installing" ||
    state.phase === "downloading" ||
    state.phase === "starting";

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
            <p className="font-medium">Your stack is ready</p>
            <p className="text-sm text-muted">Running locally on your machine.</p>
          </div>
        </div>
      ) : busy ? (
        <div>
          <div className="flex items-center gap-3">
            <Loader2 className="size-5 animate-spin text-primary" />
            <p className="font-medium">{PHASE_LABEL[state.phase]}…</p>
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
            {state.detail ?? "Working…"}
          </p>
        </div>
      ) : (
        <div>
          <span className="grid size-11 place-items-center rounded-xl gradient-primary text-white ring-glow">
            <Download className="size-5" />
          </span>
          <h3 className="mt-4 text-lg font-semibold">Activate your AI stack</h3>
          <p className="mt-1.5 text-sm text-muted">
            One-time setup. We install a small helper, download the model
            (~3.8&nbsp;GB), and run everything locally — no account, no cloud.
          </p>

          <ul className="mt-4 space-y-2 text-sm text-muted">
            <li className="flex items-center gap-2">
              <HardDriveDownload className="size-4 text-primary" />
              Model weights stay on your disk
            </li>
            <li className="flex items-center gap-2">
              <Server className="size-4 text-primary" />
              Runs on your GPU, fully offline after setup
            </li>
          </ul>

          <button
            onClick={onActivate}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl gradient-primary px-5 py-3 font-medium text-white ring-glow transition hover:brightness-110 active:scale-[0.99]"
          >
            <Download className="size-4" />
            Activate &amp; download
          </button>
        </div>
      )}
    </div>
  );
}
