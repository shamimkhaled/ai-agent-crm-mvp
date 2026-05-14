/**
 * Twilio Media Streams — ElevenLabs WebSocket Bridge Server
 *
 * This is a standalone Node.js server that bridges Twilio Media Streams
 * to ElevenLabs STT + TTS via WebSocket connections.
 *
 * WHY SEPARATE SERVER:
 *   Vercel serverless functions have a 15-second execution limit and cannot
 *   maintain persistent WebSocket connections required for Twilio Media Streams.
 *   This server runs on Fly.io, Railway, or Render.
 *
 * STARTUP:
 *   Development:  npx ts-node server/media-stream-server.ts
 *   Production:   fly deploy (uses Dockerfile.bridge)
 *
 * ENVIRONMENT VARIABLES (set on Fly.io / Railway):
 *   ELEVENLABS_API_KEY
 *   GOOGLE_GEMINI_API_KEY
 *   SUPABASE_SERVICE_ROLE_KEY
 *   NEXT_PUBLIC_SUPABASE_URL
 *   GEMINI_MODEL (default: gemini-2.5-flash)
 *   BRIDGE_PORT (default: 8080)
 *   BRIDGE_SECRET (shared secret with Next.js for internal auth)
 *   ELEVENLABS_DEFAULT_MODEL (default: eleven_turbo_v2_5)
 */

import http from "http";
import { WebSocket, WebSocketServer } from "ws";
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import { mulawToPcm16k, bufferToBase64, isSilence } from "../src/lib/elevenlabs/audio";
import { ElevenLabsTTSStream } from "../src/lib/elevenlabs/tts";
import { ElevenLabsSTTStream } from "../src/lib/elevenlabs/stt";
import {
  detectLanguageFromText,
  detectCodeSwitching,
  getLanguageConfig,
  getElevenLabsSTTCode,
  buildLanguageInstruction,
  buildTurnLanguageInstruction,
  getLocalizedGreeting,
  type SupportedLanguageCode,
} from "../src/lib/elevenlabs/multilingual";
import { getDefaultVoiceForLanguage, getRecommendedModelForLanguage } from "../src/lib/elevenlabs/voices";

// ============================================================
// Configuration
// ============================================================
const PORT = Number(process.env.BRIDGE_PORT) || 8080;
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || "";
const GEMINI_API_KEY = process.env.GOOGLE_GEMINI_API_KEY || "";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const ELEVENLABS_TTS_MODEL = process.env.ELEVENLABS_DEFAULT_MODEL || "eleven_turbo_v2_5";

// Silence RMS threshold — skip sending silent packets to STT
const SILENCE_THRESHOLD = 200;

// How long (ms) to wait for barge-in before committing TTS
const BARGE_IN_DELAY_MS = 200;

// ============================================================
// Global Supabase client (shared across connections)
// ============================================================
const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    : null;

// ============================================================
// Per-call state
// ============================================================
interface CallState {
  streamSid: string;
  callSid: string;
  agentId: string;

  /** Agent's configured primary language */
  language: SupportedLanguageCode;

  /** Currently active language (may differ from agent.language after detection) */
  activeLanguage: SupportedLanguageCode;

  /** Whether language auto-detection is enabled for this call */
  autoDetectLanguage: boolean;

  /** Number of consecutive turns in a non-primary language (for switching back) */
  consecutiveLanguageTurns: number;

  voiceId: string;
  ttsModel: string;
  systemPrompt: string;
  agentName: string;

  stt: ElevenLabsSTTStream | null;
  tts: ElevenLabsTTSStream | null;
  twilioWs: WebSocket;

  isPlayingTTS: boolean;
  bargeInBuffer: Buffer[];
  conversationHistory: Array<{ role: string; content: string }>;

  metrics: {
    callStart: number;
    sttStart: number;
    sttEnd: number;
    geminiStart: number;
    geminiFirstToken: number;
    ttsStart: number;
    ttsFirstAudio: number;
    turnsCompleted: number;
    languageSwitches: number;
  };
}

