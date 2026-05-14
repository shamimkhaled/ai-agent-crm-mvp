import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  twilioFormBodyToRecord,
  validateTwilioSignatureAnyCandidate,
  twilioWebhookFullUrl,
  twilioWebhookRequestUrl,
  isVoiceWebhookSmokeAuthorized,
} from "@/lib/twilio/signature";
import { escapeXml, truncateForVoice } from "@/lib/twilio/twiml";
import { buildAgentSystemPrompt, appendKbContext } from "@/lib/twilio/voiceSystemPrompt";
import { inferVoiceIntentAndConfidence } from "@/lib/twilio/voiceIntent";
import { generateGeminiResponse } from "@/services/gemini";
import {
  getCallConversationHistory,
  getCallSessionMeta,
  insertEscalationRecord,
  insertVoiceCallTranscript,
  insertVoicePipelineEvent,
  patchCallSessionBySid,
  recordCallSessionGatherTurn,
} from "@/lib/twilio/callSessionSupabase";
import { searchKbChunks } from "@/lib/supabase/kb";
import { lookupAgentByPhoneNumber, getAgentById } from "@/lib/supabase/agentRouter";
import { fetchConnectorCrmContext } from "@/lib/connectors/crmRetrieval";
import type { AgentConfig } from "@/lib/supabase/agentRouter";

export const dynamic = "force-dynamic";

/** Maximum ms to wait for Gemini before returning a graceful fallback to the caller. */
const GEMINI_TIMEOUT_MS = 10_000;

