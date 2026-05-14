/**
 * Dynamic voice provider factory.
 * Resolves which STT/TTS provider to use for a given AI agent.
 *
 * Priority:
 *   1. Agent-level config (ai_agents.voice_provider, ai_agents.transcriber)
 *   2. Platform default (platform_settings.DEFAULT_VOICE_PROVIDER)
 *   3. Hardcoded fallback (Twilio <Say> — always available)
 *
 * Reads V6 agent columns: voice_provider, voice_id, voice_speed,
 * voice_temperature, transcriber, agent_speaks_first, first_message
 */

import { getAgentByIdV6 } from "@/lib/supabase/agentRouter";
import { getPlatformSetting } from "@/lib/platformSettings";

export type STTProvider = "elevenlabs" | "deepgram" | "twilio_gather";
export type TTSProvider = "elevenlabs" | "twilio_say" | "google" | "azure";

export interface VoiceProviderConfig {
  /** Speech-to-text provider */
  stt: STTProvider;

  /** Text-to-speech provider */
  tts: TTSProvider;

  /** Voice identifier (ElevenLabs voice_id or Twilio Polly name) */
  ttsVoiceId: string;

  /** TTS model (ElevenLabs model_id or empty for Twilio) */
  ttsModel: string;

  /** Playback speed multiplier (0.5 – 2.0) */
  ttsSpeed: number;

  /** Voice temperature / expressiveness (0.0 – 1.0) */
  ttsTemperature: number;

  /** BCP-47 language code */
  language: string;

  /** ElevenLabs API key (only set when provider = elevenlabs) */
  elevenLabsApiKey?: string;

  /** Whether agent should speak the opening message first */
  agentSpeaksFirst: boolean;

  /** Opening message text (for Media Streams — spoken when call connects) */
  firstMessage: string;

  /** Whether full Media Streams / WebSocket pipeline is available */
  useMediaStreams: boolean;
}

/**
 * Resolve the voice provider configuration for a specific agent.
 *
 * @param agentId - UUID of the ai_agents row
 * @returns VoiceProviderConfig ready for use in inbound webhook + bridge server
 */
export async function resolveVoiceProvider(
  agentId: string
): Promise<VoiceProviderConfig> {
  const [agent, elevenLabsKey] = await Promise.all([
    getAgentByIdV6(agentId),
    resolveElevenLabsKey(),
  ]);

  const mediaStreamsEnabled =
    process.env.VOICE_MEDIA_STREAMS_ENABLED === "true" &&
    Boolean(process.env.VOICE_BRIDGE_WS_URL?.trim());

  // Agent explicitly configured for ElevenLabs
  if (
    agent.voice_provider === "elevenlabs" &&
    elevenLabsKey &&
    agent.voice_id &&
    mediaStreamsEnabled
  ) {
    const stt: STTProvider =
      agent.transcriber === "elevenlabs" ? "elevenlabs" : "twilio_gather";

    return {
      stt,
      tts: "elevenlabs",
      ttsVoiceId: agent.voice_id,
      ttsModel:
        process.env.ELEVENLABS_DEFAULT_MODEL || "eleven_turbo_v2_5",
      ttsSpeed: agent.voice_speed ?? 1.0,
      ttsTemperature: agent.voice_temperature ?? 0.8,
      language: agent.language || "en",
      elevenLabsApiKey: elevenLabsKey,
      agentSpeaksFirst: agent.agent_speaks_first ?? true,
      firstMessage:
        agent.first_message ||
        `Thank you for calling. I'm ${agent.name}. How can I help you today?`,
      useMediaStreams: true,
    };
  }

  // Fallback: Twilio native (<Say> + <Gather>)
  return {
    stt: "twilio_gather",
    tts: "twilio_say",
    ttsVoiceId: agent.tts_voice || "Polly.Matthew",
    ttsModel: "",
    ttsSpeed: 1.0,
    ttsTemperature: 0.8,
    language: agent.language || "en",
    agentSpeaksFirst: agent.agent_speaks_first ?? true,
    firstMessage:
      agent.first_message ||
      `Thanks for calling. You're speaking with ${agent.name}. After the tone, say your question.`,
    useMediaStreams: false,
  };
}

/**
 * Resolve ElevenLabs API key from env or platform_settings.
 * Returns empty string if not configured (no throw — allows graceful fallback).
 */
async function resolveElevenLabsKey(): Promise<string> {
  // 1. Process env (fastest)
  const envKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (envKey) return envKey;

  // 2. Platform settings DB
  try {
    const dbKey = await getPlatformSetting("ELEVENLABS_API_KEY");
    return dbKey?.trim() || "";
  } catch {
    return "";
  }
}

/**
 * Generate the TwiML response for an inbound call based on provider config.
 * Returns XML string without the <?xml?> declaration.
 */
export function buildInboundTwiML(
  config: VoiceProviderConfig,
  callSid: string,
  agentId: string,
  gatherUrl: string,
  speechLang: string
): string {
  if (config.useMediaStreams && config.tts === "elevenlabs") {
    const bridgeUrl = process.env.VOICE_BRIDGE_WS_URL || "";
    const streamUrl = `${bridgeUrl}?agentId=${encodeURIComponent(agentId)}&lang=${encodeURIComponent(config.language)}`;

    // Media Streams path — full ElevenLabs pipeline
    return `<Response>
  <Connect>
    <Stream url="${escapeXmlAttr(streamUrl)}">
      <Parameter name="callSid" value="${escapeXmlAttr(callSid)}" />
      <Parameter name="agentId" value="${escapeXmlAttr(agentId)}" />
      <Parameter name="language" value="${escapeXmlAttr(config.language)}" />
    </Stream>
  </Connect>
</Response>`;
  }

  // Twilio native path — backward compatible
  const prompt = escapeXml(config.firstMessage);
  const reprompt = escapeXml("Sorry, I did not catch that. Please try once more.");
  const goodbye = escapeXml("We could not hear you. Please call again soon. Goodbye.");
  const ttsVoice = config.ttsVoiceId;

  return `<Response>
  <Gather input="speech" action="${escapeXmlAttr(gatherUrl)}" method="POST" speechTimeout="auto" language="${escapeXmlAttr(speechLang)}">
    <Say voice="${escapeXmlAttr(ttsVoice)}">${prompt}</Say>
  </Gather>
  <Gather input="speech" action="${escapeXmlAttr(gatherUrl)}" method="POST" speechTimeout="3" language="${escapeXmlAttr(speechLang)}">
    <Say voice="${escapeXmlAttr(ttsVoice)}">${reprompt}</Say>
  </Gather>
  <Say voice="${escapeXmlAttr(ttsVoice)}">${goodbye}</Say>
</Response>`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function escapeXmlAttr(str: string): string {
  return escapeXml(str);
}
