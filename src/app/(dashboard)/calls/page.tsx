"use client";

import { useState } from "react";
import { useCallStore } from "@/store/callStore";
import { useVoicePlatformStore } from "@/store/voicePlatformStore";
import { PipelineVisualizer } from "@/components/calls/PipelineVisualizer";
import { TranscriptStream } from "@/components/calls/TranscriptStream";
import { AiAnalysisPanel } from "@/components/calls/AiAnalysisPanel";
import { VoiceWorkflowDiagram } from "@/components/voice/VoiceWorkflowDiagram";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Phone, PhoneOff, Mic } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useSupabaseRealtime } from "@/lib/supabase/hooks";
import { VOICE_PIPELINE_LAST } from "@/lib/voicePipeline";

import { InvestorDemoPanel } from "@/components/voice/InvestorDemoPanel";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function LiveCallMonitorPage() {
  const {
    isSimulating,
    activeCall,
    chatHistory,
    callPipelineStep,
    startSimulation,
    endSimulation,
    setCallPipelineStep,
    addTranscriptLine,
    addChatHistory,
    updateConfidence,
  } = useCallStore();
  const { pushPipelineLog, pushCallEvent, pushEscalation, recordCallHistory, agents } =
    useVoicePlatformStore();
  const [callerInput, setCallerInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  useSupabaseRealtime("live_calls_feed", "*", (payload) => {
    if (payload.new && (payload.new as { transcript_line?: string }).transcript_line) {
      addTranscriptLine({
        id: Date.now().toString(),
        speaker: "Caller",
        text: (payload.new as { transcript_line: string }).transcript_line,
      });
    }
  });

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
    pushCallEvent({
      channel: "phone",
      from: "+8801700000000",
      provider: "twilio_voice",
      state: "ringing",
      assignedAgentId: agents[0]?.id ?? "",
    });
    pushPipelineLog({ callId, step: "Incoming Call", detail: "INVITE received" });
    await runPipeline(0, 2, 280);
    pushPipelineLog({ callId, step: "AI Agent", detail: agents[0]?.name ?? "Default agent" });
    setCallPipelineStep(7);
    const greeting =
      "Hello, welcome to our AI Support. How can I help you today? \n(হ্যালো, আমি কিভাবে আপনাকে সাহায্য করতে পারি?)";
    addChatHistory("model", greeting);
    addTranscriptLine({ id: Date.now().toString(), speaker: "AI", text: greeting });
    pushPipelineLog({ callId, step: "TTS", detail: "Google / ElevenLabs — greeting synthesized" });
    await wait(600);
    setCallPipelineStep(8);
    pushPipelineLog({ callId, step: "Reply to Caller", detail: "Audio leg active" });
    pushCallEvent({
      channel: "phone",
      from: "+8801700000000",
      provider: "twilio_voice",
      state: "answered",
      assignedAgentId: agents[0]?.id ?? "",
    });
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
    pushPipelineLog({ callId, step: "STT", detail: "Streaming transcription chunk" });
    await wait(650);

    let confidence = 85 + Math.floor(Math.random() * 10);
    let intent = "General Inquiry";
    if (userText.toLowerCase().includes("order") || userText.includes("অর্ডার")) intent = "Order Tracking";
    if (userText.toLowerCase().includes("complain") || userText.includes("অভিযোগ")) {
      intent = "Complaint";
      confidence = 45;
    }
    updateConfidence(confidence, intent);
    setCallPipelineStep(4);
    pushPipelineLog({ callId, step: "Intent Detection", detail: intent });
    await wait(600);

    setCallPipelineStep(5);
    pushPipelineLog({ callId, step: "CRM / ERP", detail: "HubSpot + Odoo lookup (mock)" });
    await wait(650);

    setCallPipelineStep(6);
    pushPipelineLog({ callId, step: "Gemini", detail: "Gemini (server: GEMINI_MODEL)" });
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
      pushPipelineLog({ callId, step: "TTS", detail: "Provider: Google / Cartesia (configurable)" });
      addChatHistory("model", aiReply);
      await wait(550);
      addTranscriptLine({ id: Date.now().toString(), speaker: "AI", text: transcriptLine });
      pushPipelineLog({ callId, step: "Reply to Caller", detail: "Downlink audio sent" });

      if (confidence < 60) {
        pushEscalation({ callId, reason: `Low confidence (${confidence}%) — ${intent}` });
      }
    } catch (err) {
      console.error(err);
      addTranscriptLine({
        id: Date.now().toString(),
        speaker: "AI",
        text: "System Error: Connection to AI brain failed.",
      });
    } finally {
      setCallPipelineStep(VOICE_PIPELINE_LAST);
      setIsProcessing(false);
    }
  };

  const handleHangUp = () => {
    if (activeCall) {
      recordCallHistory({
        id: `hist-${Date.now()}`,
        startedAt: new Date(Date.now() - 120_000).toISOString(),
        endedAt: new Date().toISOString(),
        channel: "phone",
        caller: activeCall.phoneNumber,
        durationSec: 120,
        agentName: agents[0]?.name ?? "AI Agent",
        escalation: activeCall.confidenceScore < 60,
        avgConfidence: activeCall.confidenceScore,
        provider: "twilio_voice",
      });
    }
    endSimulation();
  };

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Live Call Monitoring</h1>
          <p className="text-muted-foreground mt-1">
            Simulator wired to Gemini, Supabase Realtime hooks, and the operational voice pipeline.
          </p>
        </div>
        {!isSimulating ? (
          <Button
            onClick={handleSimulateCall}
            className="bg-primary hover:bg-primary/90 text-primary-foreground shrink-0"
          >
            <Phone className="w-4 h-4 mr-2" /> Start simulator call
          </Button>
        ) : (
          <Button onClick={handleHangUp} variant="destructive" className="shrink-0">
            <PhoneOff className="w-4 h-4 mr-2" /> Hang up
          </Button>
        )}
      </div>

      <InvestorDemoPanel />

      <VoiceWorkflowDiagram activeIndex={isSimulating ? callPipelineStep : null} />

      <PipelineVisualizer />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-1 space-y-4 flex flex-col justify-between">
          <Card className="glass flex-1">
            <CardContent className="pt-6 text-center h-full flex flex-col">
              <Avatar className="w-24 h-24 mx-auto mb-4 border-2 border-primary/20 bg-muted">
                <AvatarFallback className="text-2xl">
                  {activeCall ? activeCall.callerName.substring(0, 2) : "—"}
                </AvatarFallback>
              </Avatar>
              <h3 className="font-bold text-lg">{activeCall ? activeCall.callerName : "Waiting…"}</h3>
              <p className="text-muted-foreground text-sm font-medium mb-4">
                {activeCall ? activeCall.phoneNumber : "—"}
              </p>

              {isSimulating && (
                <div className="flex items-center justify-center space-x-2 text-sm text-primary font-bold mt-auto pb-4">
                  <span className="flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-primary opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
                  </span>
                  <span>Media stream active</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2 flex flex-col gap-4">
          <TranscriptStream />
          {isSimulating && (
            <Card className="glass border-primary/30">
              <CardContent className="p-3">
                <form onSubmit={handleSendMessage} className="flex gap-2">
                  <Input
                    placeholder="Type caller utterance (voice simulation)…"
                    value={callerInput}
                    onChange={(e) => setCallerInput(e.target.value)}
                    disabled={isProcessing}
                    autoFocus
                  />
                  <Button type="submit" disabled={isProcessing || !callerInput.trim()}>
                    <Mic className="w-4 h-4 mr-2" /> Speak
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="lg:col-span-1">
          <AiAnalysisPanel />
        </div>
      </div>

      <Card className="glass">
        <CardHeader>
          <CardTitle className="text-base">Investor note</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            Steps 1–2 mirror Twilio, Exotel, Plivo, or Telnyx webhooks. Step 3 binds the assigned AI
            voice agent from routing rules. STT and TTS vendors are selected under Media Stream
            settings. Gemini runs in Next.js API routes with optional Supabase persistence for
            transcripts and dashboards.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
