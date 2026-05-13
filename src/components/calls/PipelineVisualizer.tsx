"use client";

import { useCallStore } from "@/store/callStore";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { VOICE_PIPELINE_STEPS } from "@/lib/voicePipeline";

type Props = {
  mode?: "simulator" | "live";
  /** When `mode` is `live`, drive steps from Supabase `pipeline_step_index`. */
  liveStepIndex?: number | null;
  liveActive?: boolean;
};

export function PipelineVisualizer({ mode = "simulator", liveStepIndex, liveActive }: Props) {
  const simStep = useCallStore((s) => s.callPipelineStep);
  const simOn = useCallStore((s) => s.isSimulating);

  const step =
    mode === "live" && liveStepIndex !== undefined && liveStepIndex !== null
      ? liveStepIndex
      : simOn
        ? simStep
        : -1;

  const isOn = mode === "live" ? Boolean(liveActive) : simOn;

  return (
    <div className="w-full bg-muted/20 border border-border rounded-xl p-4 flex items-center justify-between mb-6 overflow-x-auto shadow-sm">
      {VOICE_PIPELINE_STEPS.map((label, index) => {
        const isActive = isOn && step === index;
        const isPast = isOn && step > index;

        return (
          <div key={label} className="flex items-center min-w-[max-content] flex-1">
            <div className="flex flex-col items-center max-w-[100px] sm:max-w-none">
              <div
                className={cn(
                  "w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-xs sm:text-sm font-bold transition-all duration-300 shrink-0",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-[0_0_15px_rgba(45,212,191,0.5)] scale-110"
                    : isPast
                      ? "bg-primary/20 text-primary border border-primary/50"
                      : "bg-muted text-muted-foreground border border-border"
                )}
              >
                {index + 1}
              </div>
              <span
                className={cn(
                  "text-[10px] sm:text-xs mt-2 font-medium text-center leading-tight px-0.5 transition-colors duration-300",
                  isActive ? "text-primary" : "text-muted-foreground"
                )}
              >
                {label}
              </span>
            </div>
            {index < VOICE_PIPELINE_STEPS.length - 1 && (
              <div className="flex-1 h-1 mx-1 sm:mx-2 rounded-full overflow-hidden bg-muted min-w-[8px]">
                <motion.div
                  className="h-full bg-primary"
                  initial={{ width: "0%" }}
                  animate={{
                    width: isPast ? "100%" : "0%",
                  }}
                  transition={{ duration: 0.5 }}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
