"use client";

import Link from "next/link";
import { useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useCallStore } from "@/store/callStore";
import { useVoicePlatformStore } from "@/store/voicePlatformStore";
import { Sparkles, Package, CreditCard, Database, BookOpen, AlertTriangle, MessageCircle } from "lucide-react";

const SCENARIOS = [
  {
    id: "order",
    title: "Order status (English)",
    icon: Package,
    callerMsg: "Where is my order 4521?",
    intent: "Order Tracking",
    confidence: 88,
  },
  {
    id: "dealer",
    title: "Dealer payment (Bangla)",
    icon: CreditCard,
    callerMsg: "আমার পেমেন্ট ক্লিয়ার হয়েছে কি ডিলার ১২১২?",
    intent: "Payment Status",
    confidence: 82,
  },
  {
    id: "kb",
    title: "Knowledge base answer",
    icon: BookOpen,
    callerMsg: "What is your return policy for garments?",
    intent: "Policy FAQ",
    confidence: 91,
  },
  {
    id: "crm",
    title: "CRM / ERP lookup",
    icon: Database,
    callerMsg: "Pull my last invoice from Odoo for dealer 3340.",
    intent: "Billing",
    confidence: 76,
  },
  {
    id: "escalate",
    title: "Low confidence → handover",
    icon: AlertTriangle,
    callerMsg: "I want to complain loudly and speak to a human now.",
    intent: "Complaint",
    confidence: 42,
  },
  {
    id: "whatsapp",
    title: "WhatsApp ping",
    icon: MessageCircle,
    callerMsg: "",
    intent: "WhatsApp",
    confidence: 90,
    isWa: true,
  },
];

export function InvestorDemoPanel() {
  const [demoOn, setDemoOn] = useState(false);
  const [running, setRunning] = useState<string | null>(null);
  const { startSimulation, setCallPipelineStep, addTranscriptLine, addChatHistory, updateConfidence } =
    useCallStore();
  const { pushPipelineLog, pushWhatsAppEvent, pushEscalation, pushCallEvent } = useVoicePlatformStore();

  const runScenario = async (s: (typeof SCENARIOS)[0]) => {
    setRunning(s.id);
    if (s.isWa) {
      pushWhatsAppEvent({
        from: "+15559876543",
        bodyPreview: "Hi — checking stock for SKU-992",
        provider: "twilio_whatsapp",
      });
      setRunning(null);
      return;
    }
    startSimulation();
    const callId = `demo-${Date.now()}`;
    pushCallEvent({
      channel: "phone",
      from: "+1 (Investor) Demo",
      provider: "twilio_voice",
      state: "answered",
      assignedAgentId: "agent-support-1",
    });
    for (let i = 0; i <= 3; i++) {
      setCallPipelineStep(i);
      await new Promise((r) => setTimeout(r, 220));
    }
    addTranscriptLine({ id: Date.now().toString(), speaker: "Caller", text: s.callerMsg });
    addChatHistory("user", s.callerMsg);
    updateConfidence(s.confidence, s.intent);
    setCallPipelineStep(4);
    pushPipelineLog({ callId, step: "Intent Detection", detail: s.intent });
    await new Promise((r) => setTimeout(r, 400));
    setCallPipelineStep(5);
    pushPipelineLog({ callId, step: "CRM / ERP", detail: "Mock HubSpot + Odoo read" });
    await new Promise((r) => setTimeout(r, 400));
    setCallPipelineStep(6);
    pushPipelineLog({ callId, step: "Gemini", detail: "Streaming tokens…" });
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: s.callerMsg }],
        }),
      });
      const data = await res.json();
      const reply = data.result ?? "(Demo) AI reply unavailable.";
      setCallPipelineStep(7);
      addChatHistory("model", reply);
      addTranscriptLine({ id: Date.now().toString(), speaker: "AI", text: reply });
      pushPipelineLog({ callId, step: "TTS", detail: "Synthesized voice reply" });
      await new Promise((r) => setTimeout(r, 400));
      setCallPipelineStep(8);
      pushPipelineLog({ callId, step: "Reply to Caller", detail: "Downlink audio" });
      if (s.confidence < 60) {
        pushEscalation({ callId, reason: `Demo escalation — confidence ${s.confidence}%` });
      }
    } catch {
      addTranscriptLine({ id: Date.now().toString(), speaker: "AI", text: "(Demo) Gemini request failed." });
    }
    setRunning(null);
  };

  return (
    <Card className="glass border-primary/25 overflow-hidden">
      <CardHeader className="bg-gradient-to-r from-primary/15 to-transparent border-b border-border/60">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-primary/20 p-2 text-primary">
              <Sparkles className="h-6 w-6" />
            </div>
            <div>
              <CardTitle className="text-lg">Investor demo mode</CardTitle>
              <CardDescription>
                One-click stories for fundraising: pipeline animates, Gemini can answer live, CRM and
                knowledge behaviour is simulated then real where keys exist.
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Demo layer</span>
            <Button
              size="sm"
              variant={demoOn ? "default" : "secondary"}
              onClick={() => setDemoOn(!demoOn)}
            >
              {demoOn ? "Demo on" : "Demo off"}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-6 space-y-6">
        <div className="rounded-xl bg-muted/30 border border-border/80 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-3">Live audio visual</p>
          <div className="flex h-14 items-end justify-center gap-1">
            {[...Array(24)].map((_, i) => (
              <motion.span
                key={i}
                className="w-1.5 rounded-full bg-primary/80"
                animate={{
                  height: demoOn ? [6 + Math.random() * 36, 8 + Math.random() * 28, 6 + Math.random() * 36] : 6,
                }}
                transition={{
                  duration: 0.9 + (i % 5) * 0.08,
                  repeat: demoOn ? Infinity : 0,
                  ease: "easeInOut",
                }}
              />
            ))}
          </div>
          <p className="text-center text-[11px] text-muted-foreground mt-2">
            {demoOn ? "Waveform animates while investors watch the pipeline." : "Turn demo on for motion."}
          </p>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {SCENARIOS.map((s) => {
            const Icon = s.icon;
            const busy = running === s.id;
            return (
              <Button
                key={s.id}
                type="button"
                variant="outline"
                className="h-auto py-3 px-3 flex flex-col items-start gap-1 text-left border-border/80 hover:border-primary/40"
                disabled={busy}
                onClick={() => runScenario(s)}
              >
                <span className="flex items-center gap-2 w-full">
                  <Icon className="h-4 w-4 shrink-0 text-primary" />
                  <span className="font-medium text-sm flex-1">{s.title}</span>
                  {busy && <Badge variant="secondary">Running…</Badge>}
                </span>
                {!s.isWa && (
                  <span className="text-[11px] text-muted-foreground line-clamp-2">{s.callerMsg}</span>
                )}
              </Button>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          Tip for the room: keep{" "}
          <code className="rounded bg-muted px-1">GOOGLE_GEMINI_API_KEY</code> in production env, open{" "}
          <Link href="/settings/monitoring" className="text-primary underline">
            Live health
          </Link>{" "}
          in another tab, and narrate “webhook → agent → STT → CRM → Gemini → TTS”.
        </p>
      </CardContent>
    </Card>
  );
}
