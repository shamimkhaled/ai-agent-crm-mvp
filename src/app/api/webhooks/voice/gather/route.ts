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
import { generateGeminiResponse } from "@/services/gemini";
import {
  insertVoicePipelineEvent,
  recordCallSessionGatherTurn,
} from "@/lib/twilio/callSessionSupabase";

export const dynamic = "force-dynamic";

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

async function loadCrmContextBlock(fromE164: string): Promise<string> {
  const base =
    process.env.TWILIO_WEBHOOK_BASE_URL?.replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    "";
  if (!base || !fromE164) return "";
  try {
    const url = `${base}/api/crm/product-context?phone=${encodeURIComponent(fromE164)}`;
    const res = await fetch(url, { cache: "no-store" });
    const text = await res.text();
    return text.slice(0, 8000);
  } catch {
    return "";
  }
}

function wantsToHangUp(speech: string): boolean {
  return /^(no|nope|nah|nothing|nothing else|that'?s all|all set|we'?re good|goodbye|good bye|bye|thanks bye|thank you bye)\.?$/i.test(
    speech.trim()
  );
}

/**
 * Twilio posts `SpeechResult` after `<Gather input="speech">`.
 * Query `?lang=en|bn` carries IVR language for STT + Gemini bias.
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
        "[voice gather] Twilio signature FAILED — fix TWILIO_WEBHOOK_BASE_URL / token or TWILIO_SKIP_SIGNATURE_VERIFY=true while debugging",
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

  if (!speech) {
    const msg = escapeXml("I did not hear a question. Thank you for calling. Goodbye.");
    if (callSid) {
      await insertVoicePipelineEvent({
        callId: callSid,
        step: "GATHER_EMPTY",
        detail: "No SpeechResult",
      });
    }
    return twiml(`<Response><Say voice="Polly.Matthew">${msg}</Say></Response>`);
  }

  if (wantsToHangUp(speech)) {
    if (callSid) {
      await recordCallSessionGatherTurn({
        callSid,
        from,
        speech,
        aiReply: "[caller ended]",
        geminiError: null,
      });
      await insertVoicePipelineEvent({
        callId: callSid,
        step: "HANGUP_INTENT",
        detail: speech.slice(0, 400),
      });
    }
    return twiml(`<Response><Say voice="Polly.Matthew">${goodbye}</Say></Response>`);
  }

  const tGemini = Date.now();
  const crmContext = await loadCrmContextBlock(from);
  const systemPrompt = buildVoiceInboundSystemPrompt(crmContext || undefined, ivrLang);
  const { text, error } = await generateGeminiResponse(
    [{ role: "user", content: speech }],
    systemPrompt
  );
  const geminiMs = Date.now() - tGemini;

  const spoken = truncateForVoice(
    error ? "Sorry, our assistant is temporarily unavailable. A teammate will follow up." : text
  );
  const safe = escapeXml(spoken);

  if (callSid) {
    await recordCallSessionGatherTurn({
      callSid,
      from,
      speech,
      aiReply: spoken,
      geminiError: error ?? null,
    });
    await insertVoicePipelineEvent({
      callId: callSid,
      step: "GEMINI",
      detail: error ? `error:${error.slice(0, 200)}` : `ok chars=${spoken.length}`,
      durationMs: geminiMs,
    });
    await insertVoicePipelineEvent({
      callId: callSid,
      step: "USER_SPEECH",
      detail: speech.slice(0, 600),
    });
  }

  if (error) {
    console.warn("[voice gather] Gemini error", { error, callSid });
  } else {
    console.info("[voice gather] reply", { callSid, chars: spoken.length });
  }

  const multiTurn = process.env.TWILIO_VOICE_MULTI_TURN !== "false";
  if (!multiTurn) {
    return twiml(
      `<Response><Say voice="Polly.Matthew">${safe}</Say><Say voice="Polly.Matthew">${goodbye}</Say></Response>`
    );
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
}
