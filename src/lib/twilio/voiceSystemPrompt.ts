import type { AgentConfig } from "@/lib/supabase/agentRouter";
import {
  getLanguageConfig,
  buildLanguageInstruction,
  type SupportedLanguageCode,
} from "@/lib/elevenlabs/multilingual";

/**
 * Builds a fully dynamic system prompt for the voice AI agent.
 *
 * Priority stack:
 *   1. Agent's own system_prompt (from ai_agents table) — persona base.
 *   2. Language instruction block (injected from multilingual registry).
 *   3. Voice rules (no markdown, short sentences, phone etiquette).
 *   4. CRM / ERP context block.
 *   5. Knowledge base chunks (RAG).
 *   6. VOICE_KB_CONTEXT env var (operator notes / overrides).
 */
export function buildAgentSystemPrompt(
  agent: AgentConfig,
  crmContext?: string,
  ivrLanguage?: SupportedLanguageCode
): string {
  const lang = (ivrLanguage ?? agent.language ?? "en") as SupportedLanguageCode;

  // Persona base
  const base = agent.system_prompt?.trim()
    ? agent.system_prompt.trim()
    : buildDefaultPersona(agent);

  // Language-specific instruction from registry
  const languageInstruction = buildLanguageInstruction(lang);

  // Universal voice / phone-call rules
  const voiceRules = buildVoiceRules(lang);

  let body = `${base}\n${voiceRules}\n${languageInstruction}`;

  if (crmContext?.trim()) {
    body += `\n\n--- CRM / ERP Live Data ---\n${crmContext.trim()}`;
  }

  return body;
}

/** Legacy helper — builds prompt with a default agent object. */
export function buildVoiceInboundSystemPrompt(
  crmContext?: string,
  ivrLanguage?: SupportedLanguageCode
): string {
  const defaultAgent: AgentConfig = {
    id: "default",
    name: "AI Support Agent",
    department: "Support",
    voice_model: "gemini-2.5-flash",
    system_prompt: null,
    language: ivrLanguage ?? "en",
    tts_voice: "Polly.Matthew",
    kb_document_ids: [],
    connector_ids: [],
  };
  return buildAgentSystemPrompt(defaultAgent, crmContext, ivrLanguage);
}

/**
 * Voice-call etiquette rules.
 * Uses language config for code-mixing guidance.
 */
function buildVoiceRules(lang: SupportedLanguageCode): string {
  const config = getLanguageConfig(lang);
  const codeMixNote =
    lang === "bn"
      ? "Code-mixing Bangla and English is natural for Bangladesh callers — use it freely."
      : lang === "hi"
      ? "Mixing Hindi and English (Hinglish) is natural — use it when appropriate."
      : lang === "ur"
      ? "Mixing Urdu and English is natural — use it when appropriate."
      : "";

  const rtlNote = config.rtl
    ? "Remember: the caller's language is written right-to-left, but your audio output is speech — formatting is irrelevant for voice."
    : "";

  return `
You are on a LIVE PHONE CALL. Follow these rules strictly:
- Reply in short, speakable sentences only (max 2-3 sentences per turn).
- NEVER use markdown, bullet points, asterisks, hyphens, numbered lists, or symbols.
- Plain spoken words only — no code, no lists, no formatting.
- Keep numbers and dates in a spoken format ("one thousand taka", not "1,000 BDT").
- If you lack specific data (order numbers, payment details), say you will note it and a human can follow up. Do NOT invent facts.
- Speak naturally — contractions, pauses, and informal phrasing are fine on calls.${codeMixNote ? `\n- ${codeMixNote}` : ""}${rtlNote ? `\n- ${rtlNote}` : ""}`;
}

/** Builds a department-specific default persona. */
function buildDefaultPersona(agent: AgentConfig): string {
  const deptContext: Record<string, string> = {
    sales: "You are a friendly and knowledgeable sales assistant. Help customers find products, check pricing, and place orders.",
    support: "You are a helpful customer support agent. Resolve issues, track orders, and escalate to humans when needed.",
    billing: "You are a billing specialist. Help customers with invoices, payments, and account balances.",
    delivery: "You are a delivery tracking specialist. Help customers track shipments and resolve delivery issues.",
    hr: "You are an HR assistant. Help employees with leave, payroll, and HR policies.",
  };

  const deptLower = agent.department?.toLowerCase() ?? "";
  const deptPrompt =
    deptContext[deptLower] ??
    `You are ${agent.name}, a helpful AI assistant for the ${agent.department} department.`;

  return `You are ${agent.name}, an AI voice assistant.
${deptPrompt}`;
}

/** Appends knowledge base snippets to any prompt string. */
export function appendKbContext(basePrompt: string, kbContent: string): string {
  let result = basePrompt;
  if (kbContent.trim()) {
    result += `\n\n--- Knowledge Base (relevant documents for this query) ---\n${kbContent}`;
  }
  const envKb = process.env.VOICE_KB_CONTEXT?.trim();
  if (envKb) {
    result += `\n\n--- Operator Notes ---\n${envKb.slice(0, 3000)}`;
  }
  return result;
}

/**
 * Build a per-turn language override string to inject when
 * the detected caller language differs from the agent's primary language.
 *
 * Injected as a brief user-turn prefix:
 *   "[Caller switched to Bangla — reply in Bangla.]"
 */
export function buildTurnLanguageOverride(
  detectedLang: SupportedLanguageCode,
  agentLang: SupportedLanguageCode
): string {
  if (detectedLang === agentLang) return "";
  const config = getLanguageConfig(detectedLang);
  return config.gemini.turnInstruction;
}
