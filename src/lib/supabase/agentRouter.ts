import { getSupabaseAdmin } from "@/lib/supabase/admin";

export interface AgentConfig {
  id: string;
  name: string;
  department: string;
  voice_model: string;
  system_prompt: string | null;
  language: string;
  tts_voice: string;
  kb_document_ids: string[];
  connector_ids: string[];
}

/** Extended agent config — includes V6 ElevenLabs / voice provider columns */
export interface AgentConfigV6 extends AgentConfig {
  voice_provider: string;         // 'elevenlabs' | 'browser' | 'twilio_say'
  voice_id: string | null;        // ElevenLabs voice ID
  voice_speed: number;            // 0.5 – 2.0
  voice_temperature: number;      // 0.0 – 1.0
  transcriber: string;            // 'elevenlabs' | 'deepgram' | 'twilio_gather'
  agent_speaks_first: boolean;
  first_message: string | null;
  model_provider: string;         // 'gemini'
  model_id: string;               // 'gemini-2.5-flash'
}

const DEFAULT_AGENT: AgentConfig = {
  id: process.env.VOICE_DEFAULT_AGENT_ID?.trim() || "agent-support-1",
  name: "AI Support Agent",
  department: "Support",
  voice_model: "gemini-2.5-flash",
  system_prompt: null,
  language: "en",
  tts_voice: "Polly.Matthew",
  kb_document_ids: [],
  connector_ids: [],
};

/**
 * Looks up the AI agent assigned to a given `To` E.164 number via the
 * `phone_numbers` → `ai_agents` join. Returns a rich AgentConfig so that
 * the gather handler can build a per-agent system prompt, language, and TTS voice.
 *
 * Falls back to DEFAULT_AGENT when no mapping exists so the call always succeeds.
 */
export async function lookupAgentByPhoneNumber(
  toE164: string
): Promise<AgentConfig> {
  const admin = getSupabaseAdmin();
  if (!admin || !toE164?.trim()) return DEFAULT_AGENT;

  try {
    const { data, error } = await admin
      .from("phone_numbers")
      .select(
        `
        ai_agent_id,
        meta,
        ai_agents (
          id,
          name,
          department,
          voice_model,
          system_prompt,
          status
        )
      `
      )
      .eq("e164", toE164.trim())
      .maybeSingle();

    if (error || !data) return DEFAULT_AGENT;

    // phone_numbers row may have no agent assigned
    const agentRow = (data as Record<string, unknown>).ai_agents as
      | Record<string, unknown>
      | null;
    if (!agentRow || agentRow.status === "inactive") return DEFAULT_AGENT;

    // Pull language / tts settings from phone_numbers.meta if present
    const meta = ((data as Record<string, unknown>).meta as Record<string, unknown>) ?? {};
    const language = (meta.language as string) ?? "en";
    const ttsVoice = (meta.tts_voice as string) ?? deriveTtsVoice(language);

    return {
      id: String(agentRow.id ?? DEFAULT_AGENT.id),
      name: String(agentRow.name ?? DEFAULT_AGENT.name),
      department: String(agentRow.department ?? DEFAULT_AGENT.department),
      voice_model: String(agentRow.voice_model ?? DEFAULT_AGENT.voice_model),
      system_prompt: agentRow.system_prompt
        ? String(agentRow.system_prompt)
        : null,
      language,
      tts_voice: ttsVoice,
      kb_document_ids: Array.isArray(meta.kb_document_ids)
        ? (meta.kb_document_ids as string[])
        : [],
      connector_ids: Array.isArray(meta.connector_ids)
        ? (meta.connector_ids as string[])
        : [],
    };
  } catch (e) {
    console.warn("[agentRouter] lookup failed, using default", e instanceof Error ? e.message : e);
    return DEFAULT_AGENT;
  }
}

/**
 * Fetches a single agent config by its UUID (for cases where we already know
 * the agent_id stored in call_sessions).
 */