const activeCalls = new Map<string, CallState>();
let totalConnections = 0;

// ============================================================
// HTTP server (health check endpoint)
// ============================================================
const httpServer = http.createServer((req, res) => {
  if (req.url === "/health" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "ok",
        connections: activeCalls.size,
        totalServed: totalConnections,
        uptime: Math.round(process.uptime()),
        model: GEMINI_MODEL,
        ttsModel: ELEVENLABS_TTS_MODEL,
      })
    );
    return;
  }
  res.writeHead(404);
  res.end("Not Found");
});

// ============================================================
// WebSocket server
// ============================================================
const wss = new WebSocketServer({ server: httpServer, path: "/voice/stream" });

wss.on("connection", (ws, req) => {
  totalConnections++;
  const url = new URL(req.url || "/", `http://localhost:${PORT}`);
  const agentId = url.searchParams.get("agentId") || "";
  const language = url.searchParams.get("lang") || "en";

  console.log(`[bridge] New connection — agentId=${agentId} lang=${language}`);

  let state: CallState | null = null;

  ws.on("message", async (raw: Buffer) => {
    try {
      const event = JSON.parse(raw.toString()) as TwilioStreamEvent;

      switch (event.event) {
        case "start":
          state = await handleStart(event, ws, agentId, language);
          break;

        case "media":
          if (state && event.media?.track === "inbound") {
            await handleInboundAudio(state, event.media.payload);
          }
          break;

        case "stop":
          if (state) await teardown(state, "call_ended");
          ws.close(1000);
          break;

        case "mark":
          if (state && event.mark?.name === "tts-done") {
            state.isPlayingTTS = false;
          }
          break;
      }
    } catch (e) {
      console.error("[bridge] Message handling error:", e instanceof Error ? e.message : e);
    }
  });

  ws.on("close", async (code) => {
    if (state) {
      await teardown(state, `ws_close_${code}`);
    }
  });

  ws.on("error", (err) => {
    console.error("[bridge] WebSocket error:", err.message);
  });
});

// ============================================================
// Call initialization
// ============================================================
async function handleStart(
  event: TwilioStreamEvent,
  ws: WebSocket,
  agentId: string,
  language: string
): Promise<CallState> {
  const streamSid = event.start?.streamSid || "";
  const callSid =
    event.start?.callSid ||
    event.start?.customParameters?.callSid ||
    "";

  console.log(`[bridge] Call started — callSid=${callSid} streamSid=${streamSid}`);

  // Resolve agent config from Supabase
  const agentConfig = await fetchAgentConfig(agentId);

  const primaryLang = (agentConfig.language || language || "en") as SupportedLanguageCode;
  // Use agent's configured voice, or pick the best default for the language
  const resolvedVoiceId = agentConfig.voice_id
    || process.env.ELEVENLABS_DEFAULT_VOICE_ID
    || getDefaultVoiceForLanguage(primaryLang);
  // Use language-appropriate TTS model (eleven_turbo_v2 is English-only — never for Bangla)
  const resolvedTTSModel = getRecommendedModelForLanguage(primaryLang) || ELEVENLABS_TTS_MODEL;
  // Build system prompt with language instruction baked in
  const basePrompt = agentConfig.system_prompt || buildDefaultSystemPrompt(agentConfig);
  const langInstruction = buildLanguageInstruction(primaryLang);
  const fullSystemPrompt = `${basePrompt}\n${langInstruction}`;

  const state: CallState = {
    streamSid,
    callSid,
    agentId,
    language: primaryLang,
    activeLanguage: primaryLang,
    autoDetectLanguage: process.env.VOICE_AUTO_DETECT_LANGUAGE !== "false", // default ON
    consecutiveLanguageTurns: 0,
    voiceId: resolvedVoiceId,
    ttsModel: resolvedTTSModel,
    systemPrompt: fullSystemPrompt,
    agentName: agentConfig.name || "AI Assistant",
    stt: null,
    tts: null,
    twilioWs: ws,
    isPlayingTTS: false,
    bargeInBuffer: [],
    conversationHistory: [],
    metrics: {
      callStart: Date.now(),
      sttStart: 0,
      sttEnd: 0,
      geminiStart: 0,
      geminiFirstToken: 0,
      ttsStart: 0,
      ttsFirstAudio: 0,
      turnsCompleted: 0,
      languageSwitches: 0,
    },
  };

  console.log(`[bridge] Language config — primary=${primaryLang} voiceId=${resolvedVoiceId} model=${resolvedTTSModel}`);

  activeCalls.set(streamSid, state);

  // Initialize STT and TTS connections in parallel
  await Promise.all([initSTT(state), initTTS(state)]);

  // Log to Supabase
  await logPipelineEvent(state.callSid, "MEDIA_STREAM_START", `agentId=${agentId}`);

  // Speak opening message if configured — use localized greeting if no custom first_message
  if (agentConfig.agent_speaks_first) {
    const greeting = agentConfig.first_message?.trim()
      || getLocalizedGreeting(state.agentName, state.language);
    await speakText(state, greeting);
  }

  return state;
}

