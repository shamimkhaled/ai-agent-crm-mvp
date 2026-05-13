import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  twilioFormBodyToRecord,
  validateTwilioSignature,
  twilioWebhookFullUrl,
  twilioWebhookRequestUrl,
} from "@/lib/twilio/signature";
import { escapeXml, truncateForVoice } from "@/lib/twilio/twiml";
import { buildVoiceInboundSystemPrompt } from "@/lib/twilio/voiceSystemPrompt";
import { inferVoiceIntentAndConfidence } from "@/lib/twilio/voiceIntent";
import { generateGeminiResponse } from "@/services/gemini";
import {
  getCallConversationHistory,
  getCallSessionFlags,
  insertEscalationRecord,
  insertVoiceCallTranscript,
  insertVoicePipelineEvent,
  patchCallSessionBySid,
  recordCallSessionGatherTurn,
} from "@/lib/twilio/callSessionSupabase";
import { searchKbChunks } from "@/lib/supabase/kb";

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
 * Parses the JSON wrapper from the product-context route and only
 * returns actual CRM data — never leaks the error JSON into the prompt.
 */
async function loadCrmContextBlock(fromE164: string): Promise<string> {
  const base =
    process.env.TWILIO_WEBHOOK_BASE_URL?.trim().replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "") ||
    "";
  if (!base || !fromE164) return "";
  try {
    const url = `${base}/api/crm/product-context?phone=${encodeURIComponent(fromE164)}`;
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

/**
 * Expanded set of caller hang-up phrases.
 */
function wantsToHangUp(speech: string): boolean {
  return /^(no|nope|nah|nothing|nothing else|that'?s all|all set|we'?re good|i'?m (done|good|all good|finished|set)|done|finished|goodbye|good bye|bye|bye bye|thanks bye|thank you bye|hang up|end call|stop|quit|i'?m okay now|okay thanks|ok thanks)\.?$/i.test(
    speech.trim()
  );
}

function appendKbSnippet(base: string, kbContent: string): string {
  const envKb = process.env.VOICE_KB_CONTEXT?.trim();
  let result = base;
  if (kbContent.trim()) {
    result += `\n\n--- Knowledge base (relevant documents) ---\n${kbContent}`;
  }
  if (envKb) {
    result += `\n\n--- Knowledge base (operator notes) ---\n${envKb.slice(0, 3000)}`;
  }
  return result;
}

/**
 * Races a promise against a wall-clock deadline; returns `fallback` on timeout.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

/**
 * Twilio posts `SpeechResult` after `<Gather input="speech">`.
 * Query `?lang=en|bn` carries IVR language for STT + Gemini bias.
 *
 * Full pipeline:
 *   1. Signature validation
 *   2. Human takeover check
 *   3. Empty / hangup intent handling
 *   4. Load conversation history + KB content + CRM context in parallel
 *   5. Intent detection + pipeline events
 *   6. Gemini call (with 10s timeout)
 *   7. Auto-escalation record if intent = handover
 *   8. Return TwiML (<Say> + <Gather> for multi-turn)
 */
export async function POST(req: NextRequest) {
  const params = await twilioFormBodyToRecord(req);
  const requestUrl = twilioWebhookRequestUrl(req);
  console.info("[voice gather] POST", {
    requestUrl,
    CallSid: params.CallSid,
    speechLen: (params.SpeechResult || "").length,
  });
  const sig = req.headers.get("x-twilio-signature");
  const authToken = process.env.TWILIO_AUTH_TOKEN || "";
  const skip = process.env.TWILIO_SKIP_SIGNATURE_VERIFY === "true";

  if (authToken && !skip) {
    const ok = validateTwilioSignature(requestUrl, params, sig, authToken);
    if (!ok) {
      console.warn(
        "[voice gather] Twilio signature FAILED — fix TWILIO_WEBHOOK_BASE_URL / token or set TWILIO_SKIP_SIGNATURE_VERIFY=true",
        { requestUrl, CallSid: params.CallSid }
      );
      return new NextResponse("Forbidden", { status: 403 });
    }
  }

  const ivrLang = normalizeIvrLang(req.nextUrl.searchParams.get("lang"));
  const speechLang = speechGatherLanguage(ivrLang);
  const callSid = params.CallSid || "";
  const speech = (params.SpeechResult || "").trim();
  const from = params.From || "";
  const goodbye = escapeXml("Thank you for calling. Goodbye.");

  // --- Human takeover guard ---
  if (callSid) {
    const flags = await getCallSessionFlags(callSid);
    if (flags?.human_takeover) {
      await Promise.all([
        insertVoicePipelineEvent({ callId: callSid, step: "HUMAN_TAKEOVER_BLOCK", detail: "AI leg paused — operator takeover" }),
        insertVoiceCallTranscript({ callSid, speaker: "system", body: "Human takeover active — AI responses paused for this turn.", pipelineStep: "AI Agent" }),
      ]);
      const msg = escapeXml("Connecting you with our team. Please hold.");
      return twiml(`<Response><Say voice="Polly.Matthew">${msg}</Say></Response>`);
    }
  }

  // --- Empty speech ---
  if (!speech) {
    const msg = escapeXml("I did not hear a question. Thank you for calling. Goodbye.");
    if (callSid) {
      await Promise.all([
        insertVoicePipelineEvent({ callId: callSid, step: "GATHER_EMPTY", detail: "No SpeechResult" }),
        insertVoiceCallTranscript({ callSid, speaker: "system", body: "No speech detected on this gather.", pipelineStep: "STT" }),
        patchCallSessionBySid(callSid, { dashboard_state: "idle", pipeline_step_index: 3 }),
      ]);
    }
    return twiml(`<Response><Say voice="Polly.Matthew">${msg}</Say></Response>`);
  }

  // --- Hangup intent ---
  if (wantsToHangUp(speech)) {
    if (callSid) {
      await Promise.all([
        recordCallSessionGatherTurn({ callSid, from, speech, aiReply: "[caller ended]", geminiError: null }),
        insertVoicePipelineEvent({ callId: callSid, step: "HANGUP_INTENT", detail: speech.slice(0, 400) }),
        insertVoiceCallTranscript({ callSid, speaker: "caller", body: speech, pipelineStep: "Intent Detection" }),
        insertVoiceCallTranscript({ callSid, speaker: "system", body: "Caller ended the conversation.", pipelineStep: "Reply to Caller" }),
        patchCallSessionBySid(callSid, { dashboard_state: "idle", pipeline_step_index: 8 }),
      ]);
    }
    return twiml(`<Response><Say voice="Polly.Matthew">${goodbye}</Say></Response>`);
  }

  // --- Main AI pipeline (all unexpected errors return graceful TwiML) ---
  try {
    // Fetch conversation history, KB content, and CRM context in parallel
    // NOTE: history is loaded BEFORE inserting the current caller transcript
    // so the current speech is not double-counted in Gemini's input.
    const [convHistory, kbContent, crmContext] = await Promise.all([
      getCallConversationHistory(callSid),
      searchKbChunks(speech),
      loadCrmContextBlock(from),
    ]);

    const intentPack = inferVoiceIntentAndConfidence(speech);
    const { intent, confidence, escalation } = intentPack;

    // Pipeline events: STT received, intent detected
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
          body: `Intent: ${intent} · confidence ${confidence}%${escalation ? " · escalation flagged" : ""}`,
          pipelineStep: "Intent Detection",
          intentHint: intent,
          confidence,
        }),
      ]);
      await Promise.all([
        insertVoicePipelineEvent({ callId: callSid, step: "CRM_QUERY", detail: `KB chunks: ${kbContent ? "yes" : "none"} · CRM: ${crmContext ? "yes" : "none"}` }),
        patchCallSessionBySid(callSid, { pipeline_step_index: 5 }),
        insertVoiceCallTranscript({ callSid, speaker: "system", body: "Querying CRM / ERP + knowledge base…", pipelineStep: "CRM / ERP" }),
      ]);
    }

    let systemPrompt = buildVoiceInboundSystemPrompt(crmContext || undefined, ivrLang);
    systemPrompt = appendKbSnippet(systemPrompt, kbContent);

    if (callSid) {
      await Promise.all([
        insertVoicePipelineEvent({ callId: callSid, step: "GEMINI_START", detail: `history=${convHistory.length} kb=${kbContent.length > 0}` }),
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
        insertVoicePipelineEvent({ callId: callSid, step: "TTS", detail: "TwiML Say Polly.Matthew" }),
        patchCallSessionBySid(callSid, { pipeline_step_index: 7, dashboard_state: "speaking" }),
      ]);
      await Promise.all([
        recordCallSessionGatherTurn({ callSid, from, speech, aiReply: spoken, geminiError: error ?? null }),
        insertVoiceCallTranscript({ callSid, speaker: "ai", body: spoken, pipelineStep: "Gemini", confidence }),
        insertVoicePipelineEvent({ callId: callSid, step: "RESPONSE_SENT", detail: "TwiML returned to Twilio" }),
        patchCallSessionBySid(callSid, { pipeline_step_index: 8, dashboard_state: "idle" }),
      ]);

      // Auto-insert escalation record so the dashboard alert queue lights up
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
      console.info("[voice gather] reply", { callSid, chars: spoken.length });
    }

    const multiTurn = process.env.TWILIO_VOICE_MULTI_TURN !== "false";
    if (!multiTurn) {
      return twiml(`<Response><Say voice="Polly.Matthew">${safe}</Say><Say voice="Polly.Matthew">${goodbye}</Say></Response>`);
    }

    const gatherBase = twilioWebhookFullUrl(req, "/api/webhooks/voice/gather");
    const gatherQs = ivrLang ? `?lang=${encodeURIComponent(ivrLang)}` : "";
    const gatherNext = escapeXml(`${gatherBase}${gatherQs}`);
    const follow = escapeXml("Anything else? Or say goodbye when you are done.");

    return twiml(`<Response>
  <Say voice="Polly.Matthew">${safe}</Say>
  <Gather input="speech" action="${gatherNext}" method="POST" speechTimeout="5" language="${speechLang}">
    <Say voice="Polly.Matthew">${follow}</Say>
  </Gather>
  <Say voice="Polly.Matthew">${goodbye}</Say>
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
    return twiml(`<Response><Say voice="Polly.Matthew">${errMsg}</Say></Response>`);
  }
}