export async function getAgentById(agentId: string): Promise<AgentConfig> {
  if (!agentId || agentId === DEFAULT_AGENT.id) return DEFAULT_AGENT;

  const admin = getSupabaseAdmin();
  if (!admin) return DEFAULT_AGENT;

  try {
    const { data, error } = await admin
      .from("ai_agents")
      .select("id,name,department,voice_model,system_prompt,status")
      .eq("id", agentId)
      .maybeSingle();

    if (error || !data) return DEFAULT_AGENT;
    const row = data as Record<string, unknown>;
    if (row.status === "inactive") return DEFAULT_AGENT;

    return {
      id: String(row.id),
      name: String(row.name ?? DEFAULT_AGENT.name),
      department: String(row.department ?? DEFAULT_AGENT.department),
      voice_model: String(row.voice_model ?? DEFAULT_AGENT.voice_model),
      system_prompt: row.system_prompt ? String(row.system_prompt) : null,
      language: "en",
      tts_voice: DEFAULT_AGENT.tts_voice,
      kb_document_ids: [],
      connector_ids: [],
    };
  } catch {
    return DEFAULT_AGENT;
  }
}

/**
 * Fetches a single agent config by UUID including all V6 ElevenLabs columns.
 * Used by resolveVoiceProvider() for the Media Streams pipeline.
 */
export async function getAgentByIdV6(agentId: string): Promise<AgentConfigV6> {
  const base = await getAgentById(agentId);

  if (!agentId || agentId === DEFAULT_AGENT.id) {
    return {
      ...base,
      voice_provider: "twilio_say",
      voice_id: null,
      voice_speed: 1.0,
      voice_temperature: 0.8,
      transcriber: "twilio_gather",
      agent_speaks_first: true,
      first_message: null,
      model_provider: "gemini",
      model_id: "gemini-2.5-flash",
    };
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return {
      ...base,
      voice_provider: "twilio_say",
      voice_id: null,
      voice_speed: 1.0,
      voice_temperature: 0.8,
      transcriber: "twilio_gather",
      agent_speaks_first: true,
      first_message: null,
      model_provider: "gemini",
      model_id: "gemini-2.5-flash",
    };
  }

  try {
    const { data, error } = await admin
      .from("ai_agents")
      .select(
        `id, name, department, voice_model, system_prompt, status,
         voice_provider, voice_id, voice_speed, voice_temperature,
         transcriber, agent_speaks_first, first_message,
         model_provider, model_id`
      )
      .eq("id", agentId)
      .maybeSingle();

    if (error || !data) return { ...base, voice_provider: "twilio_say", voice_id: null, voice_speed: 1.0, voice_temperature: 0.8, transcriber: "twilio_gather", agent_speaks_first: true, first_message: null, model_provider: "gemini", model_id: "gemini-2.5-flash" };

    const row = data as Record<string, unknown>;

    return {
      ...base,
      voice_provider: String(row.voice_provider ?? "twilio_say"),
      voice_id: row.voice_id ? String(row.voice_id) : null,
      voice_speed: Number(row.voice_speed ?? 1.0),
      voice_temperature: Number(row.voice_temperature ?? 0.8),
      transcriber: String(row.transcriber ?? "twilio_gather"),
      agent_speaks_first: Boolean(row.agent_speaks_first ?? true),
      first_message: row.first_message ? String(row.first_message) : null,
      model_provider: String(row.model_provider ?? "gemini"),
      model_id: String(row.model_id ?? "gemini-2.5-flash"),
    };
  } catch {
    return {
      ...base,
      voice_provider: "twilio_say",
      voice_id: null,
      voice_speed: 1.0,
      voice_temperature: 0.8,
      transcriber: "twilio_gather",
      agent_speaks_first: true,
      first_message: null,
      model_provider: "gemini",
      model_id: "gemini-2.5-flash",
    };
  }
}

function deriveTtsVoice(language: string): string {
  switch (language) {
    case "bn":
    case "bd":
      // Bangla — no native Polly Bangla, use a neutral voice
      return "Polly.Aditi";
    case "ar":
      return "Polly.Zeina";
    case "hi":
      return "Polly.Aditi";
    default:
      return "Polly.Matthew";
  }
}