// ============================================================
// STT initialization
// ============================================================
async function initSTT(state: CallState): Promise<void> {
  // Use the active language's ElevenLabs code (e.g. "bn" for Bengali, "en" for English)
  const sttLangCode = getElevenLabsSTTCode(state.activeLanguage);

  const stt = new ElevenLabsSTTStream(ELEVENLABS_API_KEY, {
    model: "scribe_v1",
    language: sttLangCode || undefined, // empty string = auto-detect
    inactivityTimeout: 30,
  });

  stt.on("transcript", async (text, isFinal) => {
    if (!isFinal || !text.trim()) return;

    state.metrics.sttEnd = Date.now();
    console.log(
      `[bridge] STT final: "${text.slice(0, 80)}" ` +
      `(${state.metrics.sttEnd - state.metrics.sttStart}ms)`
    );

    await logTranscript(state.callSid, "caller", text);

    // ── Language detection on final transcript ──────────────────────────────
    if (state.autoDetectLanguage) {
      const { isMixed, primaryLanguage, banglaRatio } = detectCodeSwitching(text);
      const detectedLang = detectLanguageFromText(text, state.language);

      const langChanged = detectedLang !== state.activeLanguage;

      if (langChanged) {
        const prevLang = state.activeLanguage;
        state.activeLanguage = detectedLang;
        state.consecutiveLanguageTurns = 1;
        state.metrics.languageSwitches++;

        console.log(`[bridge] Language switch detected: ${prevLang} → ${detectedLang} (banglaRatio=${banglaRatio.toFixed(2)} mixed=${isMixed})`);

        // Reinitialize STT with new language code
        if (state.stt) {
          state.stt.close();
          state.stt = null;
          await initSTT(state);
        }

        await logPipelineEvent(
          state.callSid,
          "LANGUAGE_SWITCH",
          `${prevLang} → ${detectedLang} (mixed=${isMixed} ratio=${banglaRatio.toFixed(2)})`
        );
      } else if (detectedLang === state.activeLanguage) {
        state.consecutiveLanguageTurns++;
      }
    }

    await runGeminiPipeline(state, text);
  });

  stt.on("transcript", async (text, isFinal) => {
    if (!isFinal && text.trim()) {
      // Barge-in detection: if TTS is playing and caller is speaking
      if (state.isPlayingTTS) {
        console.log("[bridge] Barge-in detected — interrupting TTS");
        await triggerBargeIn(state);
      }
      await logTranscript(state.callSid, "system", `[partial] ${text.slice(0, 50)}`);
    }
  });

  stt.on("error", (err) => {
    console.error("[bridge] STT error:", err.message);
    void logPipelineEvent(state.callSid, "STT_ERROR", err.message.slice(0, 200));
  });

  await stt.connect();
  state.stt = stt;
}

