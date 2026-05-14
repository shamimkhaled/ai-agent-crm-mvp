"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  PhoneCall, PhoneOff, UserCheck, Mic, MicOff,
  Brain, Database, BookOpen, Radio, Clock,
  Zap, Activity, AlertTriangle,
} from "lucide-react";

export interface CallSession {
  call_sid: string;
  from_e164: string | null;
  to_e164: string | null;
  agent_id: string | null;
  call_status: string | null;
  dashboard_state: string | null;
  pipeline_step_index: number | null;
  ai_confidence: number | null;
  escalation: boolean | null;
  human_takeover: boolean | null;
  intent_label: string | null;
  caller_display_name: string | null;
  started_at: string | null;
  updated_at: string | null;
  speech_input: string | null;
  ai_reply_preview: string | null;
  meta?: Record<string, unknown>;
}

const PIPELINE_STEPS = [
  { id: "STT",    label: "STT",     icon: <Mic size={10} />,        color: "cyan" },
  { id: "INTENT", label: "Intent",  icon: <Brain size={10} />,       color: "violet" },
  { id: "CRM",    label: "RAG",     icon: <Database size={10} />,    color: "amber" },
  { id: "GEMINI", label: "Gemini",  icon: <Zap size={10} />,         color: "emerald" },
  { id: "TTS",    label: "TTS",     icon: <Radio size={10} />,       color: "cyan" },
];

