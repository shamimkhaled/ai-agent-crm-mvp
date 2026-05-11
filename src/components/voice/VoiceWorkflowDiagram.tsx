"use client";

import { motion } from "framer-motion";
import { VOICE_PIPELINE_STEPS } from "@/lib/voicePipeline";
import { cn } from "@/lib/utils";

type Props = {
  activeIndex?: number | null;
  className?: string;
};

export function VoiceWorkflowDiagram({ activeIndex, className }: Props) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-gradient-to-br from-muted/40 to-background p-4 sm:p-6 overflow-x-auto",
        className
      )}
    >
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">
        Real-time voice workflow
      </p>
      <div className="flex min-w-[900px] items-stretch gap-0">
        {VOICE_PIPELINE_STEPS.map((label, i) => {
          const active = activeIndex === i;
          const past = activeIndex != null && activeIndex > i;
          return (
            <div key={label} className="flex flex-1 items-center">
              <motion.div
                layout
                className={cn(
                  "flex-1 rounded-lg border px-2 py-3 text-center shadow-sm",
                  active && "border-primary ring-2 ring-primary/30 bg-primary/10",
                  past && !active && "border-primary/40 bg-primary/5",
                  !past && !active && "border-border bg-card/60"
                )}
                initial={false}
                animate={{ scale: active ? 1.02 : 1 }}
                transition={{ type: "spring", stiffness: 400, damping: 28 }}
              >
                <div className="text-[10px] font-mono text-muted-foreground mb-1">Step {i + 1}</div>
                <div className="text-xs sm:text-sm font-semibold leading-tight">{label}</div>
              </motion.div>
              {i < VOICE_PIPELINE_STEPS.length - 1 && (
                <div className="w-3 shrink-0 flex items-center justify-center text-muted-foreground">
                  <span className="text-lg">→</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