// ============================================================
// TTS initialization
// ============================================================
async function initTTS(state: CallState): Promise<void> {
  const tts = new ElevenLabsTTSStream(state.voiceId, ELEVENLABS_API_KEY, {
    model: state.ttsModel,
    outputFormat: "ulaw_8000",       // Ready for Twilio — no conversion needed
    speed: 1.0,
    stability: 0.5,
    similarityBoost: 0.8,
    optimizeStreamingLatency: 4,     // Maximum latency optimization
  });

  tts.on("audio", (chunk) => {
    if (!state.isPlayingTTS) {
      state.metrics.ttsFirstAudio = Date.now();
      state.isPlayingTTS = true;
    }
    sendAudioToTwilio(state, chunk);
  });

  tts.on("done", () => {
    state.isPlayingTTS = false;
    // Send mark event so we know when Twilio finished playing
    sendMarkToTwilio(state, "tts-done");
    state.metrics.turnsCompleted++;
  });

  tts.on("error", (err) => {
    console.error("[bridge] TTS error:", err.message);
    state.isPlayingTTS = false;
    void logPipelineEvent(state.callSid, "TTS_ERROR", err.message.slice(0, 200));
  });

  await tts.connect();
  state.tts = tts;
}

// ============================================================
// Inbound audio processing (Twilio → ElevenLabs STT)
// ============================================================
async function handleInboundAudio(state: CallState, payload: string): Promise<void> {
  const mulaw = Buffer.from(payload, "base64");

  // Skip silent packets to reduce STT processing
  if (isSilence(mulaw, SILENCE_THRESHOLD)) return;

  if (!state.metrics.sttStart) {
    state.metrics.sttStart = Date.now();
  }

  // Convert μ-law 8kHz → PCM 16kHz for ElevenLabs STT
  const pcm16k = mulawToPcm16k(mulaw);
  state.stt?.sendAudio(pcm16k);
}

// ============================================================
// Gemini pipeline (STT → RAG → LLM → TTS)
// ============================================================
async function runGeminiPipeline(state: CallState, utterance: string): Promise<void> {
  state.metrics.geminiStart = Date.now();

  await Promise.all([
    logPipelineEvent(state.callSid, "STT", `final transcript: ${utterance.slice(0, 100)}`),
    logPipelineEvent(state.callSid, "GEMINI_START", `utterance len=${utterance.length}`),
  ]);

  // Add to conversation history
  // Prepend turn-level language instruction if the active language differs from primary
  const turnLangNote = buildTurnLanguageInstruction(state.activeLanguage, state.language);
  const userContent = turnLangNote
    ? `[${turnLangNote}]\n${utterance}`
    : utterance;
  state.conversationHistory.push({ role: "user", content: userContent });

  try {
    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

    // Build conversation history for Gemini
    const history = state.conversationHistory
      .slice(0, -1) // exclude current utterance (added above)
      .slice(-10)    // keep last 10 turns
      .map((m) => ({
        role: m.role === "user" ? "user" as const : "model" as const,
        parts: [{ text: m.content }],
      }));

    const chat = ai.chats.create({
      model: GEMINI_MODEL,
      config: { systemInstruction: state.systemPrompt },
      history,
    });

    // Stream Gemini response
    const stream = await chat.sendMessageStream({ message: utterance });

    let sentenceBuffer = "";
    let fullResponse = "";
    let firstTokenTime = 0;

    const sentenceEnders = /[.!?]+(?:\s|$)/;

    for await (const chunk of stream) {
      if (!chunk.text) continue;

      if (!firstTokenTime) {
        firstTokenTime = Date.now();
        state.metrics.geminiFirstToken = firstTokenTime;
        console.log(`[bridge] Gemini first token in ${firstTokenTime - state.metrics.geminiStart}ms`);

        // Start TTS stream immediately on first token
        state.metrics.ttsStart = Date.now();
      }

      const token = chunk.text;
      sentenceBuffer += token;
      fullResponse += token;

      // Stream sentence-by-sentence to TTS for lower latency
      const sentenceMatch = sentenceBuffer.search(sentenceEnders);
      if (sentenceMatch !== -1) {
        const sentence = sentenceBuffer.slice(0, sentenceMatch + 1).trim();
        sentenceBuffer = sentenceBuffer.slice(sentenceMatch + 1).trimStart();

        if (sentence) {
          state.tts?.sendText(sentence + " ");
        }
      }
    }

    // Flush remaining text
    if (sentenceBuffer.trim()) {
      state.tts?.sendText(sentenceBuffer.trim());
    }
    state.tts?.flush();

    // Log final response
    state.conversationHistory.push({ role: "assistant", content: fullResponse });

    const e2eMs = Date.now() - state.metrics.sttStart;
    console.log(`[bridge] Pipeline complete — E2E: ${e2eMs}ms | turns: ${state.metrics.turnsCompleted + 1}`);

    await Promise.all([
      logTranscript(state.callSid, "ai", fullResponse),
      logPipelineEvent(
        state.callSid,
        "GEMINI",
        `ok chars=${fullResponse.length} geminiMs=${Date.now() - state.metrics.geminiStart}`
      ),
      logPipelineEvent(state.callSid, "TTS", `ElevenLabs stream-input voiceId=${state.voiceId}`),
    ]);

    // Reset STT timer for next turn
    state.metrics.sttStart = 0;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[bridge] Gemini pipeline error:", msg);

    // Graceful fallback — speak error message
    await speakText(state, "I'm sorry, I had trouble understanding that. Could you please repeat?");
    await logPipelineEvent(state.callSid, "GEMINI_ERROR", msg.slice(0, 300));
  }
}

