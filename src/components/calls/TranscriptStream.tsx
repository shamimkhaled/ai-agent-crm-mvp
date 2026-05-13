"use client";

import { useEffect, useRef } from "react";
import { useCallStore } from "@/store/callStore";
import type { VoiceTranscriptRow } from "@/hooks/useLiveVoiceDashboard";
import { Card, CardContent } from "@/components/ui/card";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

type Props = {
  mode?: "simulator" | "live";
  liveLines?: VoiceTranscriptRow[];
  liveThinking?: boolean;
};

function mapSpeaker(s: string): "AI" | "Caller" | "System" {
  if (s === "ai") return "AI";
  if (s === "caller") return "Caller";
  return "System";
}

export function TranscriptStream({ mode = "simulator", liveLines = [], liveThinking = false }: Props) {
  const { transcript, isSimulating } = useCallStore();
  const scrollRef = useRef<HTMLDivElement>(null);

  const lines =
    mode === "live"
      ? liveLines.map((r) => ({
          id: r.id,
          speaker: mapSpeaker(r.speaker),
          text: r.body,
        }))
      : transcript.map((t) => ({ id: t.id, speaker: t.speaker as "AI" | "Caller", text: t.text }));

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines, liveThinking]);

  const empty = lines.length === 0;
  const showWaiting = mode === "simulator" && !isSimulating && empty;

  if (showWaiting) {
    return (
      <Card className="glass h-[500px] flex items-center justify-center">
        <p className="text-muted-foreground text-center px-6">
          Simulator idle — start a training call below, or select a live PSTN session from the rail
          when Supabase is configured.
        </p>
      </Card>
    );
  }

  if (mode === "live" && empty && !liveThinking) {
    return (
      <Card className="glass h-[500px] flex items-center justify-center border-dashed">
        <p className="text-muted-foreground text-center px-6">
          No transcript lines yet for this call. Speak on the handset — lines stream here via
          Supabase Realtime.
        </p>
      </Card>
    );
  }

  return (
    <Card className="glass h-[500px] overflow-hidden flex flex-col">
      <div className="bg-muted/30 border-b p-3 flex justify-between items-center">
        <h3 className="font-medium text-sm">Live Transcript</h3>
        {mode === "live" && (
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Supabase</span>
        )}
      </div>
      <CardContent className="flex-1 overflow-y-auto p-4" ref={scrollRef}>
        <div className="space-y-4">
          <AnimatePresence>
            {lines.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  "flex flex-col",
                  msg.speaker === "System" && "items-center",
                  msg.speaker === "AI" && "items-start",
                  msg.speaker === "Caller" && "items-end"
                )}
              >
                <span className="text-[10px] text-muted-foreground mb-1">{msg.speaker}</span>
                <div
                  className={cn(
                    "rounded-2xl max-w-[80%] px-4 py-2",
                    msg.speaker === "System" &&
                      "max-w-[90%] rounded-lg bg-muted/60 text-muted-foreground text-xs border border-border/60 px-3 py-2",
                    msg.speaker === "AI" &&
                      "bg-primary/20 text-foreground rounded-tl-sm border border-primary/30",
                    msg.speaker === "Caller" && "bg-muted text-foreground rounded-tr-sm"
                  )}
                >
                  <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          {liveThinking && (
            <div className="flex items-start">
              <span className="text-[10px] text-muted-foreground mb-1 mr-2 self-center">AI</span>
              <div className="px-4 py-3 rounded-2xl bg-primary/10 border border-primary/20 rounded-tl-sm flex space-x-1">
                <motion.div
                  className="w-1.5 h-1.5 bg-primary rounded-full"
                  animate={{ y: [0, -3, 0] }}
                  transition={{ repeat: Infinity, duration: 0.6, delay: 0 }}
                />
                <motion.div
                  className="w-1.5 h-1.5 bg-primary rounded-full"
                  animate={{ y: [0, -3, 0] }}
                  transition={{ repeat: Infinity, duration: 0.6, delay: 0.2 }}
                />
                <motion.div
                  className="w-1.5 h-1.5 bg-primary rounded-full"
                  animate={{ y: [0, -3, 0] }}
                  transition={{ repeat: Infinity, duration: 0.6, delay: 0.4 }}
                />
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
