"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCallStore } from "@/store/callStore";
import { useVoicePlatformStore } from "@/store/voicePlatformStore";
import { useLiveVoiceDashboard } from "@/hooks/useLiveVoiceDashboard";
import { useEscalationFeed } from "@/hooks/useEscalationFeed";
import { useCallStats } from "@/hooks/useCallStats";
import { PipelineVisualizer } from "@/components/calls/PipelineVisualizer";
import { TranscriptStream } from "@/components/calls/TranscriptStream";
import { AiAnalysisPanel } from "@/components/calls/AiAnalysisPanel";
import { LiveVoiceWaveform } from "@/components/calls/LiveVoiceWaveform";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Phone, PhoneOff, Mic, Radio, User, AlertTriangle, CheckCircle2,
  PhoneIncoming, TrendingUp, Zap, Clock, Activity, RefreshCw,
  ChevronRight, Volume2, Brain, Database,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { VOICE_PIPELINE_LAST } from "@/lib/voicePipeline";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function formatDuration(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function relativeTime(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function StatCard({
  label, value, sub, icon: Icon, color = "text-primary", pulse = false,
}: {
  label: string; value: string | number; sub?: string;
  icon: React.ElementType; color?: string; pulse?: boolean;
}) {
  return (
    <Card className="glass border-border/60">
      <CardContent className="p-4 flex items-center gap-3">
        <div className={cn("p-2 rounded-lg bg-primary/10", pulse && "relative")}>
          {pulse && (
            <span className="absolute top-1 right-1 flex h-2 w-2">
              <span className="animate-ping absolute h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative rounded-full h-2 w-2 bg-emerald-500" />
            </span>
          )}
          <Icon className={cn("h-5 w-5", color)} />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide">{label}</p>
          <p className="text-2xl font-bold tabular-nums leading-none">{value}</p>
          {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

export default function LiveCallMonitorPage() {
  const {
    isSimulating, activeCall, chatHistory, callPipelineStep,
    startSimulation, endSimulation, setCallPipelineStep,
    addTranscriptLine, addChatHistory, updateConfidence,
  } = useCallStore();
  const { pushPipelineLog, pushCallEvent, pushEscalation, recordCallHistory, agents } =
    useVoicePlatformStore();
  const { toast } = useToast();
  const [callerInput, setCallerInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  const live = useLiveVoiceDashboard();
  const esc = useEscalationFeed();
  const { stats, loading: statsLoading, refresh: refreshStats } = useCallStats();
  const [tick, setTick] = useState(0);

  // Track previous session IDs to detect new incoming calls
  const prevSessionsRef = useRef<Record<string, true>>({});
  useEffect(() => {
    const next: Record<string, true> = {};
    for (const s of live.sessions) {
      next[s.call_sid] = true;
      if (!prevSessionsRef.current[s.call_sid]) {
        toast({
          title: "📞 Incoming call",
          description: `${s.caller_display_name || s.from_e164 || "Unknown"} → ${s.to_e164 ?? "your number"}`,
        });
      }
    }
    prevSessionsRef.current = next;
  }, [live.sessions, toast]);

  // Live call duration ticker
  useEffect(() => {
    if (!live.selectedSession?.started_at || live.selectedSession.ended_at) return;
    const t = window.setInterval(() => setTick((x) => x + 1), 1000);
    return () => window.clearInterval(t);
  }, [live.selectedSession?.started_at, live.selectedSession?.ended_at]);

  const liveElapsedSec = useMemo(() => {
    if (!live.selectedSession?.started_at) return 0;
    const start = new Date(live.selectedSession.started_at).getTime();
    const end = live.selectedSession.ended_at
      ? new Date(live.selectedSession.ended_at).getTime()
      : Date.now();
    return Math.max(0, Math.floor((end - start) / 1000));
  }, [live.selectedSession?.started_at, live.selectedSession?.ended_at, tick]);

  const liveThinking = live.selectedSession?.dashboard_state === "thinking";
  const liveSpeaking = live.selectedSession?.dashboard_state === "speaking";
  const liveActive = Boolean(live.selectedSession && !live.selectedSession.ended_at);

  // --- Simulator helpers ---
  const runPipeline = async (from: number, to: number, delayMs = 320) => {
    for (let s = from; s <= to; s++) {
      setCallPipelineStep(s);
      await wait(delayMs);
    }
  };

  const handleSimulateCall = async () => {
    startSimulation();
    setCallPipelineStep(0);
    const callId = `sim-${Date.now()}`;
    pushCallEvent({ channel: "phone", from: "+8801700000000", provider: "twilio_voice", state: "ringing", assignedAgentId: agents[0]?.id ?? "" });
    pushPipelineLog({ callId, step: "Incoming Call", detail: "INVITE received" });
    await runPipeline(0, 2, 280);
    pushPipelineLog({ callId, step: "AI Agent", detail: agents[0]?.name ?? "Default agent" });
    setCallPipelineStep(7);
    const greeting = "Hello, welcome to our AI Support. How can I help you today? (হ্যালো, আমি কিভাবে আপনাকে সাহায্য করতে পারি?)";
    addChatHistory("model", greeting);
    addTranscriptLine({ id: Date.now().toString(), speaker: "AI", text: greeting });
    pushPipelineLog({ callId, step: "TTS", detail: "Polly.Matthew — greeting" });
    await wait(600);
    setCallPipelineStep(8);
    pushPipelineLog({ callId, step: "Reply to Caller", detail: "Audio leg active" });
    pushCallEvent({ channel: "phone", from: "+8801700000000", provider: "twilio_voice", state: "answered", assignedAgentId: agents[0]?.id ?? "" });
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!callerInput.trim() || isProcessing) return;
    const userText = callerInput;
    setCallerInput("");
    setIsProcessing(true);
    const callId = `sim-${Date.now()}`;
    addTranscriptLine({ id: Date.now().toString(), speaker: "Caller", text: userText });
    addChatHistory("user", userText);
    setCallPipelineStep(3);
    pushPipelineLog({ callId, step: "STT", detail: "Streaming chunk" });
    await wait(650);
    let confidence = 85 + Math.floor(Math.random() * 10);
    let intent = "General Inquiry";
    if (/order|অর্ডার/i.test(userText)) intent = "Order Tracking";
    if (/complain|অভিযোগ/i.test(userText)) { intent = "Complaint"; confidence = 45; }
    updateConfidence(confidence, intent);
    setCallPipelineStep(4);
    pushPipelineLog({ callId, step: "Intent Detection", detail: intent });
    await wait(600);
    setCallPipelineStep(5);
    pushPipelineLog({ callId, step: "CRM / ERP", detail: "KB search + CRM lookup" });
    await wait(650);
    setCallPipelineStep(6);
    pushPipelineLog({ callId, step: "Gemini", detail: "LLM generating response" });
    try {
      const payloadMessages = [...chatHistory, { role: "user", content: userText }];
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: payloadMessages }),
      });
      const data = await response.json();
      const aiReply = data.result || "Sorry, I am facing an error right now.";
      const transcriptLine = data.geminiError ? `${aiReply}\n\n[Debug: ${data.geminiError}]` : aiReply;
      setCallPipelineStep(7);
      pushPipelineLog({ callId, step: "TTS", detail: "Polly.Matthew synthesis" });
      addChatHistory("model", aiReply);
      await wait(550);
      addTranscriptLine({ id: Date.now().toString(), speaker: "AI", text: transcriptLine });
      pushPipelineLog({ callId, step: "Reply to Caller", detail: "Downlink audio sent" });
      if (confidence < 60) {
        pushEscalation({ callId, reason: `Low confidence (${confidence}%) — ${intent}` });
      }
    } catch (err) {
      console.error(err);
      addTranscriptLine({ id: Date.now().toString(), speaker: "AI", text: "System Error: Connection to AI brain failed." });
    } finally {
      setCallPipelineStep(VOICE_PIPELINE_LAST);
      setIsProcessing(false);
    }
  };

  const handleHangUp = () => {
    if (activeCall) {
      recordCallHistory({
        id: `hist-${Date.now()}`, startedAt: new Date(Date.now() - 120_000).toISOString(),
        endedAt: new Date().toISOString(), channel: "phone", caller: activeCall.phoneNumber,
        durationSec: 120, agentName: agents[0]?.name ?? "AI Agent",
        escalation: activeCall.confidenceScore < 60, avgConfidence: activeCall.confidenceScore,
        provider: "twilio_voice",
      });
    }
    endSimulation();
  };

  const handleTakeover = useCallback(async () => {
    if (!live.selectedSid) return;
    try {
      const res = await fetch(`/api/voice/sessions/${encodeURIComponent(live.selectedSid)}/takeover`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      toast({ title: "Human takeover activated", description: "AI paused. Next caller speech will hear hold message." });
      void live.reloadSessions();
    } catch (e) {
      toast({ title: "Takeover failed", description: e instanceof Error ? e.message : "Request error", variant: "destructive" });
    }
  }, [live, toast]);

  const dashboardStateBadge = (state: string | null) => {
    const map: Record<string, string> = {
      ringing: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
      thinking: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30",
      speaking: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
      idle: "bg-muted text-muted-foreground border-border",
      ended: "bg-muted/50 text-muted-foreground/60 border-border/40",
    };
    return map[state ?? "idle"] ?? map.idle;
  };

  return (
    <div className="space-y-5 pb-12">

      {/* ═══ Page header ═══════════════════════════════════════════════════ */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" style={{ fontFamily: "Syne, sans-serif" }}>
            {live.sessions.length > 0 && (
              <span className="status-dot live" />
            )}
            Live Call Monitor
          </h1>
          <p className="text-muted-foreground text-sm mt-1 max-w-2xl">
            Real calls via Twilio → Gemini AI → Supabase Realtime → this dashboard.
            Every turn is transcribed live.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant={live.supabaseConfigured ? "default" : "secondary"} className="gap-1.5">
            <Radio className="h-3 w-3" />
            {live.supabaseConfigured ? "Realtime connected" : "Add Supabase env vars"}
          </Badge>
          <Badge variant="outline" className="gap-1.5 font-mono text-[10px]">
            {process.env.NEXT_PUBLIC_SUPABASE_URL ? "ngrok active" : "No webhook URL"}
          </Badge>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { void live.reloadSessions(); void live.reloadRecentSessions(); void refreshStats(); }} title="Refresh">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Supabase connection error */}
      {live.supabaseConfigured && live.connectionError && (
        <div role="alert" className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
          <p className="font-semibold">⚠ Supabase Realtime unreachable</p>
          <p className="mt-1 font-mono text-xs opacity-80">{live.connectionError}</p>
          <p className="mt-1 text-xs text-muted-foreground">Check VPN/DNS. Try NODE_OPTIONS=--dns-result-order=ipv4first if IPv6 is broken.</p>
        </div>
      )}

      {/* ═══ Stats bar ══════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label="Active calls"
          value={statsLoading ? "—" : stats.activeCalls}
          sub="right now"
          icon={PhoneIncoming}
          color={stats.activeCalls > 0 ? "text-emerald-500" : "text-muted-foreground"}
          pulse={stats.activeCalls > 0}
        />
        <StatCard
          label="Today's calls"
          value={statsLoading ? "—" : stats.todayTotal}
          sub="since midnight Dhaka"
          icon={TrendingUp}
        />
        <StatCard
          label="Avg confidence"
          value={statsLoading || stats.avgConfidence == null ? "—" : `${stats.avgConfidence}%`}
          sub="today"
          icon={Brain}
          color={stats.avgConfidence != null && stats.avgConfidence < 60 ? "text-destructive" : "text-primary"}
        />
        <StatCard
          label="Open escalations"
          value={statsLoading ? "—" : stats.openEscalations}
          sub="need human review"
          icon={AlertTriangle}
          color={stats.openEscalations > 0 ? "text-amber-500" : "text-muted-foreground"}
        />
      </div>

      {/* ═══ Main operational grid ═════════════════════════════════════════ */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">

        {/* LEFT — Active + recent calls */}
        <div className="xl:col-span-3 flex flex-col gap-3 min-h-0">
        <Card className="glass flex flex-col border-border/60 min-h-0">
          <CardHeader className="pb-2 shrink-0">
            <CardTitle className="text-sm flex items-center gap-2">
              <Phone className="h-4 w-4 text-primary" />
              Active live calls
              {live.sessions.length > 0 && (
                <Badge className="ml-auto bg-emerald-500 text-white text-xs px-1.5 py-0">{live.sessions.length}</Badge>
              )}
            </CardTitle>
            <CardDescription className="text-[11px]">Rows where ended_at IS NULL — Realtime subscribed</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto space-y-2 pr-1 pb-3" style={{ maxHeight: 560 }}>
            {!live.supabaseConfigured && (
              <p className="text-xs text-muted-foreground p-2">
                Configure NEXT_PUBLIC_SUPABASE_URL + run voice SQL scripts.
              </p>
            )}
            {live.supabaseConfigured && live.sessions.length === 0 && !live.connectionError && (
              <div className="flex flex-col items-center justify-center py-10 text-center gap-2">
                <Phone className="h-8 w-8 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">No active calls</p>
                <p className="text-xs text-muted-foreground/60">Dial your Twilio number to start</p>
              </div>
            )}
            <AnimatePresence>
              {live.sessions.map((s) => (
                <motion.button
                  key={s.call_sid}
                  type="button"
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -8 }}
                  whileHover={{ scale: 1.01 }}
                  onClick={() => live.setSelectedSid(s.call_sid)}
                  className={cn(
                    "w-full text-left rounded-xl border p-3 transition-all",
                    live.selectedSid === s.call_sid
                      ? "border-primary bg-primary/10 shadow-sm"
                      : "border-border bg-background/40 hover:bg-muted/30"
                  )}
                >
                  <div className="flex items-start gap-2">
                    <Avatar className="h-8 w-8 shrink-0 border border-border/60">
                      <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                        {(s.caller_display_name ?? s.from_e164 ?? "CA").slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <p className="font-semibold text-sm truncate">{s.caller_display_name || "Customer"}</p>
                        {s.escalation && <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />}
                      </div>
                      <p className="font-mono text-[11px] text-muted-foreground">{s.from_e164}</p>
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full border font-medium", dashboardStateBadge(s.dashboard_state))}>
                          {s.dashboard_state === "thinking" ? "🧠 thinking" :
                           s.dashboard_state === "speaking" ? "🔊 speaking" :
                           s.dashboard_state === "ringing" ? "📞 ringing" :
                           s.dashboard_state ?? "idle"}
                        </span>
                        {s.human_takeover && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-destructive/15 text-destructive border border-destructive/30 font-medium">
                            👤 takeover
                          </span>
                        )}
                      </div>
                    </div>
                    <ChevronRight className={cn("h-4 w-4 shrink-0 transition-colors mt-1", live.selectedSid === s.call_sid ? "text-primary" : "text-muted-foreground/40")} />
                  </div>
                  {s.intent_label && (
                    <div className="mt-2 pt-2 border-t border-border/40 flex items-center gap-1.5">
                      <Zap className="h-3 w-3 text-primary shrink-0" />
                      <p className="text-[11px] text-muted-foreground truncate">{s.intent_label}</p>
                      {s.ai_confidence != null && (
                        <span className={cn("ml-auto text-[10px] font-mono shrink-0 font-bold", s.ai_confidence < 60 ? "text-destructive" : "text-emerald-500")}>
                          {s.ai_confidence}%
                        </span>
                      )}
                    </div>
                  )}
                </motion.button>
              ))}
            </AnimatePresence>
          </CardContent>
        </Card>

        <Card className="glass flex flex-col border-border/60 border-dashed">
          <CardHeader className="pb-2 shrink-0 py-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <PhoneOff className="h-4 w-4 text-muted-foreground" />
              Recent ended (72h)
              {live.recentSessions.length > 0 && (
                <Badge variant="outline" className="ml-auto text-[10px] px-1.5 py-0 font-mono">
                  {live.recentSessions.length}
                </Badge>
              )}
            </CardTitle>
            <CardDescription className="text-[11px]">
              Includes Twilio <span className="font-medium">failed</span> / completed — tap to inspect transcripts
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto space-y-1.5 pr-1 pb-3 max-h-[280px]">
            {live.supabaseConfigured && live.recentSessions.length === 0 && (
              <p className="text-xs text-muted-foreground px-2 py-4 text-center">No ended calls in this window.</p>
            )}
            {live.recentSessions.map((s) => (
              <button
                key={s.call_sid}
                type="button"
                onClick={() => live.setSelectedSid(s.call_sid)}
                className={cn(
                  "w-full text-left rounded-lg border px-2.5 py-2 text-xs transition-colors",
                  live.selectedSid === s.call_sid
                    ? "border-primary bg-primary/10"
                    : "border-border/60 bg-background/30 hover:bg-muted/25"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[10px] text-muted-foreground truncate">{s.call_sid}</span>
                  <span
                    className={cn(
                      "shrink-0 text-[10px] px-1.5 py-0.5 rounded font-medium capitalize",
                      (s.call_status || "").toLowerCase() === "failed"
                        ? "bg-destructive/15 text-destructive"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    {s.call_status ?? "—"}
                  </span>
                </div>
                <p className="font-mono text-[11px] mt-0.5 truncate">{s.from_e164 ?? "—"}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{relativeTime(s.started_at)}</p>
              </button>
            ))}
          </CardContent>
        </Card>
        </div>

        {/* CENTER — Pipeline + Waveform + Transcript */}
        <div className="xl:col-span-6 space-y-3">
          <PipelineVisualizer
            mode={live.selectedSid ? "live" : "simulator"}
            liveStepIndex={live.selectedSession?.pipeline_step_index ?? null}
            liveActive={liveActive}
          />

          {/* Live waveform */}
          <LiveVoiceWaveform
            active={liveActive && (liveSpeaking || liveThinking)}
            label={liveSpeaking ? "AI speaking to caller" : liveThinking ? "AI thinking…" : "Carrier audio (Twilio)"}
          />

          {/* Transcript */}
          <TranscriptStream
            mode={live.selectedSid ? "live" : "simulator"}
            liveLines={live.transcripts}
            liveThinking={Boolean(live.selectedSid && liveThinking)}
          />

          {/* Simulator input */}
          {isSimulating && (
            <Card className="glass border-primary/30">
              <CardContent className="p-3">
                <form onSubmit={handleSendMessage} className="flex gap-2">
                  <Input
                    placeholder="Type caller utterance (simulator)…"
                    value={callerInput}
                    onChange={(e) => setCallerInput(e.target.value)}
                    disabled={isProcessing}
                    className="font-mono text-sm"
                  />
                  <Button type="submit" disabled={isProcessing || !callerInput.trim()}>
                    {isProcessing ? (
                      <Activity className="w-4 h-4 mr-2 animate-pulse" />
                    ) : (
                      <Mic className="w-4 h-4 mr-2" />
                    )}
                    Send
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}
        </div>

        {/* RIGHT — Call detail + AI panel + Escalations */}
        <div className="xl:col-span-3 space-y-3">

          {/* Call detail card */}
          <Card className="glass border-border/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Volume2 className="h-4 w-4" /> Call detail
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {live.selectedSession ? (
                <>
                  <div className="flex justify-center">
                    <div className="relative">
                      <Avatar className="w-16 h-16 border-2 border-primary/40">
                        <AvatarFallback className="text-lg bg-primary/10 text-primary">
                          {(live.selectedSession.caller_display_name || "CA").slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      {liveActive && (
                        <span className="absolute bottom-0 right-0 flex h-3 w-3">
                          <span className="animate-ping absolute h-full w-full rounded-full bg-emerald-400 opacity-75" />
                          <span className="relative rounded-full h-3 w-3 bg-emerald-500 border-2 border-background" />
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-center">
                    <p className="font-bold">{live.selectedSession.caller_display_name || "Customer"}</p>
                    <p className="text-xs font-mono text-muted-foreground">{live.selectedSession.from_e164}</p>
                    <p className="text-[11px] text-muted-foreground">→ {live.selectedSession.to_e164}</p>
                  </div>

                  <div className="bg-muted/40 rounded-lg p-3 text-center">
                    <p className="text-[10px] uppercase text-muted-foreground mb-1 flex items-center justify-center gap-1">
                      <Clock className="h-3 w-3" /> Duration
                    </p>
                    <p className="text-2xl font-mono font-bold tabular-nums">{formatDuration(liveElapsedSec)}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-1.5 text-xs">
                    <div className="rounded-lg border p-2 bg-background/40">
                      <p className="text-muted-foreground text-[10px] mb-0.5">Intent</p>
                      <p className="font-semibold truncate">{live.selectedSession.intent_label || "—"}</p>
                    </div>
                    <div className="rounded-lg border p-2 bg-background/40">
                      <p className="text-muted-foreground text-[10px] mb-0.5">Confidence</p>
                      <p className={cn("font-bold", (live.selectedSession.ai_confidence ?? 100) < 60 ? "text-destructive" : "text-emerald-500")}>
                        {live.selectedSession.ai_confidence != null ? `${live.selectedSession.ai_confidence}%` : "—"}
                      </p>
                    </div>
                    <div className="rounded-lg border p-2 bg-background/40 col-span-2">
                      <p className="text-muted-foreground text-[10px] mb-0.5">Agent</p>
                      <p className="font-mono text-[11px] truncate">{live.selectedSession.agent_id || "—"}</p>
                    </div>
                  </div>

                  {live.selectedSession.ai_confidence != null && (
                    <div>
                      <Progress value={live.selectedSession.ai_confidence} className="h-1.5" />
                    </div>
                  )}

                  <Button
                    type="button"
                    variant={live.selectedSession.human_takeover ? "secondary" : "destructive"}
                    className="w-full text-xs"
                    onClick={handleTakeover}
                    disabled={live.selectedSession.human_takeover === true}
                  >
                    <User className="h-3.5 w-3.5 mr-1.5" />
                    {live.selectedSession.human_takeover ? "Takeover active" : "Human takeover"}
                  </Button>
                </>
              ) : isSimulating && activeCall ? (
                <>
                  <div className="text-center space-y-2">
                    <Avatar className="w-16 h-16 mx-auto border-2 border-primary/40">
                      <AvatarFallback className="bg-primary/10 text-primary">{activeCall.callerName.slice(0, 2)}</AvatarFallback>
                    </Avatar>
                    <p className="font-bold">{activeCall.callerName}</p>
                    <p className="font-mono text-xs text-muted-foreground">{activeCall.phoneNumber}</p>
                  </div>
                  <div className="bg-muted/40 rounded-lg p-3 text-center">
                    <p className="text-2xl font-mono font-bold">{formatDuration(Math.floor(activeCall.duration))}</p>
                  </div>
                  <Progress value={activeCall.confidenceScore} className="h-1.5" />
                  <p className="text-xs text-center text-muted-foreground">
                    {activeCall.confidenceScore}% confidence · {activeCall.intent}
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-6">
                  Select an active call or start the simulator.
                </p>
              )}
            </CardContent>
          </Card>

          {/* AI Analysis panel */}
          <AiAnalysisPanel mode={live.selectedSession ? "live" : "simulator"} liveSession={live.selectedSession} />

          {/* Escalation queue */}
          <Card className={cn("glass border-border/60", esc.openCount > 0 && "border-amber-500/40 bg-amber-500/5")}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <AlertTriangle className={cn("h-4 w-4", esc.openCount > 0 ? "text-amber-500" : "text-muted-foreground")} />
                Escalation queue
                {esc.openCount > 0 && (
                  <Badge className="ml-auto bg-amber-500 text-white text-xs">{esc.openCount}</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 max-h-64 overflow-y-auto">
              {!esc.configured && (
                <p className="text-xs text-muted-foreground">Configure Supabase to see live escalations.</p>
              )}
              {esc.configured && esc.escalations.length === 0 && (
                <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400 py-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0" /> No open escalations
                </div>
              )}
              <AnimatePresence>
                {esc.escalations.map((e) => (
                  <motion.div
                    key={e.id}
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 space-y-1.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-mono text-[10px] text-muted-foreground truncate">{e.call_sid ?? "—"}</p>
                        <p className="text-xs font-medium line-clamp-2 mt-0.5">{e.reason}</p>
                        <p className="text-[10px] text-muted-foreground mt-1">{relativeTime(e.created_at)}</p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full h-6 text-xs border-amber-500/40 hover:bg-amber-500/20"
                      onClick={() => void esc.resolveEscalation(e.id)}
                    >
                      Mark resolved
                    </Button>
                  </motion.div>
                ))}
              </AnimatePresence>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ═══ Simulator / Training section ══════════════════════════════════ */}
      <Card className="glass border-dashed border-border/60">
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Brain className="h-4 w-4 text-primary" /> Training simulator
          </CardTitle>
          <CardDescription className="text-xs">
            Uses the real Gemini stack — no Twilio needed. Type caller speech and watch the pipeline execute live.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {!isSimulating ? (
            <Button onClick={handleSimulateCall} className="gap-2">
              <Phone className="w-4 h-4" /> Start simulator call
            </Button>
          ) : (
            <Button onClick={handleHangUp} variant="destructive" className="gap-2">
              <PhoneOff className="w-4 h-4" /> Hang up simulator
            </Button>
          )}
        </CardContent>
      </Card>

      {/* ═══ Architecture note ══════════════════════════════════════════════ */}
      <Card className="glass border-border/40">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Database className="h-4 w-4" /> Live call architecture
          </CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-lg border p-3 space-y-1 bg-background/30">
              <p className="font-semibold text-foreground">1 · Twilio leg</p>
              <p>Customer calls your Twilio number → Twilio POSTs to <code className="text-primary">/api/webhooks/voice/inbound</code> → TwiML <code>&lt;Gather&gt;</code> waits for speech.</p>
            </div>
            <div className="rounded-lg border p-3 space-y-1 bg-background/30">
              <p className="font-semibold text-foreground">2 · AI pipeline</p>
              <p>SpeechResult POSTs to <code className="text-primary">/gather</code> → history + KB search + CRM context → Gemini → TTS via <code>&lt;Say&gt;</code>.</p>
            </div>
            <div className="rounded-lg border p-3 space-y-1 bg-background/30">
              <p className="font-semibold text-foreground">3 · Realtime browser</p>
              <p>Every step writes to Supabase. This page subscribes via Realtime WebSocket → transcript, pipeline step, confidence, and escalations update in &lt;1s.</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
