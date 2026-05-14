import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  twilioFormBodyToRecord,
  validateTwilioSignatureAnyCandidate,
  twilioWebhookFullUrl,
  twilioWebhookRequestUrl,
  twilioWebhookSignatureUrlCandidates,
  isVoiceWebhookSmokeAuthorized,
} from "@/lib/twilio/signature";
import { escapeXml } from "@/lib/twilio/twiml";
import {
  insertVoicePipelineEvent,
  persistInboundVoiceTelemetry,
} from "@/lib/twilio/callSessionSupabase";
import { lookupAgentByPhoneNumber } from "@/lib/supabase/agentRouter";
import { resolveVoiceProvider, buildInboundTwiML } from "@/lib/voice/providerFactory";

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

/** Health check for operators / load balancers (Twilio uses POST for real calls). */
export async function GET() {
  return new NextResponse("OK — POST /api/webhooks/voice/inbound for Twilio Voice", { status: 200 });
}

/**
 * Twilio Voice "A call comes in" webhook.
 *
 * Enhancements vs. original:
 *   - Resolves the per-phone-number AI agent BEFORE persisting telemetry
 *   - Passes AgentConfig into persistInboundVoiceTelemetry so the correct
 *     agent_id, name, language, and TTS voice are stored in call_sessions
 *   - Uses agent's language preference for STT gather language
 *   - Uses agent's TTS voice in fallback Say verbs
 *
 * Optional DTMF menu: `TWILIO_VOICE_DTMF_MENU=true` → press 1 English / 2 Bangla
 */
