"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

type Props = {
  active: boolean;
  label?: string;
  className?: string;
};

/** Decorative waveform — PSTN audio is on Twilio; this mirrors “live energy” in the ops UI. */
export function LiveVoiceWaveform({ active, label = "Live audio", className }: Props) {
  const bars = 14;
  return (
    <div
      className={cn(
        "rounded-xl border border-border/80 bg-gradient-to-b from-muted/40 to-muted/10 p-4",
        className
      )}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        {active ? (
          <span className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            Live
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">Idle</span>
        )}
      </div>
      <div className="flex h-14 items-end justify-center gap-1">
        {Array.from({ length: bars }).map((_, i) => (
          <motion.div
            key={i}
            className="w-1.5 rounded-full bg-primary/70"
            initial={{ height: 6 }}
            animate={{
              height: active ? [10, 28 + (i % 5) * 8, 12, 22 + (i % 3) * 10, 10] : 6,
              opacity: active ? [0.5, 1, 0.6, 1, 0.5] : 0.35,
            }}
            transition={{
              duration: 1.1 + i * 0.04,
              repeat: active ? Infinity : 0,
              ease: "easeInOut",
            }}
          />
        ))}
      </div>
    </div>
  );
}
