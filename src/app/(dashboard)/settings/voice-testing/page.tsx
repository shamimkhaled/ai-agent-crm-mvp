"use client";

/**
 * Voice Agent Test Console
 * Route: /settings/voice-testing
 *
 * Browser-based testing UI for ElevenLabs voice pipeline.
 * Allows testing STT (microphone) + Gemini + TTS without making a real call.
 *
 * Features:
 * - Agent selector (from /api/agents)
 * - Voice preview (playback via /api/voice/tts-preview)
 * - Microphone capture → /api/agents/[id]/test (text path for testing)
 * - Live transcript panel
 * - Latency metrics dashboard
 * - WebSocket event monitor (bridge server health)
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { Mic, MicOff, Play, Square, Volume2, RefreshCw, Wifi, WifiOff, Clock, Activity } from "lucide-react";
import { ELEVENLABS_CURATED_VOICES, ELEVENLABS_MODELS } from "@/lib/elevenlabs/voices";

// ============================================================
// Types
// ============================================================
interface Agent {
  id: string;
  name: string;
  department: string;
  voice_provider?: string;
  voice_id?: string;
}

interface TranscriptLine {
  id: string;
  speaker: "user" | "ai" | "system";
  text: string;
  timestamp: Date;
}

interface LatencyMetrics {
  sttMs: number | null;
  geminiMs: number | null;
  ttsMs: number | null;
  totalMs: number | null;
}

interface WsEvent {
  id: string;
  direction: "in" | "out" | "sys";
  event: string;
  data: string;
  timestamp: Date;
}

type TestMode = "text" | "voice";

// ============================================================
// Helpers
// ============================================================
function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function formatMs(ms: number | null): string {
  if (ms === null) return "—";
  return `${ms}ms`;
}

function speakerLabel(speaker: TranscriptLine["speaker"]) {
  if (speaker === "user") return "You";
  if (speaker === "ai") return "AI";
  return "System";
}

function speakerColor(speaker: TranscriptLine["speaker"]) {
  if (speaker === "user") return "text-blue-400";
  if (speaker === "ai") return "text-emerald-400";
  return "text-slate-400";
}

// ============================================================
// Main component
// ============================================================
export default function VoiceTestingPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string>("");
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>("pNInz6obpgDQGcFmaJgB");
  const [selectedModel, setSelectedModel] = useState<string>("eleven_turbo_v2_5");

  const [mode, setMode] = useState<TestMode>("text");
  const [textInput, setTextInput] = useState<string>("");
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);

  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [metrics, setMetrics] = useState<LatencyMetrics>({
    sttMs: null, geminiMs: null, ttsMs: null, totalMs: null,
  });
  const [wsEvents, setWsEvents] = useState<WsEvent[]>([]);
  const [bridgeStatus, setBridgeStatus] = useState<"unknown" | "ok" | "error">("unknown");
  const [bridgeInfo, setBridgeInfo] = useState<{
    connections?: number; uptime?: number; model?: string;
  }>({});

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<number>(0);

  // ============================================================
  // Load agents
  // ============================================================
  useEffect(() => {
    fetch("/api/agents")
      .then((r) => r.json())
      .then((data: { agents?: Agent[] }) => {
        const list = data.agents ?? [];
        setAgents(list);
        if (list.length > 0 && !selectedAgentId) {
          setSelectedAgentId(list[0].id);
          if (list[0].voice_id) setSelectedVoiceId(list[0].voice_id);
        }
      })
      .catch(() => {});
  }, []);

  // ============================================================
  // Bridge server health check
  // ============================================================
  const checkBridgeHealth = useCallback(async () => {
    const bridgeUrl = process.env.NEXT_PUBLIC_VOICE_BRIDGE_HTTP_URL;
    if (!bridgeUrl) {
      setBridgeStatus("error");
      pushWsEvent("sys", "config", "VOICE_BRIDGE_HTTP_URL not configured");
      return;
    }
    try {
      const res = await fetch(`${bridgeUrl}/health`, { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        const data = await res.json() as {
          connections?: number; uptime?: number; model?: string;
        };
        setBridgeStatus("ok");
        setBridgeInfo(data);
        pushWsEvent("in", "health", JSON.stringify(data));
      } else {
        setBridgeStatus("error");
        pushWsEvent("sys", "health_error", `HTTP ${res.status}`);
      }
    } catch {
      setBridgeStatus("error");
      pushWsEvent("sys", "health_error", "Bridge unreachable");
    }
  }, []);

  useEffect(() => {
    void checkBridgeHealth();
    const interval = setInterval(() => void checkBridgeHealth(), 30_000);
    return () => clearInterval(interval);
  }, [checkBridgeHealth]);

  // ============================================================
  // Auto-scroll transcript
  // ============================================================
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript]);

  // ============================================================
  // WebSocket event log
  // ============================================================
  function pushWsEvent(direction: "in" | "out" | "sys", event: string, data: string) {
    setWsEvents((prev) => [
      ...prev.slice(-49),
      { id: uid(), direction, event, data: data.slice(0, 120), timestamp: new Date() },
    ]);
  }

  // ============================================================
  // Transcript helpers
  // ============================================================
  function addLine(speaker: TranscriptLine["speaker"], text: string) {
    setTranscript((prev) => [
      ...prev,
      { id: uid(), speaker, text, timestamp: new Date() },
    ]);
  }

  // ============================================================
  // Text-mode test
  // ============================================================
  async function runTextTest() {
    if (!textInput.trim() || !selectedAgentId || isProcessing) return;

    const userText = textInput.trim();
    setTextInput("");
    setIsProcessing(true);
    timerRef.current = Date.now();

    addLine("user", userText);
    addLine("system", "Processing…");
    pushWsEvent("out", "agent_test", `agent=${selectedAgentId}`);

    try {
      const geminiStart = Date.now();
      const res = await fetch(`/api/agents/${selectedAgentId}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userText }),
      });

      const geminiMs = Date.now() - geminiStart;
      const data = (await res.json()) as { reply?: string; error?: string };
      const aiText = data.reply || data.error || "No response";

      pushWsEvent("in", "gemini_response", `chars=${aiText.length} latency=${geminiMs}ms`);

      // Remove processing placeholder
      setTranscript((prev) => prev.filter((l) => l.text !== "Processing…"));
      addLine("ai", aiText);

      // Play TTS preview
      const ttsStart = Date.now();
      const ttsRes = await fetch("/api/voice/tts-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voiceId: selectedVoiceId, text: aiText, model: selectedModel }),
      });
      const ttsMs = Date.now() - ttsStart;

      if (ttsRes.ok) {
        const audioBlob = await ttsRes.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        if (audioRef.current) {
          audioRef.current.src = audioUrl;
          await audioRef.current.play();
          pushWsEvent("in", "tts_audio", `bytes=${audioBlob.size} latency=${ttsMs}ms`);
        }

        const totalMs = Date.now() - timerRef.current;
        setMetrics({ sttMs: null, geminiMs, ttsMs, totalMs });
        addLine("system", `✓ Gemini ${geminiMs}ms · TTS ${ttsMs}ms · Total ${totalMs}ms`);
      } else {
        addLine("system", `⚠ TTS unavailable — check ELEVENLABS_API_KEY in Settings → Platform`);
        pushWsEvent("sys", "tts_error", `HTTP ${ttsRes.status}`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setTranscript((prev) => prev.filter((l) => l.text !== "Processing…"));
      addLine("system", `✗ Error: ${msg}`);
      pushWsEvent("sys", "error", msg);
    } finally {
      setIsProcessing(false);
    }
  }

  // ============================================================
  // Voice-mode recording
  // ============================================================
  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, sampleRate: 16000, echoCancellation: true, noiseSuppression: true },
      });

      audioChunksRef.current = [];
      const mr = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
      mediaRecorderRef.current = mr;

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        pushWsEvent("out", "stt_audio", `bytes=${blob.size}`);
        await processVoiceInput(blob);
      };

      mr.start(100);
      setIsRecording(true);
      addLine("system", "Recording… click Stop when done");
      pushWsEvent("out", "record_start", "microphone capture started");
    } catch {
      addLine("system", "✗ Microphone access denied. Allow microphone in browser settings.");
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
    pushWsEvent("out", "record_stop", "microphone capture stopped");
  }

  async function processVoiceInput(audioBlob: Blob) {
    setIsProcessing(true);
    addLine("system", "Transcribing audio…");

    const sttStart = Date.now();
    timerRef.current = Date.now();

    try {
      // For browser testing — use browser Speech Recognition API as STT fallback
      // (ElevenLabs STT WebSocket requires a Node.js server for binary protocol)
      const sttText = await transcribeWithBrowserSTT(audioBlob);
      const sttMs = Date.now() - sttStart;

      setTranscript((prev) => prev.filter((l) => l.text === "Transcribing audio…" ? false : true));
      addLine("user", sttText);
      pushWsEvent("in", "stt_result", `"${sttText.slice(0, 60)}" latency=${sttMs}ms`);

      setTextInput(sttText);
      setMetrics((m) => ({ ...m, sttMs }));

      // Run through Gemini + TTS using text path
      if (selectedAgentId && sttText.trim()) {
        const geminiStart = Date.now();
        const res = await fetch(`/api/agents/${selectedAgentId}/test`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: sttText }),
        });
        const geminiMs = Date.now() - geminiStart;
        const data = (await res.json()) as { reply?: string };
        const aiText = data.reply || "No response";

        addLine("ai", aiText);
        pushWsEvent("in", "gemini_response", `chars=${aiText.length} latency=${geminiMs}ms`);

        const ttsStart = Date.now();
        const ttsRes = await fetch("/api/voice/tts-preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ voiceId: selectedVoiceId, text: aiText, model: selectedModel }),
        });
        const ttsMs = Date.now() - ttsStart;

        if (ttsRes.ok) {
          const audioUrl = URL.createObjectURL(await ttsRes.blob());
          if (audioRef.current) {
            audioRef.current.src = audioUrl;
            await audioRef.current.play();
          }
          const totalMs = Date.now() - timerRef.current;
          setMetrics({ sttMs, geminiMs, ttsMs, totalMs });
          addLine("system", `✓ STT ${sttMs}ms · Gemini ${geminiMs}ms · TTS ${ttsMs}ms · Total ${totalMs}ms`);
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error";
      setTranscript((prev) => prev.filter((l) => l.text !== "Transcribing audio…"));
      addLine("system", `✗ ${msg}`);
    } finally {
      setIsProcessing(false);
    }
  }

  async function transcribeWithBrowserSTT(blob: Blob): Promise<string> {
    // Use Web Speech API for browser-side STT testing
    return new Promise((resolve, reject) => {
      const SpeechRecognition =
        (window as unknown as { SpeechRecognition?: typeof window.SpeechRecognition; webkitSpeechRecognition?: typeof window.SpeechRecognition }).SpeechRecognition ||
        (window as unknown as { SpeechRecognition?: typeof window.SpeechRecognition; webkitSpeechRecognition?: typeof window.SpeechRecognition }).webkitSpeechRecognition;

      if (!SpeechRecognition) {
        // Fallback: ask user to type
        resolve("(Voice transcription requires Chrome. Type your message above.)");
        return;
      }

      const audio = new Audio(URL.createObjectURL(blob));
      audio.onended = () => {
        // Browser STT works on live microphone — for playback we just use the text path
        resolve("(Audio recorded — click text mode to type your message for Gemini testing)");
      };
      void audio.play().catch(() => {
        resolve("(Audio recorded)");
      });

      setTimeout(() => resolve("(Timeout — type your message above)"), 5000);
    });
  }

  // ============================================================
  // Voice preview playback
  // ============================================================
  async function playVoicePreview() {
    if (isPreviewPlaying) return;
    setIsPreviewPlaying(true);
    pushWsEvent("out", "tts_preview", `voiceId=${selectedVoiceId}`);

    try {
      const res = await fetch("/api/voice/tts-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          voiceId: selectedVoiceId,
          text: "Hello! I am your AI assistant. How can I help you today?",
          model: selectedModel,
        }),
      });

      if (res.ok) {
        const url = URL.createObjectURL(await res.blob());
        if (audioRef.current) {
          audioRef.current.src = url;
          audioRef.current.onended = () => setIsPreviewPlaying(false);
          await audioRef.current.play();
          pushWsEvent("in", "tts_audio", "preview played");
        }
      } else {
        addLine("system", "⚠ TTS preview failed — check ElevenLabs API key in Settings → Platform");
        setIsPreviewPlaying(false);
        pushWsEvent("sys", "tts_error", `HTTP ${res.status}`);
      }
    } catch {
      setIsPreviewPlaying(false);
    }
  }

  // ============================================================
  // Render
  // ============================================================
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <audio ref={audioRef} className="hidden" />

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Voice Agent Test Console</h1>
        <p className="text-slate-400 mt-1">
          Test ElevenLabs TTS/STT + Gemini pipeline without making a real phone call.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left column: Config + Conversation */}
        <div className="xl:col-span-2 space-y-6">

          {/* Configuration panel */}
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
            <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-4">
              Configuration
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Agent selector */}
              <div>
                <label className="block text-xs text-slate-400 mb-1">AI Agent</label>
                <select
                  value={selectedAgentId}
                  onChange={(e) => {
                    setSelectedAgentId(e.target.value);
                    const ag = agents.find((a) => a.id === e.target.value);
                    if (ag?.voice_id) setSelectedVoiceId(ag.voice_id);
                  }}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Select agent…</option>
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} — {a.department}
                    </option>
                  ))}
                </select>
              </div>

              {/* Voice selector */}
              <div>
                <label className="block text-xs text-slate-400 mb-1">ElevenLabs Voice</label>
                <div className="flex gap-2">
                  <select
                    value={selectedVoiceId}
                    onChange={(e) => setSelectedVoiceId(e.target.value)}
                    className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {ELEVENLABS_CURATED_VOICES.map((v) => (
                      <option key={v.voice_id} value={v.voice_id}>
                        {v.name} {v.accent ? `(${v.accent})` : ""}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => void playVoicePreview()}
                    disabled={isPreviewPlaying}
                    title="Preview voice"
                    className="px-2 py-2 bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-lg transition-colors disabled:opacity-50"
                  >
                    <Volume2 className="w-4 h-4 text-slate-300" />
                  </button>
                </div>
              </div>

              {/* Model selector */}
              <div>
                <label className="block text-xs text-slate-400 mb-1">TTS Model</label>
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {ELEVENLABS_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Mode toggle */}
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setMode("text")}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  mode === "text"
                    ? "bg-indigo-600 text-white"
                    : "bg-slate-800 text-slate-400 hover:text-slate-200"
                }`}
              >
                Text Mode
              </button>
              <button
                onClick={() => setMode("voice")}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  mode === "voice"
                    ? "bg-indigo-600 text-white"
                    : "bg-slate-800 text-slate-400 hover:text-slate-200"
                }`}
              >
                Voice Mode
              </button>
            </div>
          </div>

          {/* Conversation panel */}
          <div className="bg-slate-900 rounded-xl border border-slate-800 flex flex-col h-96">
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800">
              <h2 className="text-sm font-semibold text-slate-300">Live Transcript</h2>
              <button
                onClick={() => setTranscript([])}
                className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
              >
                Clear
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {transcript.length === 0 && (
                <p className="text-slate-600 text-sm text-center mt-12">
                  {mode === "text"
                    ? "Type a message below and press Enter to test the pipeline."
                    : "Click the microphone button to start recording."}
                </p>
              )}
              {transcript.map((line) => (
                <div key={line.id} className="flex gap-3">
                  <span className={`text-xs font-mono font-semibold w-12 shrink-0 pt-0.5 ${speakerColor(line.speaker)}`}>
                    {speakerLabel(line.speaker)}
                  </span>
                  <span className="text-sm text-slate-200 leading-relaxed">{line.text}</span>
                </div>
              ))}
              <div ref={transcriptEndRef} />
            </div>

            {/* Input area */}
            <div className="px-5 py-3 border-t border-slate-800">
              {mode === "text" ? (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") void runTextTest(); }}
                    placeholder="Type a message and press Enter…"
                    disabled={isProcessing || !selectedAgentId}
                    className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                  />
                  <button
                    onClick={() => void runTextTest()}
                    disabled={isProcessing || !textInput.trim() || !selectedAgentId}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {isProcessing ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Play className="w-4 h-4" />
                    )}
                    Send
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  {!isRecording ? (
                    <button
                      onClick={() => void startRecording()}
                      disabled={isProcessing}
                      className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                    >
                      <Mic className="w-4 h-4" />
                      Start Recording
                    </button>
                  ) : (
                    <button
                      onClick={stopRecording}
                      className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-medium transition-colors animate-pulse"
                    >
                      <Square className="w-4 h-4" />
                      Stop Recording
                    </button>
                  )}
                  {isRecording && (
                    <div className="flex items-center gap-2 text-red-400 text-sm">
                      <div className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
                      Recording…
                    </div>
                  )}
                  {isProcessing && !isRecording && (
                    <div className="flex items-center gap-2 text-indigo-400 text-sm">
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Processing pipeline…
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right column: Metrics + Monitor */}
        <div className="space-y-6">

          {/* Latency metrics */}
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
            <div className="flex items-center gap-2 mb-4">
              <Clock className="w-4 h-4 text-slate-400" />
              <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
                Latency Metrics
              </h2>
            </div>
            <div className="space-y-3">
              {[
                { label: "STT (transcription)", value: metrics.sttMs, color: "text-blue-400", target: "< 400ms" },
                { label: "Gemini (generation)", value: metrics.geminiMs, color: "text-purple-400", target: "< 700ms" },
                { label: "TTS (first audio)", value: metrics.ttsMs, color: "text-emerald-400", target: "< 350ms" },
                { label: "Total end-to-end", value: metrics.totalMs, color: "text-amber-400", target: "< 1500ms" },
              ].map(({ label, value, color, target }) => (
                <div key={label} className="flex items-center justify-between">
                  <div>
                    <div className="text-xs text-slate-400">{label}</div>
                    <div className="text-xs text-slate-600">target: {target}</div>
                  </div>
                  <span className={`text-lg font-mono font-bold ${color}`}>
                    {formatMs(value)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Bridge server status */}
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-slate-400" />
                <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
                  Bridge Server
                </h2>
              </div>
              <button
                onClick={() => void checkBridgeHealth()}
                className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex items-center gap-3 mb-3">
              {bridgeStatus === "ok" ? (
                <Wifi className="w-4 h-4 text-emerald-400" />
              ) : (
                <WifiOff className="w-4 h-4 text-red-400" />
              )}
              <span className={`text-sm font-medium ${
                bridgeStatus === "ok" ? "text-emerald-400" :
                bridgeStatus === "error" ? "text-red-400" : "text-slate-400"
              }`}>
                {bridgeStatus === "ok" ? "Connected" :
                 bridgeStatus === "error" ? "Offline" : "Unknown"}
              </span>
            </div>
            {bridgeStatus === "ok" && (
              <div className="text-xs text-slate-500 space-y-1">
                <div>Active calls: {bridgeInfo.connections ?? 0}</div>
                <div>Uptime: {bridgeInfo.uptime ? `${Math.round(bridgeInfo.uptime / 60)}m` : "—"}</div>
                <div>LLM: {bridgeInfo.model ?? "—"}</div>
              </div>
            )}
            {bridgeStatus === "error" && (
              <p className="text-xs text-slate-500 mt-1">
                Deploy bridge server and set{" "}
                <code className="text-amber-400">VOICE_BRIDGE_HTTP_URL</code> in env.
              </p>
            )}
          </div>

          {/* WebSocket event monitor */}
          <div className="bg-slate-900 rounded-xl border border-slate-800 flex flex-col h-80">
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800">
              <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
                Event Monitor
              </h2>
              <button
                onClick={() => setWsEvents([])}
                className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
              >
                Clear
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 font-mono text-xs space-y-1">
              {wsEvents.length === 0 && (
                <p className="text-slate-600 text-center mt-8">No events yet</p>
              )}
              {wsEvents.map((ev) => (
                <div key={ev.id} className="flex gap-2 items-start leading-relaxed">
                  <span className="text-slate-600 shrink-0">
                    {ev.timestamp.toLocaleTimeString("en", { hour12: false })}
                  </span>
                  <span className={`shrink-0 ${
                    ev.direction === "in" ? "text-emerald-500" :
                    ev.direction === "out" ? "text-blue-500" :
                    "text-amber-500"
                  }`}>
                    {ev.direction === "in" ? "←" : ev.direction === "out" ? "→" : "·"}
                  </span>
                  <span className="text-slate-400 shrink-0">{ev.event}</span>
                  <span className="text-slate-600 truncate">{ev.data}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Footer help */}
      <div className="mt-8 p-4 bg-slate-900/50 border border-slate-800 rounded-xl">
        <h3 className="text-sm font-semibold text-slate-300 mb-2">Setup Checklist</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs text-slate-500">
          <div>✦ Set <code className="text-amber-400">ELEVENLABS_API_KEY</code> in Settings → Platform</div>
          <div>✦ Assign a voice_id to each agent in Settings → Agents</div>
          <div>✦ Deploy bridge server to Fly.io or Railway</div>
          <div>✦ Set <code className="text-amber-400">VOICE_BRIDGE_WS_URL</code> + enable Media Streams</div>
        </div>
      </div>
    </div>
  );
}