export async function POST(req: NextRequest) {
  const params = await twilioFormBodyToRecord(req);
  const requestUrl = twilioWebhookRequestUrl(req);
  const sig = req.headers.get("x-twilio-signature");
  const authToken = process.env.TWILIO_AUTH_TOKEN || "";
  const skip = process.env.TWILIO_SKIP_SIGNATURE_VERIFY === "true";

  console.info("[voice inbound] POST received", {
    requestUrl,
    CallSid: params.CallSid,
    From: params.From,
    To: params.To,
    hasSignatureHeader: Boolean(sig),
  });

  if (authToken && !skip) {
    const smokeOk = isVoiceWebhookSmokeAuthorized(req);
    if (!smokeOk) {
      const ok = validateTwilioSignatureAnyCandidate(req, params, sig, authToken);
      if (!ok) {
        console.warn(
          "[voice inbound] Twilio signature FAILED — Twilio will not run your AI TwiML. Align Twilio Console webhook URL with TWILIO_WEBHOOK_BASE_URL / NEXT_PUBLIC_APP_URL / this deployment host, confirm TWILIO_AUTH_TOKEN for this subaccount, set VOICE_WEBHOOK_SMOKE_SECRET + X-Voice-Webhook-Smoke-Secret for curl tests, or TWILIO_SKIP_SIGNATURE_VERIFY=true only for local debugging.",
          { primaryUrl: requestUrl, signatureCandidates: twilioWebhookSignatureUrlCandidates(req), CallSid: params.CallSid }
        );
        return new NextResponse("Forbidden", { status: 403 });
      }
    } else {
      console.warn("[voice inbound] smoke header accepted (VOICE_WEBHOOK_SMOKE_SECRET) — not from Twilio");
    }
  } else if (!authToken && !skip) {
    console.warn("[voice inbound] TWILIO_AUTH_TOKEN not set — skipping signature validation");
  }

  // Resolve the agent for this `To` number BEFORE building TwiML so we
  // can use the agent's language preference for the gather.
  // This runs in parallel with fire-and-forget telemetry persistence.
  const agentPromise = lookupAgentByPhoneNumber(params.To ?? "");

  // Critical: return TwiML fast. Persist telemetry with agent config in background.
  if (params.CallSid) {
    agentPromise.then((agent) => {
      void persistInboundVoiceTelemetry(params, agent).catch(() => {});
      console.info("[voice inbound] agent resolved", {
        CallSid: params.CallSid,
        agentId: agent.id,
        agentName: agent.name,
        language: agent.language,
      });
    });
  }

  const dtmfMenu = process.env.TWILIO_VOICE_DTMF_MENU === "true";
  const langOverride = normalizeIvrLang(req.nextUrl.searchParams.get("lang"));

  // Determine language: URL param > agent default
  const agent = await agentPromise;
  const agentLang = agent.language === "bn" ? "bn" : "en";
  const lang = langOverride ?? (agentLang === "bn" ? "bn" : undefined);
  const ttsVoice = agent.tts_voice || "Polly.Matthew";

  if (dtmfMenu && !lang) {
    const ivrUrl = escapeXml(twilioWebhookFullUrl(req, "/api/webhooks/voice/ivr"));
    const menu = escapeXml("For English, press 1. বাংলার জন্য 2 চাপুন.");
    if (params.CallSid) {
      void insertVoicePipelineEvent({
        callId: params.CallSid,
        step: "IVR_DTMF_MENU",
        detail: `Presenting language menu — agent: ${agent.name}`,
      });
    }
    return twiml(`<Response>
  <Gather numDigits="1" action="${ivrUrl}" method="POST" timeout="8">
    <Say voice="${ttsVoice}">${menu}</Say>
  </Gather>
  <Say voice="${ttsVoice}">${escapeXml("We did not receive a keypress. Goodbye.")}</Say>
</Response>`);
  }

  const gatherPath = "/api/webhooks/voice/gather";
  const gatherBase = twilioWebhookFullUrl(req, gatherPath);
  const gatherQs = lang ? `?lang=${encodeURIComponent(lang)}` : "";
  const gatherUrl = `${gatherBase}${gatherQs}`;
  const speechLang = speechGatherLanguage(lang);

  // Resolve voice provider for this agent — may route to ElevenLabs Media Streams
  let providerConfig;
  try {
    providerConfig = await resolveVoiceProvider(agent.id);
  } catch {
    providerConfig = null;
  }

  if (providerConfig?.useMediaStreams && params.CallSid) {
    // ElevenLabs Media Streams path — bidirectional WebSocket pipeline
    void insertVoicePipelineEvent({
      callId: params.CallSid,
      step: "MEDIA_STREAM_ROUTE",
      detail: `Routing to ElevenLabs bridge — agentId=${agent.id} voiceId=${providerConfig.ttsVoiceId}`,
    });

    const xml = buildInboundTwiML(
      providerConfig,
      params.CallSid,
      agent.id,
      gatherUrl,
      speechLang
    );
    return twiml(xml);
  }

  // Twilio native path — existing <Gather> + <Say> pipeline (backward compatible)
  const prompt =
    lang === "bn"
      ? escapeXml("ধন্যবাদ কল করার জন্য। টোনের পর আপনার প্রশ্ন বলুন।")
      : escapeXml(`Thanks for calling. You're speaking with ${agent.name}. After the tone, say your question.`);
  const reprompt =
    lang === "bn"
      ? escapeXml("দুঃখিত, শুনতে পাইনি। আবার চেষ্টা করুন।")
      : escapeXml("Sorry, I did not catch that. Please try once more.");

  const gatherUrlEscaped = escapeXml(gatherUrl);
  const xml = `<Response>
  <Gather input="speech" action="${gatherUrlEscaped}" method="POST" speechTimeout="auto" language="${speechLang}">
    <Say voice="${ttsVoice}">${prompt}</Say>
  </Gather>
  <Gather input="speech" action="${gatherUrlEscaped}" method="POST" speechTimeout="3" language="${speechLang}">
    <Say voice="${ttsVoice}">${reprompt}</Say>
  </Gather>
  <Say voice="${ttsVoice}">${escapeXml("We could not hear you. Please call again soon. Goodbye.")}</Say>
</Response>`;

  return twiml(xml);
}