// ============================================================
// Speak text (directly — bypasses streaming for fixed messages)
// ============================================================
async function speakText(state: CallState, text: string): Promise<void> {
  if (!state.tts) return;
  state.tts.sendText(text);
  state.tts.flush();
}

// ============================================================
// Barge-in handling
// ============================================================
async function triggerBargeIn(state: CallState): Promise<void> {
  if (!state.isPlayingTTS) return;

  // Tell Twilio to stop playing queued audio immediately
  sendClearToTwilio(state);

  // Cancel current TTS stream — close and reinitialize
  if (state.tts) {
    await state.tts.close();
    state.tts = null;
    state.isPlayingTTS = false;
    // Reinitialize TTS for next response
    await initTTS(state);
  }

  await logPipelineEvent(state.callSid, "BARGE_IN", "Caller interrupted AI speech");
}

// ============================================================
// Twilio WebSocket message senders
// ============================================================
function sendAudioToTwilio(state: CallState, audio: Buffer): void {
  if (state.twilioWs.readyState !== WebSocket.OPEN) return;

  const message = JSON.stringify({
    event: "media",
    streamSid: state.streamSid,
    media: {
      payload: bufferToBase64(audio),
      track: "outbound",
    },
  });

  state.twilioWs.send(message);
}

function sendMarkToTwilio(state: CallState, name: string): void {
  if (state.twilioWs.readyState !== WebSocket.OPEN) return;

  state.twilioWs.send(
    JSON.stringify({
      event: "mark",
      streamSid: state.streamSid,
      mark: { name },
    })
  );
}

function sendClearToTwilio(state: CallState): void {
  if (state.twilioWs.readyState !== WebSocket.OPEN) return;

  state.twilioWs.send(
    JSON.stringify({
      event: "clear",
      streamSid: state.streamSid,
    })
  );
}

// ============================================================
// Teardown
// ============================================================
async function teardown(state: CallState, reason: string): Promise<void> {
  console.log(`[bridge] Teardown — callSid=${state.callSid} reason=${reason}`);

  await Promise.allSettled([
    state.stt?.close(),
    state.tts?.close(),
    logPipelineEvent(
      state.callSid,
      "MEDIA_STREAM_END",
      `${reason} | turns=${state.metrics.turnsCompleted} | duration=${Date.now() - state.metrics.callStart}ms`
    ),
  ]);

  activeCalls.delete(state.streamSid);
}