function twiml(xml: string) {
  return new NextResponse(`<?xml version="1.0" encoding="UTF-8"?>\n${xml}`, {
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

function normalizeIvrLang(raw: string | null): "en" | "bn" | undefined {
  if (!raw) return undefined;
  const v = raw.toLowerCase();
  if (v === "bn" || v === "bd") return "bn";
  if (v === "en") return "en";
  return undefined;
}

function speechGatherLanguage(lang: "en" | "bn" | undefined): string {
  return lang === "bn" ? "bn-BD" : "en-US";
}

/**
 * Fetches CRM context for the caller's phone number.
 * First tries connector-based retrieval (synced CRM data via embeddings),
 * then falls back to the legacy product-context proxy.
 */
async function loadCrmContextBlock(
  fromE164: string,
  agent: AgentConfig,
  query: string
): Promise<string> {
  // 1. Try connector-based retrieval (richer, uses synced KB data)
  if (agent.connector_ids.length > 0) {
    try {
      const connectorContext = await fetchConnectorCrmContext({
        fromE164,
        query,
        connectorIds: agent.connector_ids,
        agentId: agent.id,
      });
      if (connectorContext) return connectorContext.slice(0, 8000);
    } catch (e) {
      console.warn("[gather] connector CRM retrieval failed", e instanceof Error ? e.message : e);
    }
  }

  // 2. Fall back to legacy product-context proxy
  const base =
    process.env.TWILIO_WEBHOOK_BASE_URL?.trim().replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "") ||
    "";
  if (!base || !fromE164) return "";
  try {
    const url = `${base}/api/crm/product-context?phone=${encodeURIComponent(fromE164)}&query=${encodeURIComponent(query.slice(0, 200))}`;
    const res = await fetch(url, { cache: "no-store" });
    const text = await res.text();
    try {
      const json = JSON.parse(text) as { ok?: boolean; bodyPreview?: string };
      if (!json.ok || !json.bodyPreview) return "";
      return json.bodyPreview.slice(0, 8000);
    } catch {
      return text.slice(0, 8000);
    }
  } catch {
    return "";
  }
}

function wantsToHangUp(speech: string): boolean {
  return /^(no|nope|nah|nothing|nothing else|that'?s all|all set|we'?re good|i'?m (done|good|all good|finished|set)|done|finished|goodbye|good bye|bye|bye bye|thanks bye|thank you bye|hang up|end call|stop|quit|i'?m okay now|okay thanks|ok thanks)\.?$/i.test(
    speech.trim()
  );
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

function raceDb<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return withTimeout(promise, ms, fallback);
}

/**
 * Resolves the agent config for this call, using stored session metadata first
 * (avoids a round-trip to phone_numbers table on every gather turn).
 */
async function resolveAgentForCall(
  callSid: string,
  toE164: string,
  sessionMeta: { agent_id: string | null; to_e164: string | null; meta: Record<string, unknown> } | null
): Promise<AgentConfig> {
  // If session has an agent_id, look it up
  if (sessionMeta?.agent_id) {
    // Pull from stored meta fields first (fastest — no extra DB query)
    const m = sessionMeta.meta;
    if (m?.agent_name) {
      return {
        id: sessionMeta.agent_id,
        name: String(m.agent_name),
        department: String(m.agent_department ?? "Support"),
        voice_model: String(m.agent_voice_model ?? "gemini-2.5-flash"),
        system_prompt: null,
        language: String(m.agent_language ?? "en"),
        tts_voice: String(m.agent_tts_voice ?? "Polly.Matthew"),
        kb_document_ids: Array.isArray(m.agent_kb_document_ids) ? m.agent_kb_document_ids as string[] : [],
        connector_ids: Array.isArray(m.agent_connector_ids) ? m.agent_connector_ids as string[] : [],
      };
    }
    // Fetch from DB as fallback
    return getAgentById(sessionMeta.agent_id);
  }

  // No session → resolve from To phone number
  return lookupAgentByPhoneNumber(sessionMeta?.to_e164 ?? toE164);
}

/**
 * Twilio posts `SpeechResult` after `<Gather input="speech">`.
 * Query `?lang=en|bn` carries IVR language for STT + Gemini bias.
 *
 * Full pipeline:
 *   1. Signature validation
 *   2. Resolve dynamic AI agent config (from call session or phone_numbers)
 *   3. Human takeover check
 *   4. Empty / hangup intent handling
 *   5. Load conversation history + semantic KB retrieval + CRM context in parallel
 *   6. Intent detection + pipeline events
 *   7. Build per-agent system prompt with CRM + KB context injected
 *   8. Gemini reasoning (with 10s timeout)
 *   9. Auto-escalation record if intent = handover
 *  10. Return TwiML with agent-specific TTS voice + optional multi-turn Gather
 */
export async function POST(req: NextRequest) {
  const params = await twilioFormBodyToRecord(req);
  const requestUrl = twilioWebhookRequestUrl(req);
  console.info("[voice gather] POST", {
    requestUrl,
    CallSid: params.CallSid,
    To: params.To,
    speechLen: (params.SpeechResult || "").length,
  });
  const sig = req.headers.get("x-twilio-signature");
  const authToken = process.env.TWILIO_AUTH_TOKEN || "";
  const skip = process.env.TWILIO_SKIP_SIGNATURE_VERIFY === "true";

  if (authToken && !skip) {
    const smokeOk = isVoiceWebhookSmokeAuthorized(req);
    if (!smokeOk) {
      const ok = validateTwilioSignatureAnyCandidate(req, params, sig, authToken);
      if (!ok) {
        console.warn(
          "[voice gather] Twilio signature FAILED — fix TWILIO_WEBHOOK_BASE_URL / token",
          { requestUrl, CallSid: params.CallSid }
        );
        return new NextResponse("Forbidden", { status: 403 });
      }
    } else {
      console.warn("[voice gather] smoke header accepted (VOICE_WEBHOOK_SMOKE_SECRET)");
    }
  }

  const ivrLang = normalizeIvrLang(req.nextUrl.searchParams.get("lang"));
  const speechLang = speechGatherLanguage(ivrLang);
  const callSid = params.CallSid || "";
  const speech = (params.SpeechResult || "").trim();
  const from = params.From || "";
  const to = params.To || "";

  // --- Resolve agent for this call session ---
  const sessionMeta = callSid
    ? await raceDb(getCallSessionMeta(callSid), 3000, null)
    : null;

  const agent = await resolveAgentForCall(callSid, to, sessionMeta);
  const ttsVoice = agent.tts_voice || "Polly.Matthew";
  const goodbye = escapeXml("Thank you for calling. Goodbye.");

  console.info("[voice gather] agent resolved", {
    callSid,
    agentId: agent.id,
    agentName: agent.name,
    language: agent.language,
  });

  // --- Human takeover guard ---
  if (sessionMeta?.human_takeover) {
    void Promise.all([
      insertVoicePipelineEvent({ callId: callSid, step: "HUMAN_TAKEOVER_BLOCK", detail: "AI leg paused — operator takeover" }),
      insertVoiceCallTranscript({ callSid, speaker: "system", body: "Human takeover active — AI responses paused for this turn.", pipelineStep: "AI Agent" }),
    ]).catch(() => {});
    const msg = escapeXml("Connecting you with our team. Please hold.");
    return twiml(`<Response><Say voice="${ttsVoice}">${msg}</Say></Response>`);
  }

  // --- Empty speech ---
  if (!speech) {
    const msg = escapeXml("I did not hear a question. Thank you for calling. Goodbye.");
    const response = twiml(`<Response><Say voice="${ttsVoice}">${msg}</Say></Response>`);
    if (callSid) {
      void Promise.all([
        insertVoicePipelineEvent({ callId: callSid, step: "GATHER_EMPTY", detail: "No SpeechResult" }),
        insertVoiceCallTranscript({ callSid, speaker: "system", body: "No speech detected on this gather.", pipelineStep: "STT" }),
        patchCallSessionBySid(callSid, { dashboard_state: "idle", pipeline_step_index: 3 }),
      ]).catch((e) => console.warn("[voice gather] empty speech persist", e));
    }
    return response;
  }

  // --- Hangup intent ---
  if (wantsToHangUp(speech)) {
    const response = twiml(`<Response><Say voice="${ttsVoice}">${goodbye}</Say></Response>`);
    if (callSid) {
      void Promise.all([
        recordCallSessionGatherTurn({ callSid, from, to, speech, aiReply: "[caller ended]", geminiError: null }),
        insertVoicePipelineEvent({ callId: callSid, step: "HANGUP_INTENT", detail: speech.slice(0, 400) }),
        insertVoiceCallTranscript({ callSid, speaker: "caller", body: speech, pipelineStep: "Intent Detection" }),
        insertVoiceCallTranscript({ callSid, speaker: "system", body: "Caller ended the conversation.", pipelineStep: "Reply to Caller" }),
        patchCallSessionBySid(callSid, { dashboard_state: "idle", pipeline_step_index: 8 }),
      ]).catch((e) => console.warn("[voice gather] hangup persist", e));
    }
    return response;
  }

  // --- Main AI pipeline ---
  try {
    // Fetch conversation history, semantic KB content, and CRM context in parallel
    const [convHistory, kbContent, crmContext] = await Promise.all([
      getCallConversationHistory(callSid),
      searchKbChunks(speech, 5, agent.kb_document_ids),
      loadCrmContextBlock(from, agent, speech),
    ]);

    const intentPack = inferVoiceIntentAndConfidence(speech);
    const { intent, confidence, escalation } = intentPack;

    if (callSid) {
      await Promise.all([
        patchCallSessionBySid(callSid, { dashboard_state: "thinking", pipeline_step_index: 3 }),
        insertVoicePipelineEvent({ callId: callSid, step: "STT", detail: "SpeechResult received" }),
        insertVoiceCallTranscript({ callSid, speaker: "caller", body: speech, pipelineStep: "STT" }),
      ]);
      await Promise.all([
        insertVoicePipelineEvent({ callId: callSid, step: "INTENT", detail: `${intent} (~${confidence}%)` }),
        patchCallSessionBySid(callSid, { pipeline_step_index: 4, intent_label: intent, ai_confidence: confidence, escalation }),
        insertVoiceCallTranscript({
          callSid,
          speaker: "system",
          body: `Intent: ${intent} · confidence ${confidence}%${escalation ? " · escalation flagged" : ""} · Agent: ${agent.name}`,
          pipelineStep: "Intent Detection",
          intentHint: intent,
          confidence,
        }),
      ]);
      await Promise.all([
        insertVoicePipelineEvent({
          callId: callSid,
          step: "CRM_QUERY",
          detail: `KB chunks: ${kbContent ? "yes" : "none"} · CRM: ${crmContext ? "yes" : "none"} · connectors: ${agent.connector_ids.length}`,
        }),
        patchCallSessionBySid(callSid, { pipeline_step_index: 5 }),
        insertVoiceCallTranscript({ callSid, speaker: "system", body: "Querying CRM / ERP + knowledge base…", pipelineStep: "CRM / ERP" }),
      ]);
    }

    // Build per-agent system prompt with CRM + KB context
    let systemPrompt = buildAgentSystemPrompt(agent, crmContext || undefined, ivrLang);
    systemPrompt = appendKbContext(systemPrompt, kbContent);

    if (callSid) {
      await Promise.all([
        insertVoicePipelineEvent({
          callId: callSid,
          step: "GEMINI_START",
          detail: `agent=${agent.name} history=${convHistory.length} kb=${kbContent.length > 0} crm=${crmContext.length > 0}`,
        }),
        patchCallSessionBySid(callSid, { pipeline_step_index: 6, dashboard_state: "thinking" }),
      ]);
    }

    const messages: { role: string; content: string }[] = [
      ...convHistory,
      { role: "user", content: speech },
    ];

    const tGemini = Date.now();
    const { text, error } = await withTimeout(
      generateGeminiResponse(messages, systemPrompt),
      GEMINI_TIMEOUT_MS,
      { text: "Sorry, our assistant took too long to respond. Please try again or a team member will follow up.", error: "gemini_timeout" }
    );
    const geminiMs = Date.now() - tGemini;

    const spoken = truncateForVoice(
      error ? "Sorry, our assistant is temporarily unavailable. A teammate will follow up." : text
    );
    const safe = escapeXml(spoken);

    if (callSid) {
      await Promise.all([
        insertVoicePipelineEvent({ callId: callSid, step: "GEMINI", detail: error ? `error:${error.slice(0, 200)}` : `ok chars=${spoken.length}`, durationMs: geminiMs }),
        insertVoicePipelineEvent({ callId: callSid, step: "TTS", detail: `TwiML Say ${ttsVoice}` }),
        patchCallSessionBySid(callSid, { pipeline_step_index: 7, dashboard_state: "speaking" }),
      ]);
      await Promise.all([
        recordCallSessionGatherTurn({ callSid, from, to, speech, aiReply: spoken, geminiError: error ?? null }),
        insertVoiceCallTranscript({ callSid, speaker: "ai", body: spoken, pipelineStep: "Gemini", confidence }),
        insertVoicePipelineEvent({ callId: callSid, step: "RESPONSE_SENT", detail: "TwiML returned to Twilio" }),
        patchCallSessionBySid(callSid, { pipeline_step_index: 8, dashboard_state: "idle" }),
      ]);

      if (escalation) {
        await insertEscalationRecord({
          callSid,
          reason: `${intent} — confidence ${confidence}% — caller said: ${speech.slice(0, 200)}`,
          fromE164: from,
        });
      }
    }

    if (error) {
      console.warn("[voice gather] Gemini error", { error, callSid });
    } else {
      console.info("[voice gather] reply", { callSid, agentName: agent.name, chars: spoken.length });
    }

    const multiTurn = process.env.TWILIO_VOICE_MULTI_TURN !== "false";
    if (!multiTurn) {
      return twiml(`<Response><Say voice="${ttsVoice}">${safe}</Say><Say voice="${ttsVoice}">${goodbye}</Say></Response>`);
    }

    const gatherBase = twilioWebhookFullUrl(req, "/api/webhooks/voice/gather");
    const gatherQs = ivrLang ? `?lang=${encodeURIComponent(ivrLang)}` : "";
    const gatherNext = escapeXml(`${gatherBase}${gatherQs}`);
    const follow = escapeXml("Anything else? Or say goodbye when you are done.");

    return twiml(`<Response>
  <Say voice="${ttsVoice}">${safe}</Say>
  <Gather input="speech" action="${gatherNext}" method="POST" speechTimeout="5" language="${speechLang}">
    <Say voice="${ttsVoice}">${follow}</Say>
  </Gather>
  <Say voice="${ttsVoice}">${goodbye}</Say>
</Response>`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[voice gather] Unexpected error — returning graceful TwiML", { msg, callSid });
    if (callSid) {
      await Promise.allSettled([
        insertVoicePipelineEvent({ callId: callSid, step: "INTERNAL_ERROR", detail: msg.slice(0, 400) }),
        patchCallSessionBySid(callSid, { dashboard_state: "idle", pipeline_step_index: 8 }),
      ]);
    }
    const errMsg = escapeXml("We encountered an issue. Please try again or our team will follow up. Goodbye.");
    return twiml(`<Response><Say voice="${ttsVoice || "Polly.Matthew"}">${errMsg}</Say></Response>`);
  }
}
