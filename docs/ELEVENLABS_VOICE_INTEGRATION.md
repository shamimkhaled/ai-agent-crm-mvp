# ElevenLabs Voice Integration — AI CRM Voice Agent Platform

> **Production-Grade Guide** | Next.js 14 · ElevenLabs STT/TTS · Twilio Media Streams · Google Gemini · RAG
>
> Built specifically for the `/crm-mvp` codebase. Every code snippet integrates with existing
> routes, stores, database schema, and environment variables already present in this project.

---

## Table of Contents

1. [Voice Architecture Overview](#1-voice-architecture-overview)
2. [ElevenLabs Integration](#2-elevenlabs-integration)
3. [Dynamic Voice Provider System](#3-dynamic-voice-provider-system)
4. [AI Agent Voice Assignment](#4-ai-agent-voice-assignment)
5. [Realtime Testing UI](#5-realtime-testing-ui)
6. [Twilio Media Streams Integration](#6-twilio-media-streams-integration)
7. [RAG + CRM Knowledge Base Integration](#7-rag--crm-knowledge-base-integration)
8. [Production Deployment & Scaling](#8-production-deployment--scaling)
9. [Troubleshooting Guide](#9-troubleshooting-guide)
10. [Folder Structure, ENV Variables & Code Examples](#10-folder-structure-env-variables--code-examples)

---

## 1. Voice Architecture Overview

### 1.1 Current vs Target Pipeline

**Current pipeline** (Twilio `<Say>` — already implemented):

```
Caller ──► Twilio Voice Webhook ──► /api/webhooks/voice/inbound
             │                              │
             │ TwiML <Gather input="speech">│
             │◄──────────────────────────────┘
             │
             │ SpeechResult POST
             ▼
        /api/webhooks/voice/gather
             │
             ├─► KB semantic search (pgvector)
             ├─► CRM connector context
             ├─► Gemini (generateGeminiResponse)
             │
             ▼
        TwiML <Say voice="Polly.Matthew">
             │
             ▼
           Caller hears response
```

**Target pipeline** (ElevenLabs Media Streams — this guide):

```
Caller ──► Twilio ──► Media Stream (WebSocket wss://)
                              │
                    ┌─────────▼──────────┐
                    │  WebSocket Bridge   │  ← server/media-stream-server.ts
                    │  (Node.js / Fly.io) │
                    └─────────┬──────────┘
                              │
            ┌─────────────────┼─────────────────┐
            ▼                 ▼                 ▼
    ElevenLabs STT     Supabase Realtime    Gemini + RAG
    (WebSocket)        (transcript write)   (streaming)
            │                                    │
            └────────────────────────────────────┘
                              │
                    ElevenLabs TTS
                    (stream-input WebSocket)
                              │
                    μ-law audio chunks
                              │
                    Twilio Media Stream
                              │
                           Caller
```

### 1.2 Realtime Streaming Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                     REALTIME VOICE PIPELINE                      │
│                                                                  │
│  Twilio ─wss──► Bridge Server                                    │
│                    │                                             │
│                    ├── receives μ-law 8kHz audio chunks          │
│                    │   └── converts to PCM 16kHz                 │
│                    │                                             │
│                    ├── streams PCM to ElevenLabs STT WebSocket   │
│                    │   └── receives transcript tokens            │
│                    │       └── accumulates into utterances       │
│                    │           (VAD: silence > 600ms = end)      │
│                    │                                             │
│                    ├── sends utterance to Gemini (streaming)     │
│                    │   └── receives text tokens                  │
│                    │       └── accumulates into sentences        │
│                    │           (first sentence < 800ms target)   │
│                    │                                             │
│                    └── streams sentences to ElevenLabs TTS WS   │
│                        └── receives MP3/μ-law audio              │
│                            └── encodes to μ-law 8kHz            │
│                                └── sends back to Twilio          │
│                                                                  │
│  Latency budget:                                                 │
│   STT:         200–400ms (ElevenLabs streaming)                  │
│   Gemini:      300–700ms (first token, streaming)                │
│   TTS TTFB:    200–350ms (ElevenLabs stream-input)               │
│   Network:     ~100ms (ngrok/regional deployment)                │
│   TOTAL P50:   ~800ms–1.5s (end-to-end)                          │
└──────────────────────────────────────────────────────────────────┘
```

### 1.3 WebSocket Event Flow

```
Twilio → Bridge        Bridge → Twilio
─────────────────      ─────────────────────────────────────
{ event: "start" }     { event: "media",
  streamSid,             media: {
  callSid,                 payload: <base64 μ-law>,
  customParameters         track: "outbound"
}                        }
                       }

{ event: "media" }     { event: "clear" }  ← barge-in
  media.payload          streamSid
  (base64 μ-law)       }

{ event: "stop" }
  streamSid
}

{ event: "mark" }      { event: "mark",   ← sync point
  mark.name              mark: { name: "done" }
}                      }
```

### 1.4 Low-Latency Optimization Techniques

| Technique | Implementation | Gain |
|-----------|----------------|------|
| **Sentence streaming** | Stream Gemini tokens → send first sentence to TTS immediately | 300–500ms |
| **Audio pre-buffering** | Pre-warm ElevenLabs TTS WebSocket connection before call | 100–200ms |
| **VAD tuning** | `silence_duration_ms: 600` — don't wait for long pauses | 200ms |
| **Connection reuse** | Keep ElevenLabs WS alive per call (don't reconnect per utterance) | 150ms |
| **Parallel pipeline** | Gemini starts streaming while STT sends last tokens | 200–400ms |
| **μ-law direct** | Request `output_format: ulaw_8000` from ElevenLabs TTS | ~50ms |
| **Regional servers** | Deploy bridge server close to Twilio media servers | 50–100ms |

### 1.5 Interrupt / Barge-In Handling

When the caller starts speaking while the AI is talking:

```
1. STT detects speech energy during TTS playback
2. Bridge sends { event: "clear", streamSid } to Twilio
   → Twilio stops playing queued audio immediately
3. Bridge cancels pending ElevenLabs TTS stream
4. Bridge cancels pending Gemini generation
5. New utterance processing begins
6. Supabase logs: BARGE_IN pipeline event
```

### 1.6 Multilingual Support

The existing `agentRouter.ts` already resolves language from `phone_numbers.meta`. ElevenLabs supports:

```typescript
// STT: languageCode param
{ language_code: "bn", model_id: "scribe_v1" }

// TTS: voice_settings per language
{ voice_id: "pNInz6obpgDQGcFmaJgB", model_id: "eleven_turbo_v2_5" }
// eleven_turbo_v2_5 supports 32 languages natively
```

---

## 2. ElevenLabs Integration

### 2.1 Account Setup & API Key Management

#### Step 1: Get your API key

1. Go to [elevenlabs.io](https://elevenlabs.io) → Sign in → **Profile → API Keys**
2. Create a key named `crm-mvp-production`
3. Copy the key (format: `sk_...`)

#### Step 2: Add to environment

```bash
# .env.local (development)
ELEVENLABS_API_KEY=sk_your_key_here
ELEVENLABS_DEFAULT_VOICE_ID=pNInz6obpgDQGcFmaJgB
ELEVENLABS_DEFAULT_MODEL=eleven_turbo_v2_5
ELEVENLABS_STT_MODEL=scribe_v1
```

#### Step 3: Register in platform_settings (UI-configurable)

Run the SQL in `docs/sql/V7_elevenlabs_settings.sql` (provided with this guide):

```sql
INSERT INTO platform_settings (key, value, is_secret) VALUES
  ('ELEVENLABS_API_KEY', '', true),
  ('ELEVENLABS_DEFAULT_VOICE_ID', 'pNInz6obpgDQGcFmaJgB', false),
  ('ELEVENLABS_DEFAULT_MODEL', 'eleven_turbo_v2_5', false)
ON CONFLICT (key) DO NOTHING;
```

This makes the key editable from the Settings → Platform page without requiring a redeploy.

### 2.2 Voice Library Configuration & Cloning

#### Listing available voices

```typescript
// src/lib/elevenlabs/voices.ts (see implementation file)
const voices = await listElevenLabsVoices(apiKey);
// Returns: { voice_id, name, labels, preview_url, category }[]
```

#### Voice cloning (Professional Clone)

```typescript
// Requires ElevenLabs Creator+ plan
const cloneResult = await cloneVoice({
  apiKey,
  name: "Riya - CRM Agent",
  description: "Professional female voice for CRM support",
  files: [audioBlob1, audioBlob2], // 3–5 minutes of clean audio
  labels: { accent: "en-US", use_case: "crm_agent" }
});
// Returns: { voice_id: "abc123...", name: "Riya - CRM Agent" }
```

### 2.3 Realtime STT (WebSocket) — ElevenLabs Scribe

ElevenLabs Scribe supports real-time streaming transcription via WebSocket.

**API endpoint**: `wss://api.elevenlabs.io/v1/speech-to-text/stream`

**Auth**: Pass API key as `xi-api-key` query param or Bearer header.

```typescript
// Simplified WebSocket flow for STT
const sttWs = new WebSocket(
  `wss://api.elevenlabs.io/v1/speech-to-text/stream?xi-api-key=${apiKey}`
);

// On open: send config
sttWs.on("open", () => {
  sttWs.send(JSON.stringify({
    model_id: "scribe_v1",
    language_code: "en",           // or "bn" for Bangla
    diarize: false,
    tag_audio_events: false,
    inactivity_timeout: 30,
  }));
});

// Send audio chunks as binary frames (PCM 16kHz s16le)
sttWs.send(pcm16Buffer);

// Receive transcription events
sttWs.on("message", (data) => {
  const event = JSON.parse(data.toString());
  if (event.type === "transcript" && event.is_final) {
    handleUtterance(event.text); // → Gemini pipeline
  }
});
```

### 2.4 Realtime TTS (Stream-Input WebSocket) — ElevenLabs

**API endpoint**: `wss://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream-input`

**Encoding for Twilio**: `ulaw_8000` (μ-law 8kHz mono) — no conversion needed!

```typescript
// Simplified TTS WebSocket flow
const ttsWs = new WebSocket(
  `wss://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream-input` +
  `?model_id=eleven_turbo_v2_5&output_format=ulaw_8000&xi-api-key=${apiKey}`
);

ttsWs.on("open", () => {
  // Initialize with voice settings
  ttsWs.send(JSON.stringify({
    text: " ",  // BOS marker
    voice_settings: {
      stability: 0.5,
      similarity_boost: 0.8,
      speed: 1.0,
    },
    xi_api_key: apiKey,
  }));
});

// Stream text sentences as they arrive from Gemini
function streamTextChunk(text: string) {
  ttsWs.send(JSON.stringify({ text, flush: false }));
}

// Signal end of text
function finalizeTTS() {
  ttsWs.send(JSON.stringify({ text: "", flush: true }));
}

// Receive audio chunks → forward to Twilio
ttsWs.on("message", (data) => {
  const event = JSON.parse(data.toString());
  if (event.audio) {
    const audioChunk = Buffer.from(event.audio, "base64");
    sendToTwilio(audioChunk); // μ-law 8kHz ready for Twilio
  }
  if (event.isFinal) {
    console.log("[TTS] Stream complete");
  }
});
```

### 2.5 Audio Chunk Handling, Buffering, and μ-law Conversion

```
Twilio → Bridge: μ-law 8kHz (base64 encoded, 20ms chunks = 160 bytes)
Bridge → ElevenLabs STT: PCM 16kHz signed 16-bit LE

Conversion path (Twilio → ElevenLabs STT):
  base64 → Buffer → μ-law → upsample 8kHz→16kHz → PCM 16-bit

ElevenLabs TTS → Bridge → Twilio: μ-law 8kHz
  Request output_format=ulaw_8000 → no conversion needed
```

**μ-law to PCM conversion table** (fast lookup — see `src/lib/elevenlabs/audio.ts`):

```typescript
// Standard G.711 μ-law decode + 8→16kHz linear interpolation
export function mulawToPcm16(mulaw: Buffer): Buffer {
  const pcm8k = Buffer.alloc(mulaw.length * 2);
  for (let i = 0; i < mulaw.length; i++) {
    pcm8k.writeInt16LE(MULAW_DECODE_TABLE[mulaw[i]], i * 2);
  }
  // Upsample 8kHz → 16kHz (linear interpolation)
  const pcm16k = Buffer.alloc(pcm8k.length * 2);
  for (let i = 0; i < mulaw.length; i++) {
    const s = pcm8k.readInt16LE(i * 2);
    pcm16k.writeInt16LE(s, i * 4);
    const next = i + 1 < mulaw.length ? pcm8k.readInt16LE((i + 1) * 2) : s;
    pcm16k.writeInt16LE(Math.round((s + next) / 2), i * 4 + 2);
  }
  return pcm16k;
}
```

### 2.6 Low-Latency Best Practices

| Practice | Config | Notes |
|----------|--------|-------|
| Use `eleven_turbo_v2_5` | `model_id: "eleven_turbo_v2_5"` | Fastest, multilingual, ~200ms TTFB |
| Request μ-law directly | `output_format: "ulaw_8000"` | Skip post-processing |
| Enable `optimize_streaming_latency` | `?optimize_streaming_latency=4` | Max latency reduction |
| Stream by sentence | Split on `.!?` | Don't wait for full Gemini response |
| Keep WS connections warm | Pre-open before first audio | Save ~100ms per call |
| Use `flush: true` for last chunk | Signals end without delay | Avoids TTS buffer hold |

---

## 3. Dynamic Voice Provider System

### 3.1 Provider Registry Design

The system resolves which STT/TTS provider to use based on:
1. **Agent-level** config (`ai_agents.voice_provider`, `ai_agents.transcriber`)
2. **Organization default** (`platform_settings`)
3. **Hardcoded fallback** (`Twilio <Say>` — always available)

```typescript
// src/lib/voice/providerFactory.ts

export type STTProvider = "elevenlabs" | "deepgram" | "twilio_gather";
export type TTSProvider = "elevenlabs" | "twilio_say" | "google" | "azure";

export interface VoiceProviderConfig {
  stt: STTProvider;
  tts: TTSProvider;
  ttsVoiceId: string;
  ttsModel: string;
  ttsSpeed: number;
  ttsTemperature: number;
  language: string;
  elevenLabsApiKey?: string;
}

export async function resolveVoiceProvider(
  agentId: string
): Promise<VoiceProviderConfig> {
  const agent = await getAgentById(agentId);  // reads V6 columns
  const elevenLabsKey = await getPlatformSetting("ELEVENLABS_API_KEY")
    || process.env.ELEVENLABS_API_KEY || "";

  // Agent explicitly configured → use it
  if (agent.voice_provider === "elevenlabs" && elevenLabsKey && agent.voice_id) {
    return {
      stt: agent.transcriber === "elevenlabs" ? "elevenlabs" : "twilio_gather",
      tts: "elevenlabs",
      ttsVoiceId: agent.voice_id,
      ttsModel: process.env.ELEVENLABS_DEFAULT_MODEL || "eleven_turbo_v2_5",
      ttsSpeed: agent.voice_speed ?? 1.0,
      ttsTemperature: agent.voice_temperature ?? 0.8,
      language: agent.language,
      elevenLabsApiKey: elevenLabsKey,
    };
  }

  // Default: Twilio-native (backward compatible)
  return {
    stt: "twilio_gather",
    tts: "twilio_say",
    ttsVoiceId: agent.tts_voice || "Polly.Matthew",
    ttsModel: "",
    ttsSpeed: 1.0,
    ttsTemperature: 0.8,
    language: agent.language,
  };
}
```

### 3.2 Provider Selection Logic

```
                    ┌─────────────────────────────────┐
         Inbound    │  resolveVoiceProvider(agentId)  │
         call ─────►│                                 │
                    │  agent.voice_provider?           │
                    │                                 │
                    │  ┌──────────────────────────┐   │
                    │  │ "elevenlabs" + valid key? │   │
                    │  │ + voice_id configured?   │   │
                    │  └────────────┬─────────────┘   │
                    │               │                 │
                    │        YES    │    NO           │
                    │               ▼    ▼            │
                    │    ElevenLabs    Twilio <Say>   │
                    │    Media Stream  + <Gather>     │
                    └─────────────────────────────────┘
                              │           │
                    Requires  │           │  Uses
                    separate  │           │  existing
                    WS server │           │  webhooks
```

### 3.3 Runtime Provider Switching

The system supports switching providers mid-deployment without code changes:

```typescript
// Switching via platform_settings UI (Settings → Platform)
// or via API:
await fetch("/api/settings/platform", {
  method: "POST",
  body: JSON.stringify({
    key: "DEFAULT_VOICE_PROVIDER",
    value: "elevenlabs"
  })
});

// Switching per-agent (Settings → Agents → Edit):
await fetch(`/api/agents/${agentId}`, {
  method: "PATCH",
  body: JSON.stringify({
    voice_provider: "elevenlabs",
    voice_id: "pNInz6obpgDQGcFmaJgB",
    transcriber: "elevenlabs"
  })
});
```

---

## 4. AI Agent Voice Assignment

### 4.1 Database Schema (V6 Columns Already Applied)

Your `ai_agents` table already has these columns from `V6_agent_config_columns.sql`:

```sql
-- Voice configuration (already in your DB)
voice_provider     TEXT NOT NULL DEFAULT 'browser',  -- 'elevenlabs' | 'browser' | 'twilio_say'
voice_id           TEXT,                              -- ElevenLabs voice_id
voice_speed        NUMERIC(3,1) NOT NULL DEFAULT 1.0,
voice_temperature  NUMERIC(3,2) NOT NULL DEFAULT 0.8,
transcriber        TEXT NOT NULL DEFAULT 'deepgram',  -- 'elevenlabs' | 'deepgram' | 'twilio_gather'
agent_speaks_first BOOLEAN NOT NULL DEFAULT true,
first_message      TEXT,                              -- Agent's opening line
model_provider     TEXT NOT NULL DEFAULT 'gemini',
model_id           TEXT NOT NULL DEFAULT 'gemini-2.5-flash',
```

### 4.2 Extended AgentConfig Type

Update `src/lib/supabase/agentRouter.ts` to include V6 fields:

```typescript
// Extended AgentConfig — reads V6 columns
export interface AgentConfig {
  id: string;
  name: string;
  department: string;
  voice_model: string;         // legacy: maps to model_id
  system_prompt: string | null;
  language: string;
  tts_voice: string;           // legacy: Twilio Polly voice

  // V6 ElevenLabs fields
  voice_provider: string;      // 'elevenlabs' | 'browser' | 'twilio_say'
  voice_id: string | null;     // ElevenLabs voice ID
  voice_speed: number;
  voice_temperature: number;
  transcriber: string;         // 'elevenlabs' | 'deepgram' | 'twilio_gather'
  agent_speaks_first: boolean;
  first_message: string | null;
  model_provider: string;      // 'gemini'
  model_id: string;            // 'gemini-2.5-flash'

  kb_document_ids: string[];
  connector_ids: string[];
}
```

### 4.3 Assigning a Voice to an Agent (UI Flow)

The agent editor at `/agents` already has `voice_provider` in the form. The PATCH API
at `/api/agents/[id]` accepts these fields. Here's the complete assignment payload:

```typescript
// Full voice assignment payload
const voiceAssignment = {
  voice_provider: "elevenlabs",
  voice_id: "pNInz6obpgDQGcFmaJgB",        // Rachel — English
  voice_speed: 1.0,
  voice_temperature: 0.75,
  transcriber: "elevenlabs",
  agent_speaks_first: true,
  first_message: "Thank you for calling. I'm your AI assistant. How can I help?",
  model_provider: "gemini",
  model_id: "gemini-2.5-flash",
  language: "en",
};

await fetch(`/api/agents/${agentId}`, {
  method: "PATCH",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(voiceAssignment),
});
```

### 4.4 Recommended Voice Assignments by Department

| Department | Voice ID | Voice Name | Language | Model |
|-----------|----------|------------|----------|-------|
| Customer Support | `pNInz6obpgDQGcFmaJgB` | Rachel | en-US | eleven_turbo_v2_5 |
| Sales | `ErXwobaYiN019PkySvjV` | Antoni | en-US | eleven_turbo_v2_5 |
| Dealer Desk (Bangla) | `21m00Tcm4TlvDq8ikWAM` | Adam | bn | eleven_turbo_v2_5 |
| Technical Support | `AZnzlk1XvdvUeBnXmlld` | Domi | en-US | eleven_turbo_v2_5 |
| After Hours IVR | `EXAVITQu4vr4xnSDxMaL` | Bella | en-US | eleven_flash_v2_5 |

### 4.5 Phone Number → Agent → Voice Chain

```
phone_numbers.e164 = "+8801700000000"
    │
    ├── ai_agent_id → ai_agents.id
    │       │
    │       ├── voice_provider = "elevenlabs"
    │       ├── voice_id = "pNInz6obpgDQGcFmaJgB"
    │       ├── transcriber = "elevenlabs"
    │       ├── language = "en"
    │       └── system_prompt = "You are Rachel, a CRM support agent..."
    │
    └── meta.language = "en"         (override per phone number)
        meta.tts_voice = "Polly.Matthew"  (legacy fallback)
```

The `resolveVoiceProvider(agentId)` function (Section 3) reads all these columns and
returns the correct provider config for each call.

---

## 5. Realtime Testing UI

### 5.1 Test Voice Agent Console

The testing UI allows developers and operators to test voice agents directly from
the browser without making a real phone call. It lives at `/settings/voice-testing`.

**Features:**
- Browser microphone input (Web Audio API)
- Real-time STT via ElevenLabs Scribe WebSocket
- AI response via existing `/api/agents/[id]/test` route
- TTS playback of AI response in browser
- WebSocket monitoring dashboard
- Live latency metrics (TTFB, STT, LLM, TTS, end-to-end)

### 5.2 Microphone Capture → ElevenLabs STT

```typescript
// src/components/voice/VoiceTestConsole.tsx (simplified core logic)

async function startMicrophoneCapture() {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      sampleRate: 16000,      // ElevenLabs STT expects 16kHz
      echoCancellation: true,
      noiseSuppression: true,
    }
  });

  const audioCtx = new AudioContext({ sampleRate: 16000 });
  const source = audioCtx.createMediaStreamSource(stream);

  // ScriptProcessorNode for raw PCM access
  const processor = audioCtx.createScriptProcessor(4096, 1, 1);
  processor.onaudioprocess = (e) => {
    const pcmFloat32 = e.inputBuffer.getChannelData(0);
    const pcmInt16 = float32ToInt16(pcmFloat32);
    sttWebSocket.send(pcmInt16.buffer);
  };

  source.connect(processor);
  processor.connect(audioCtx.destination);
}

function float32ToInt16(input: Float32Array): Int16Array {
  const output = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    output[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return output;
}
```

### 5.3 WebSocket Monitoring Dashboard

The testing console shows live WebSocket events:

```
┌─────────────────────────────────────────────────────┐
│  WebSocket Monitor                    ● Connected   │
├─────────────────────────────────────────────────────┤
│  ← STT   17:42:01.123  transcript { text: "Hello"  │
│  → TTS   17:42:01.456  text_chunk { text: "Hi th"  │
│  ← TTS   17:42:01.678  audio { bytes: 3200 }       │
│  SYS     17:42:01.890  pipeline: GEMINI_START       │
│  ← STT   17:42:02.100  transcript { is_final: true │
└─────────────────────────────────────────────────────┘
```

### 5.4 Latency Metrics Display

```typescript
interface LatencyMetrics {
  sttTTFB: number;          // Time to first STT token (ms)
  sttFinal: number;         // Time to final STT transcript (ms)
  geminiTTFB: number;       // Time to first Gemini token (ms)
  geminiComplete: number;   // Time to complete Gemini response (ms)
  ttsTTFB: number;          // Time to first TTS audio chunk (ms)
  endToEnd: number;         // Total: caller speaks → audio starts playing (ms)
}

// Displayed as:
// STT: 287ms | Gemini: 412ms | TTS: 198ms | E2E: 897ms
```

---

## 6. Twilio Media Streams Integration

### 6.1 TwiML Setup for Media Streams

When an agent is configured with `voice_provider = "elevenlabs"`, the inbound webhook
returns a `<Connect><Stream>` TwiML instead of `<Gather>`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="wss://your-bridge-server.fly.dev/voice/stream">
      <Parameter name="callSid" value="CA1234..." />
      <Parameter name="agentId" value="agent-uuid-here" />
      <Parameter name="language" value="en" />
    </Stream>
  </Connect>
</Response>
```

**Important**: The `url` must point to your **WebSocket bridge server**, not the
Next.js app. Vercel serverless functions cannot maintain persistent WebSocket connections.

### 6.2 WebSocket Bridge Architecture

The bridge server is a standalone Node.js application that runs alongside Next.js:

```
┌──────────────────────────────────────────────────────────────────┐
│  Bridge Server (Node.js — Fly.io / Railway / Render)             │
│                                                                  │
│  PORT 8080                                                       │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  WebSocket Server (ws library)                             │  │
│  │                                                            │  │
│  │  /voice/stream   ← Twilio Media Stream connection         │  │
│  │                                                            │  │
│  │  Per-connection state:                                     │  │
│  │  ├── streamSid: string                                     │  │
│  │  ├── callSid: string                                       │  │
│  │  ├── agentId: string                                       │  │
│  │  ├── sttWs: WebSocket (ElevenLabs STT)                     │  │
│  │  ├── ttsWs: WebSocket (ElevenLabs TTS)                     │  │
│  │  ├── geminiStream: AsyncIterator                           │  │
│  │  ├── isBargeIn: boolean                                    │  │
│  │  └── metrics: LatencyMetrics                               │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  HTTP GET /health    → { status: "ok", connections: N }          │
└──────────────────────────────────────────────────────────────────┘
```

### 6.3 Bidirectional Audio Streaming

Complete data flow for one conversation turn:

```
1. CALLER SPEAKS
   Twilio → Bridge WS
   { event: "media", media: { payload: "<base64 μ-law>", track: "inbound" } }

2. BRIDGE PROCESSES AUDIO
   base64 decode → μ-law buffer (160 bytes = 20ms at 8kHz)
   μ-law → PCM 16kHz (upsample) → send to ElevenLabs STT WS

3. STT TRANSCRIBES
   ElevenLabs STT WS → Bridge
   { type: "transcript", text: "What is my order status?", is_final: true }

4. GEMINI GENERATES (STREAMING)
   Bridge → Gemini API (with RAG context)
   Stream text tokens → accumulate sentences

5. TTS SYNTHESIZES (STREAMING)
   Bridge → ElevenLabs TTS WS
   Send sentence: "Your order #12345 is currently in transit."
   
   ElevenLabs TTS WS → Bridge
   { audio: "<base64 μ-law 8kHz>", isFinal: false }

6. BRIDGE PLAYS AUDIO TO CALLER
   Bridge → Twilio WS
   { event: "media", streamSid: "...", media: { payload: "<base64>", track: "outbound" } }

7. BARGE-IN (if caller speaks during TTS)
   Bridge detects audio on inbound track while TTS playing
   Bridge → Twilio: { event: "clear", streamSid }
   Bridge cancels TTS stream
   Bridge starts new STT processing
```

### 6.4 Audio Encoding Details

| Parameter | Twilio inbound | ElevenLabs STT | ElevenLabs TTS | Twilio outbound |
|-----------|----------------|----------------|----------------|-----------------|
| Format | μ-law | PCM s16le | μ-law 8000 | μ-law |
| Sample Rate | 8000 Hz | 16000 Hz | 8000 Hz | 8000 Hz |
| Bit Depth | 8-bit | 16-bit | 8-bit | 8-bit |
| Channels | Mono | Mono | Mono | Mono |
| Chunk Size | 160 bytes (20ms) | variable | variable | 160 bytes |
| Transport | base64 in JSON | binary WS frames | base64 in JSON | base64 in JSON |

### 6.5 Handling Twilio WebSocket Events

```typescript
// Key event handlers in the bridge server
switch (event.event) {
  case "start":
    streamSid = event.start.streamSid;
    callSid = event.start.callSid;
    agentId = event.start.customParameters.agentId;
    await initializePipeline(callSid, agentId, ws);
    break;

  case "media":
    if (event.media.track === "inbound") {
      const mulaw = Buffer.from(event.media.payload, "base64");
      const pcm = mulawToPcm16(mulaw);
      sttWs.send(pcm);
    }
    break;

  case "stop":
    await teardownPipeline(callSid);
    ws.close();
    break;

  case "mark":
    // TTS chunk playback complete
    handleMarkEvent(event.mark.name);
    break;
}
```

---

## 7. RAG + CRM Knowledge Base Integration

### 7.1 Real-Time RAG Pipeline

Your existing RAG pipeline in `gather/route.ts` already handles this. The Media Streams
version extends it with streaming:

```
Caller utterance (final transcript)
        │
        ├─► Intent detection (voiceIntent.ts)
        │   └── confidence score, escalation flag
        │
        ├─► KB semantic search (searchKbChunks)
        │   └── pgvector cosine similarity on kb_chunks
        │   └── Returns top-5 relevant chunks
        │
        ├─► CRM context (fetchConnectorCrmContext)
        │   └── connector-based retrieval (synced CRM data)
        │   └── fallback: product-context API proxy
        │
        ▼
   Build system prompt (buildAgentSystemPrompt)
        │
        ├── Agent personality + instructions
        ├── CRM context block (customer order history, etc.)
        ├── KB context block (policies, FAQs, product docs)
        └── Language + department framing
        │
        ▼
   Gemini streaming generation
        │
        ├─► Stream text tokens
        ├─► Accumulate into sentences (split on .!?)
        └─► Each sentence → ElevenLabs TTS → Twilio playback
```

### 7.2 Streaming Gemini for Lower Latency

In the Media Streams path, Gemini tokens are streamed (not waited for):

```typescript
// src/lib/gemini/streamingGeneration.ts
import { GoogleGenAI } from "@google/genai";

export async function* streamGeminiResponse(
  messages: { role: string; content: string }[],
  systemPrompt: string,
  model = "gemini-2.5-flash"
): AsyncGenerator<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_GEMINI_API_KEY! });
  
  const history = messages.slice(0, -1).map(m => ({
    role: m.role === "user" ? "user" as const : "model" as const,
    parts: [{ text: m.content }],
  }));
  
  const lastMessage = messages[messages.length - 1];
  
  const chat = ai.chats.create({
    model,
    config: { systemInstruction: systemPrompt },
    history,
  });

  const stream = await chat.sendMessageStream({ message: lastMessage.content });
  
  for await (const chunk of stream) {
    if (chunk.text) yield chunk.text;
  }
}

// Sentence accumulator for TTS streaming
export function* accumulateSentences(
  tokens: AsyncGenerator<string>
): AsyncGenerator<string> {
  let buffer = "";
  const sentenceEnd = /[.!?]+\s/;
  
  for await (const token of tokens) {
    buffer += token;
    const match = buffer.search(sentenceEnd);
    if (match !== -1) {
      yield buffer.slice(0, match + 1).trim();
      buffer = buffer.slice(match + 1).trimStart();
    }
  }
  if (buffer.trim()) yield buffer.trim();
}
```

### 7.3 CRM Data Integration Flow

```
Voice utterance: "What's my order status for order 12345?"
        │
        ▼
Intent detection: { intent: "order_status_check", confidence: 94 }
        │
        ▼
Vector search on kb_chunks:
  SELECT content FROM kb_chunks
  WHERE kb_document_id = ANY(agent.kb_document_ids)
  ORDER BY embedding <=> query_embedding
  LIMIT 5;
  → Returns: shipping policy, tracking instructions
        │
        ▼
Connector CRM retrieval (fetchConnectorCrmContext):
  connector_type = "rest_api"
  → GET /api/orders?phone=+8801700000000
  → Returns: { order: "12345", status: "In Transit", eta: "2026-05-16" }
        │
        ▼
System prompt injection:
  [CRM Context]
  Customer phone: +8801700000000
  Order #12345: In Transit
  Estimated delivery: May 16, 2026
  
  [Knowledge Base]
  Shipping Policy: Orders take 3-5 business days...
        │
        ▼
Gemini response: "Your order #12345 is currently in transit and
  estimated to arrive by May 16th. Is there anything else I can help you with?"
        │
        ▼
TTS: ElevenLabs streams audio while Gemini is still generating
```

---

## 8. Production Deployment & Scaling

### 8.1 Deployment Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    PRODUCTION ARCHITECTURE                      │
│                                                                 │
│  ┌──────────────┐    ┌──────────────────────────────────────┐   │
│  │   Vercel     │    │          Fly.io / Railway            │   │
│  │  (Next.js)   │    │         (Bridge Server)              │   │
│  │              │    │                                      │   │
│  │  /api/*      │    │  wss://bridge.your-app.com/voice/*   │   │
│  │  webhooks    │    │                                      │   │
│  │  REST API    │    │  Node.js 20 LTS                      │   │
│  │  Dashboard   │    │  2 CPU, 512MB RAM per instance       │   │
│  │              │    │  Auto-scale 1→10 instances           │   │
│  └──────┬───────┘    └───────────────────┬──────────────────┘   │
│         │                               │                       │
│         │            ┌──────────────────┤                       │
│         ▼            ▼                  ▼                       │
│  ┌────────────┐ ┌──────────┐  ┌─────────────────┐              │
│  │  Supabase  │ │ Twilio   │  │  ElevenLabs API │              │
│  │ (Postgres  │ │ (Media   │  │  (STT + TTS)    │              │
│  │  Realtime) │ │ Streams) │  └─────────────────┘              │
│  └────────────┘ └──────────┘                                    │
└─────────────────────────────────────────────────────────────────┘
```

### 8.2 Vercel Deployment Considerations

**What works on Vercel:**
- All existing REST webhooks (`/api/webhooks/voice/*`)
- The fallback `<Gather>` + `<Say>` pipeline
- Dashboard, agent CRUD, settings
- ElevenLabs TTS for pre-generated audio files

**What does NOT work on Vercel:**
- Persistent WebSocket connections (15s max function execution)
- Twilio Media Streams bridge (requires persistent WS)

**Solution**: Deploy bridge server separately:

```bash
# Fly.io deployment (recommended — fastest global network)
fly launch --name crm-voice-bridge
fly scale count 2  # min 2 for HA
fly secrets set ELEVENLABS_API_KEY=sk_...
fly secrets set GOOGLE_GEMINI_API_KEY=...
fly secrets set SUPABASE_SERVICE_ROLE_KEY=...
fly deploy
```

### 8.3 Environment Variables — Complete Reference

```bash
# === EXISTING (already in .env.local) ===
GOOGLE_GEMINI_API_KEY=...
GEMINI_MODEL=gemini-2.5-flash
GEMINI_MODEL_FALLBACK=gemini-2.0-flash
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_WEBHOOK_BASE_URL=https://your-app.vercel.app
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...

# === NEW — Add to .env.local ===
ELEVENLABS_API_KEY=sk_...
ELEVENLABS_DEFAULT_VOICE_ID=pNInz6obpgDQGcFmaJgB
ELEVENLABS_DEFAULT_MODEL=eleven_turbo_v2_5
ELEVENLABS_STT_MODEL=scribe_v1

# Bridge server URL (your Fly.io / Railway deployment)
VOICE_BRIDGE_WS_URL=wss://crm-voice-bridge.fly.dev/voice/stream
VOICE_BRIDGE_HTTP_URL=https://crm-voice-bridge.fly.dev

# Feature flags
ELEVENLABS_ENABLED=true           # Master switch for ElevenLabs
VOICE_MEDIA_STREAMS_ENABLED=true  # Enable Twilio Media Streams mode
```

### 8.4 Latency Optimization by Region

Deploy bridge server in same region as Twilio's media servers:

| Twilio Edge | Recommended Fly.io Region | Latency Gain |
|-------------|---------------------------|--------------|
| US East | `iad` (Ashburn VA) | ~30ms |
| US West | `sjc` (San Jose CA) | ~30ms |
| EU | `ams` (Amsterdam) | ~30ms |
| Asia Pacific | `sin` (Singapore) | ~30ms |
| South Asia | `bom` (Mumbai) | ~30ms |

Set in `fly.toml`:
```toml
[env]
  PRIMARY_REGION = "sin"  # Singapore for South Asia traffic
```

### 8.5 Monitoring & Observability

**Supabase Realtime** (already configured for live dashboard):
```sql
-- Already in your publication: voice_pipeline_events, call_sessions
-- Add bridge server events to the same tables via REST API
```

**Structured logging** (add to bridge server):
```typescript
// Structured JSON logs → Fly.io / Railway log aggregation
const log = {
  ts: Date.now(),
  callSid,
  step: "STT_FINAL",
  latencyMs: Date.now() - sttStart,
  textLen: transcript.length,
};
console.log(JSON.stringify(log));
```

**Sentry integration** (optional):
```typescript
import * as Sentry from "@sentry/node";
Sentry.init({ dsn: process.env.SENTRY_DSN, tracesSampleRate: 0.1 });
```

**Key metrics to track:**
- `stt_ttfb_ms` — P50, P95, P99
- `gemini_ttfb_ms` — P50, P95
- `tts_ttfb_ms` — P50, P95
- `end_to_end_ms` — P50, P95, P99
- `barge_in_count` — per call
- `ws_disconnect_rate` — should be < 1%

### 8.6 Rate Limiting & Quotas

**ElevenLabs limits:**
| Plan | Concurrent STT WS | Concurrent TTS WS | Monthly chars |
|------|-------------------|-------------------|---------------|
| Starter | 2 | 2 | 30,000 |
| Creator | 10 | 10 | 100,000 |
| Pro | 50 | 50 | 500,000 |
| Business | 200 | 200 | 2M+ |

**Implement a connection pool:**
```typescript
// src/lib/elevenlabs/connectionPool.ts
const MAX_CONCURRENT = Number(process.env.ELEVENLABS_MAX_CONCURRENT) || 10;
let activeConnections = 0;

export async function acquireConnection(): Promise<() => void> {
  if (activeConnections >= MAX_CONCURRENT) {
    throw new Error("ElevenLabs connection pool exhausted");
    // → fallback to Twilio <Say>
  }
  activeConnections++;
  return () => { activeConnections--; };
}
```

### 8.7 Cost Management

**ElevenLabs pricing estimates** (as of 2026):
- STT: ~$0.40/hour of audio
- TTS: ~$0.18/1000 characters (`eleven_turbo_v2_5`)
- Average call: ~3 mins, ~500 chars AI response
- Cost per call: ~$0.02 STT + ~$0.09 TTS = ~$0.11/call

**Optimization levers:**
1. Use `eleven_flash_v2_5` for after-hours IVR (lower quality, half cost)
2. Cache common responses (welcome message, hold music)
3. Implement circuit breaker → fall back to Twilio `<Say>` on quota

---

## 9. Troubleshooting Guide

### 9.1 No Audio / Delayed Speech

**Symptom**: Caller hears silence or long pause before AI responds.

**Diagnosis checklist:**
```bash
# 1. Check ElevenLabs API key
curl -H "xi-api-key: $ELEVENLABS_API_KEY" \
  https://api.elevenlabs.io/v1/user

# 2. Check bridge server health
curl https://crm-voice-bridge.fly.dev/health

# 3. Check Twilio Media Stream URL in TwiML
# Should be: wss://crm-voice-bridge.fly.dev/voice/stream
# Common mistake: wss://your-app.vercel.app/api/voice/media (returns 501)

# 4. Check ngrok is running (dev only)
curl http://localhost:4040/api/tunnels
```

**Common causes:**

| Cause | Fix |
|-------|-----|
| Bridge WS URL wrong in TwiML | Set `VOICE_BRIDGE_WS_URL` correctly |
| ElevenLabs key expired | Rotate in platform_settings |
| Bridge server not deployed | Deploy to Fly.io |
| `voice_provider` not set on agent | Set to `"elevenlabs"` in agent settings |
| `voice_id` missing | Assign a voice ID to the agent |

### 9.2 High Latency

**Target**: < 1.5s end-to-end. **Problem**: > 2.5s.

**Diagnosis:**
```typescript
// Enable verbose timing in bridge server
VOICE_DEBUG_TIMING=true fly secrets set VOICE_DEBUG_TIMING=true

// Check pipeline_events table
SELECT step, duration_ms FROM voice_pipeline_events
WHERE call_id = 'CA...' ORDER BY created_at;
```

**Step-by-step fixes:**

| Step | Target | Fix |
|------|--------|-----|
| STT TTFB > 500ms | < 300ms | Check network to ElevenLabs; use nearest region |
| Gemini TTFB > 800ms | < 500ms | Switch to `gemini-2.0-flash` |
| TTS TTFB > 400ms | < 250ms | Add `?optimize_streaming_latency=4` |
| Network > 300ms | < 100ms | Deploy bridge server closer to Twilio |

### 9.3 WebSocket Disconnections

**Symptom**: Calls drop mid-conversation; bridge logs show `ECONNRESET`.

**Causes and fixes:**
```typescript
// 1. Add ping/keepalive to bridge server
const PING_INTERVAL = 30_000;
const pingInterval = setInterval(() => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.ping();
  }
}, PING_INTERVAL);

// 2. Implement reconnection for ElevenLabs STT WS
async function connectSTT(retries = 3): Promise<WebSocket> {
  for (let i = 0; i < retries; i++) {
    try {
      return await openElevenLabsSTT();
    } catch (e) {
      if (i === retries - 1) throw e;
      await sleep(500 * (i + 1));
    }
  }
  throw new Error("STT connect failed");
}

// 3. Handle Twilio 5-minute WebSocket limit
// Twilio closes Media Stream WS after 5 mins by default
// Solution: Use <Connect><Stream/></Connect> without timeout param
// Or: Restart the stream via TwiML redirect
```

### 9.4 Transcription Failures

**Symptom**: `sttWs.on("message")` never fires, or `is_final` never true.

```typescript
// Debug: Log all STT messages
sttWs.on("message", (data) => {
  const event = JSON.parse(data.toString());
  console.log("[STT RAW]", JSON.stringify(event));
  // Check for: event.type === "error" with error message
});

// Common issues:
// 1. Wrong language_code → use "en" not "en-US" for ElevenLabs
// 2. Sending audio before config message → wait for "open" event
// 3. Wrong audio format → must be PCM 16kHz int16 for STT
// 4. Silence too long → inactivity_timeout fires → reconnect STT
```

### 9.5 Voice Assignment Bugs

**Symptom**: Wrong voice plays, or Twilio `<Say>` used instead of ElevenLabs.

```typescript
// Debug: Log provider resolution
const provider = await resolveVoiceProvider(agentId);
console.log("[provider]", JSON.stringify(provider, null, 2));

// Check:
// 1. agent.voice_provider === "elevenlabs"?
// 2. agent.voice_id is set and valid?
// 3. ELEVENLABS_API_KEY present?
// 4. ELEVENLABS_ENABLED === "true"?

// If TwiML shows <Gather> instead of <Connect><Stream>:
// → voice_provider is not "elevenlabs" → check DB
// → VOICE_MEDIA_STREAMS_ENABLED is not "true"
// → VOICE_BRIDGE_WS_URL is not set
```

### 9.6 Interrupt / Barge-In Problems

**Symptom**: AI keeps talking after caller starts speaking.

```typescript
// The bridge must detect caller audio WHILE TTS is playing
// This requires reading the "inbound" track during outbound playback

// Common issue: not tracking which track has audio
ws.on("message", (raw) => {
  const event = JSON.parse(raw.toString());
  if (event.event === "media") {
    const track = event.media.track;  // "inbound" or "outbound"
    if (track === "inbound" && isPlayingTTS) {
      triggerBargeIn();  // Clear Twilio buffer + cancel TTS
    }
  }
});

// Also ensure Twilio stream has bidirectional tracks:
// <Stream track="both_tracks"> — not just "inbound_track"
```

---

## 10. Folder Structure, ENV Variables & Code Examples

### 10.1 Updated Project Structure

```
crm-mvp/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── webhooks/voice/
│   │   │   │   ├── inbound/route.ts     ← MODIFIED: Media Streams branch
│   │   │   │   ├── gather/route.ts      ← unchanged (fallback path)
│   │   │   │   └── status/route.ts
│   │   │   ├── voice/
│   │   │   │   ├── media/route.ts       ← MODIFIED: redirect to bridge
│   │   │   │   └── tts-preview/route.ts ← NEW: browser TTS preview
│   │   │   └── settings/platform/route.ts ← MODIFIED: adds ElevenLabs key
│   │   └── (dashboard)/
│   │       └── settings/
│   │           └── voice-testing/
│   │               └── page.tsx         ← NEW: Test console
│   ├── lib/
│   │   ├── elevenlabs/                  ← NEW directory
│   │   │   ├── client.ts               ← Base API client
│   │   │   ├── tts.ts                  ← TTS WebSocket wrapper
│   │   │   ├── stt.ts                  ← STT WebSocket wrapper
│   │   │   ├── voices.ts               ← Voice library helpers
│   │   │   ├── audio.ts                ← μ-law ↔ PCM conversion
│   │   │   └── connectionPool.ts       ← Concurrent connection limiter
│   │   ├── voice/
│   │   │   └── providerFactory.ts      ← NEW: resolveVoiceProvider()
│   │   └── supabase/
│   │       └── agentRouter.ts          ← MODIFIED: V6 columns
│   └── components/
│       └── voice/
│           └── VoiceTestConsole.tsx     ← NEW: Testing UI
├── server/
│   └── media-stream-server.ts          ← NEW: Bridge WebSocket server
├── docs/
│   └── sql/
│       └── V7_elevenlabs_settings.sql  ← NEW: DB migration
└── package.json                        ← MODIFIED: ws, @types/ws
```

### 10.2 Complete Environment Variables

```bash
# ============================================================
# EXISTING (already configured)
# ============================================================
GOOGLE_GEMINI_API_KEY=AIza...
GEMINI_MODEL=gemini-2.5-flash
GEMINI_MODEL_FALLBACK=gemini-2.0-flash
GEMINI_RETRY_MAX=3

TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_WEBHOOK_BASE_URL=https://your-app.vercel.app
TWILIO_SKIP_SIGNATURE_VERIFY=false
TWILIO_VOICE_MULTI_TURN=true
TWILIO_VOICE_DTMF_MENU=false

NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# ============================================================
# NEW — ElevenLabs Integration
# ============================================================
ELEVENLABS_API_KEY=sk_...
ELEVENLABS_DEFAULT_VOICE_ID=pNInz6obpgDQGcFmaJgB
ELEVENLABS_DEFAULT_MODEL=eleven_turbo_v2_5
ELEVENLABS_STT_MODEL=scribe_v1
ELEVENLABS_MAX_CONCURRENT=10          # Connection pool limit

# ============================================================
# NEW — Bridge Server
# ============================================================
VOICE_BRIDGE_WS_URL=wss://crm-voice-bridge.fly.dev/voice/stream
VOICE_BRIDGE_HTTP_URL=https://crm-voice-bridge.fly.dev
VOICE_BRIDGE_SECRET=shared-secret-between-nextjs-and-bridge

# ============================================================
# NEW — Feature Flags
# ============================================================
ELEVENLABS_ENABLED=true
VOICE_MEDIA_STREAMS_ENABLED=true
VOICE_DEBUG_TIMING=false
```

### 10.3 Complete Code: ElevenLabs TTS Client

See `src/lib/elevenlabs/tts.ts` (created alongside this guide).

```typescript
// Key API surface
export class ElevenLabsTTSStream {
  constructor(voiceId: string, apiKey: string, options?: TTSOptions);
  async connect(): Promise<void>;
  sendText(text: string): void;
  flush(): void;
  on(event: "audio", handler: (chunk: Buffer) => void): this;
  on(event: "done", handler: () => void): this;
  on(event: "error", handler: (err: Error) => void): this;
  async close(): Promise<void>;
}

// Usage in bridge server
const tts = new ElevenLabsTTSStream(voiceId, apiKey, {
  model: "eleven_turbo_v2_5",
  outputFormat: "ulaw_8000",   // Ready for Twilio
  speed: agent.voice_speed,
  stability: 0.5,
  similarityBoost: 0.8,
});

await tts.connect();
tts.on("audio", (chunk) => sendToTwilio(chunk));
tts.on("done", () => sendMarkToTwilio("tts-done"));

// Stream Gemini response sentences
for await (const sentence of geminiSentenceStream) {
  tts.sendText(sentence + " ");
}
tts.flush();
```

### 10.4 Complete Code: ElevenLabs STT Client

See `src/lib/elevenlabs/stt.ts` (created alongside this guide).

```typescript
// Key API surface
export class ElevenLabsSTTStream {
  constructor(apiKey: string, options?: STTOptions);
  async connect(): Promise<void>;
  sendAudio(pcm16k: Buffer): void;
  on(event: "transcript", handler: (text: string, isFinal: boolean) => void): this;
  on(event: "error", handler: (err: Error) => void): this;
  async close(): Promise<void>;
}

// Usage in bridge server
const stt = new ElevenLabsSTTStream(apiKey, {
  model: "scribe_v1",
  language: agent.language === "bn" ? "bn" : "en",
});

await stt.connect();
stt.on("transcript", async (text, isFinal) => {
  if (isFinal && text.trim()) {
    await runGeminiPipeline(text, callSid, agentConfig);
  }
});

// In Twilio media event handler:
const mulaw = Buffer.from(event.media.payload, "base64");
const pcm = mulawToPcm16(mulaw);
stt.sendAudio(pcm);
```

### 10.5 Complete Code: Media Stream Bridge Server

See `server/media-stream-server.ts` (created alongside this guide).

```typescript
// Startup command
// Development: npx ts-node server/media-stream-server.ts
// Production: fly deploy (uses Dockerfile)

// Health check
GET /health → { status: "ok", connections: 3, uptime: 12345 }

// WebSocket endpoint
WS /voice/stream ← Twilio connects here
  Handles: start, media (inbound/outbound), stop, mark events
  Manages: STT + TTS + Gemini pipeline per connection
```

### 10.6 Updated `agentRouter.ts` — V6 Fields

See `src/lib/supabase/agentRouter.ts` (modified alongside this guide).

The key change is the `select()` query now includes V6 columns:

```typescript
.select(`
  id, name, department, voice_model, system_prompt, status,
  voice_provider, voice_id, voice_speed, voice_temperature,
  transcriber, agent_speaks_first, first_message,
  model_provider, model_id
`)
```

### 10.7 Inbound Webhook — Media Streams Branch

When `voice_provider === "elevenlabs"` AND `VOICE_MEDIA_STREAMS_ENABLED=true`,
the inbound webhook returns Media Streams TwiML instead of `<Gather>`:

```typescript
// In /api/webhooks/voice/inbound/route.ts
const provider = await resolveVoiceProvider(agent.id);

if (provider.tts === "elevenlabs" && process.env.VOICE_MEDIA_STREAMS_ENABLED === "true") {
  const bridgeUrl = escapeXml(
    `${process.env.VOICE_BRIDGE_WS_URL}?agentId=${agent.id}&lang=${agent.language}`
  );
  return twiml(`<Response>
  <Connect>
    <Stream url="${bridgeUrl}">
      <Parameter name="callSid" value="${escapeXml(callSid)}" />
      <Parameter name="agentId" value="${escapeXml(agent.id)}" />
      <Parameter name="language" value="${escapeXml(agent.language)}" />
    </Stream>
  </Connect>
</Response>`);
}

// Otherwise fall through to existing <Gather> logic
```

---

## Quick Start Checklist

### For Developers New to This Codebase

```
□ 1. Run existing app: npm run dev (verify /api/health/*)
□ 2. Add ELEVENLABS_API_KEY to .env.local
□ 3. Run V7 SQL migration: docs/sql/V7_elevenlabs_settings.sql
□ 4. Set voice_provider="elevenlabs" on one agent in DB or UI
□ 5. Install new deps: npm install ws @types/ws
□ 6. Start bridge server: npx ts-node server/media-stream-server.ts
□ 7. Expose bridge: ngrok http 8080 → copy wss URL
□ 8. Set VOICE_BRIDGE_WS_URL in .env.local
□ 9. Set VOICE_MEDIA_STREAMS_ENABLED=true
□ 10. Test via /settings/voice-testing (browser mic test)
□ 11. Make a real call to your Twilio number → verify ElevenLabs voice
□ 12. Check Supabase voice_pipeline_events for timing data
```

### Production Launch Checklist

```
□ Deploy Next.js to Vercel (existing flow)
□ Deploy bridge server to Fly.io
□ Set all production env vars on Vercel + Fly
□ Update Twilio webhook URL to Vercel deployment
□ Configure Twilio Media Stream URL to Fly.io bridge
□ Test load: 10 concurrent calls
□ Set up Sentry for error tracking
□ Configure alert: end_to_end_ms P95 > 3000ms
□ Set up Supabase pg_cron to clean old pipeline events (> 30 days)
□ Verify ElevenLabs plan limits match expected call volume
```

---

*Generated for the `/crm-mvp` codebase. Stack: Next.js 14 · ElevenLabs · Twilio · Gemini · Supabase.*
*Bridge server: Node.js · WebSocket (ws) · Fly.io*