// ============================================================
// Supabase helpers
// ============================================================
async function fetchAgentConfig(agentId: string): Promise<{
  name: string;
  system_prompt: string | null;
  language: string;
  voice_id: string | null;
  voice_speed: number;
  agent_speaks_first: boolean;
  first_message: string | null;
}> {
  const defaults = {
    name: "AI Assistant",
    system_prompt: null,
    language: "en",
    voice_id: process.env.ELEVENLABS_DEFAULT_VOICE_ID || "pNInz6obpgDQGcFmaJgB",
    voice_speed: 1.0,
    agent_speaks_first: true,
    first_message: "Thank you for calling. How can I help you today?",
  };

  if (!supabase || !agentId) return defaults;

  try {
    const { data } = await supabase
      .from("ai_agents")
      .select(
        "name, system_prompt, language, voice_id, voice_speed, agent_speaks_first, first_message"
      )
      .eq("id", agentId)
      .maybeSingle();

    if (!data) return defaults;

    const row = data as Record<string, unknown>;
    return {
      name: String(row.name ?? defaults.name),
      system_prompt: row.system_prompt ? String(row.system_prompt) : null,
      language: String(row.language ?? "en"),
      voice_id: row.voice_id ? String(row.voice_id) : defaults.voice_id,
      voice_speed: Number(row.voice_speed ?? 1.0),
      agent_speaks_first: Boolean(row.agent_speaks_first ?? true),
      first_message: row.first_message ? String(row.first_message) : defaults.first_message,
    };
  } catch {
    return defaults;
  }
}

async function logPipelineEvent(
  callId: string,
  step: string,
  detail: string,
  durationMs?: number
): Promise<void> {
  if (!supabase || !callId) return;
  try {
    await supabase.from("voice_pipeline_events").insert({
      call_id: callId,
      step,
      detail: detail.slice(0, 500),
      ...(durationMs !== undefined ? { duration_ms: durationMs } : {}),
    });
  } catch {
    // Non-critical — don't fail the call
  }
}

async function logTranscript(
  callSid: string,
  speaker: "caller" | "ai" | "system",
  body: string
): Promise<void> {
  if (!supabase || !callSid) return;
  try {
    await supabase.from("voice_call_transcripts").insert({
      call_sid: callSid,
      speaker,
      body: body.slice(0, 2000),
      pipeline_step: speaker === "caller" ? "STT" : speaker === "ai" ? "TTS" : "System",
    });
  } catch {
    // Non-critical
  }
}

// ============================================================
// Helpers
// ============================================================
function buildDefaultSystemPrompt(agent: { name: string; language: string }): string {
  return `You are ${agent.name}, an AI voice assistant. 
Be concise and conversational — remember this is a phone call. 
Keep responses under 3 sentences unless the caller asks for detail.
Language: ${agent.language === "bn" ? "Bengali (Bangla)" : "English"}.`;
}

// ============================================================
// Twilio event types
// ============================================================
interface TwilioStreamEvent {
  event: "start" | "media" | "stop" | "mark" | "connected";
  start?: {
    streamSid: string;
    callSid: string;
    customParameters?: Record<string, string>;
  };
  media?: {
    track: "inbound" | "outbound";
    chunk: string;
    timestamp: string;
    payload: string;
  };
  stop?: { streamSid: string };
  mark?: { name: string };
}

// ============================================================
// Start server
// ============================================================
httpServer.listen(PORT, () => {
  console.log(`[bridge] Media Stream bridge server running on port ${PORT}`);
  console.log(`[bridge] WebSocket: ws://localhost:${PORT}/voice/stream`);
  console.log(`[bridge] Health: http://localhost:${PORT}/health`);
  console.log(`[bridge] Gemini model: ${GEMINI_MODEL}`);
  console.log(`[bridge] ElevenLabs TTS model: ${ELEVENLABS_TTS_MODEL}`);

  if (!ELEVENLABS_API_KEY) console.warn("[bridge] ⚠️  ELEVENLABS_API_KEY not set");
  if (!GEMINI_API_KEY) console.warn("[bridge] ⚠️  GOOGLE_GEMINI_API_KEY not set");
});

process.on("SIGTERM", () => {
  console.log("[bridge] SIGTERM received — shutting down gracefully");
  wss.close(() => httpServer.close(() => process.exit(0)));
});