function PipelineBar({ stepIndex }: { stepIndex: number }) {
  return (
    <div className="flex items-center gap-1">
      {PIPELINE_STEPS.map((step, i) => {
        const done    = i < stepIndex;
        const active  = i === stepIndex;
        return (
          <div key={step.id} className="flex items-center gap-1">
            <div className={cn(
              "flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-mono transition-all duration-300",
              done   && "bg-[hsl(var(--emerald))/10] text-[hsl(var(--emerald))] border border-[hsl(var(--emerald))/20]",
              active && "bg-[hsl(var(--cyan))/15] text-[hsl(var(--cyan))] border border-[hsl(var(--cyan))/40] shadow-[0_0_8px_hsl(var(--cyan)/0.2)]",
              !done && !active && "bg-[hsl(var(--surface-2))] text-muted-foreground border border-border",
            )}>
              {active ? (
                <span className="w-2 h-2 rounded-full bg-current animate-pulse" />
              ) : (
                step.icon
              )}
              {step.label}
            </div>
            {i < PIPELINE_STEPS.length - 1 && (
              <div className={cn(
                "w-3 h-px transition-colors",
                done ? "bg-[hsl(var(--emerald))]" : "bg-border"
              )} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function WaveformBars({ active }: { active: boolean }) {
  if (!active) return <div className="flex items-end gap-0.5 h-5 opacity-30">
    {[3, 5, 3, 5, 3].map((h, i) => (
      <div key={i} className="w-0.5 rounded-full bg-muted-foreground" style={{ height: h * 2 }} />
    ))}
  </div>;

  return (
    <div className="flex items-end gap-0.5 h-5">
      {[3, 5, 8, 6, 9, 5, 7, 4, 6, 8].map((h, i) => (
        <div
          key={i}
          className="wave-bar"
          style={{
            height: h * 2,
            animationDelay: `${i * 0.08}s`,
            animationDuration: `${0.5 + (i % 3) * 0.15}s`,
          }}
        />
      ))}
    </div>
  );
}

interface LiveCallPanelProps {
  session: CallSession;
  selected?: boolean;
  onSelect?: () => void;
  onTakeover?: (sid: string) => void;
  transcripts?: { speaker: string; body: string; created_at: string; id: string }[];
}

export function LiveCallPanel({
  session,
  selected = false,
  onSelect,
  onTakeover,
  transcripts = [],
}: LiveCallPanelProps) {
  const isActive    = ["in-progress", "ringing"].includes(session.call_status ?? "");
  const isSpeaking  = session.dashboard_state === "speaking";
  const isThinking  = session.dashboard_state === "thinking";
  const agentName   = (session.meta?.agent_name as string) || session.agent_id || "AI Agent";
  const stepIndex   = Math.min(session.pipeline_step_index ?? 0, PIPELINE_STEPS.length - 1);
  const confidence  = session.ai_confidence;

  const elapsed = session.started_at
    ? Math.floor((Date.now() - new Date(session.started_at).getTime()) / 1000)
    : 0;
  const elapsedStr = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`;

  const stateColor =
    isSpeaking ? "text-[hsl(var(--cyan))]" :
    isThinking ? "text-[hsl(var(--amber))]" :
    isActive   ? "text-[hsl(var(--emerald))]" :
    "text-muted-foreground";

  return (
    <motion.div
      layout
      onClick={onSelect}
      className={cn(
        "rounded-xl border transition-all duration-200 overflow-hidden cursor-pointer",
        selected
          ? "border-[hsl(var(--cyan))/50] bg-[hsl(var(--cyan))/5] shadow-[0_0_16px_hsl(var(--cyan)/0.1)]"
          : "border-border bg-[hsl(var(--surface-1))] hover:border-[hsl(var(--border))] hover:bg-[hsl(var(--surface-2))]"
      )}
    >
      {/* Status bar */}
      {isActive && (
        <div
          className="h-0.5 w-full"
          style={{ background: `linear-gradient(90deg, hsl(var(--cyan)), hsl(var(--violet)), hsl(var(--cyan)))` }}
        />
      )}

      <div className="p-4 space-y-3">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={cn(
              "w-9 h-9 rounded-full flex items-center justify-center shrink-0 border",
              isActive ? "border-[hsl(var(--cyan))/30] bg-[hsl(var(--cyan))/10]" : "border-border bg-[hsl(var(--surface-2))]"
            )}>
              <PhoneCall size={15} className={isActive ? "text-[hsl(var(--cyan))]" : "text-muted-foreground"} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground truncate" style={{ fontFamily: "Syne, sans-serif" }}>
                {session.caller_display_name || session.from_e164 || "Unknown Caller"}
              </p>
              <p className="text-[11px] text-muted-foreground font-mono truncate">{session.from_e164}</p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <div className="flex items-center gap-1.5">
              <span className={cn("status-dot", isActive ? "live" : "idle")} />
              <span className={cn("text-[10px] font-mono capitalize", stateColor)}>
                {session.dashboard_state ?? session.call_status ?? "ended"}
              </span>
            </div>
            <div className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground">
              <Clock size={9} />
              {elapsedStr}
            </div>
          </div>
        </div>

        {/* Agent + waveform */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Brain size={11} className="text-[hsl(var(--violet))]" />
            <span className="text-xs text-muted-foreground font-mono">{agentName}</span>
          </div>
          <WaveformBars active={isSpeaking} />
        </div>

        {/* Pipeline bar */}
        {isActive && (
          <div className="overflow-x-auto">
            <PipelineBar stepIndex={stepIndex} />
          </div>
        )}

        {/* Intent + confidence */}
        {session.intent_label && (
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="text-[10px] font-mono border-border text-muted-foreground">
              {session.intent_label}
            </Badge>
            {confidence !== null && confidence !== undefined && (
              <div className="flex items-center gap-1">
                <div className="h-1.5 w-16 rounded-full bg-[hsl(var(--surface-3))] overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${confidence}%`,
                      background: confidence > 75
                        ? "hsl(var(--emerald))"
                        : confidence > 55
                        ? "hsl(var(--amber))"
                        : "hsl(var(--rose))",
                    }}
                  />
                </div>
                <span className="text-[10px] font-mono text-muted-foreground">{confidence}%</span>
              </div>
            )}
            {session.escalation && (
              <Badge className="text-[10px] font-mono bg-[hsl(var(--rose))/10] text-[hsl(var(--rose))] border-[hsl(var(--rose))/30] gap-1">
                <AlertTriangle size={9} /> escalate
              </Badge>
            )}
            {session.human_takeover && (
              <Badge className="text-[10px] font-mono bg-[hsl(var(--amber))/10] text-[hsl(var(--amber))] border-[hsl(var(--amber))/30] gap-1">
                <UserCheck size={9} /> human
              </Badge>
            )}
          </div>
        )}

        {/* Latest transcript snippet */}
        {session.speech_input && (
          <div className="space-y-1">
            <div className="rounded-lg bg-[hsl(var(--surface-2))] px-3 py-2">
              <p className="text-[10px] text-muted-foreground font-mono mb-0.5">Caller said:</p>
              <p className="text-xs text-foreground line-clamp-2">&ldquo;{session.speech_input}&rdquo;</p>
            </div>
            {session.ai_reply_preview && (
              <div className="rounded-lg bg-[hsl(var(--cyan))/5] border border-[hsl(var(--cyan))/15] px-3 py-2">
                <p className="text-[10px] text-[hsl(var(--cyan))] font-mono mb-0.5">AI replied:</p>
                <p className="text-xs text-foreground line-clamp-2">&ldquo;{session.ai_reply_preview}&rdquo;</p>
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        {isActive && (
          <div className="flex items-center gap-2 pt-1">
            {!session.human_takeover && (
              <Button
                size="sm"
                className="flex-1 text-xs bg-[hsl(var(--amber))/10] text-[hsl(var(--amber))] hover:bg-[hsl(var(--amber))/20] border border-[hsl(var(--amber))/30] gap-1.5 h-7"
                onClick={(e) => { e.stopPropagation(); onTakeover?.(session.call_sid); }}
              >
                <UserCheck size={11} /> Take Over
              </Button>
            )}
            {session.human_takeover && (
              <Badge className="flex-1 justify-center text-xs bg-[hsl(var(--amber))/10] text-[hsl(var(--amber))] border-[hsl(var(--amber))/30] h-7">
                Human in control
              </Badge>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}
