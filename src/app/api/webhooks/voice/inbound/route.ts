import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  twilioFormBodyToRecord,
  validateTwilioSignature,
  twilioWebhookFullUrl,
  twilioWebhookRequestUrl,
} from "@/lib/twilio/signature";
import { escapeXml } from "@/lib/twilio/twiml";
import {
  insertVoicePipelineEvent,
  upsertCallSessionInbound,
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

/** Health check for operators / load balancers (Twilio uses POST for real calls). */
export async function GET() {
  return new NextResponse("OK — POST /api/webhooks/voice/inbound for Twilio Voice", { status: 200 });
}

/**
 * Twilio Voice "A call comes in" webhook.
 * Optional DTMF menu: `TWILIO_VOICE_DTMF_MENU=true` → press 1 English / 2 Bangla → `?lang=` → speech Gather → `/gather`.
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
    hasSignatureHeader: Boolean(sig),
  });

  if (authToken && !skip) {
    const ok = validateTwilioSignature(requestUrl, params, sig, authToken);
    if (!ok) {
      console.warn(
        "[voice inbound] Twilio signature FAILED — Twilio will not run your AI TwiML. Fix TWILIO_WEBHOOK_BASE_URL to match the Voice webhook URL exactly, confirm TWILIO_AUTH_TOKEN for this account, or set TWILIO_SKIP_SIGNATURE_VERIFY=true temporarily while debugging.",
        { requestUrl, CallSid: params.CallSid }
      );
      return new NextResponse("Forbidden", { status: 403 });
    }
  } else if (!authToken && !skip) {
    console.warn("[voice inbound] TWILIO_AUTH_TOKEN not set — skipping signature validation");
  }

  if (params.CallSid) {
    await upsertCallSessionInbound(params);
    await insertVoicePipelineEvent({
      callId: params.CallSid,
      step: "INBOUND",
      detail: `From=${params.From ?? ""} To=${params.To ?? ""} Status=${params.CallStatus ?? ""}`,
    });
  }

  const dtmfMenu = process.env.TWILIO_VOICE_DTMF_MENU === "true";
  const lang = normalizeIvrLang(req.nextUrl.searchParams.get("lang"));

  if (dtmfMenu && !lang) {
    const ivrUrl = escapeXml(twilioWebhookFullUrl(req, "/api/webhooks/voice/ivr"));
    const menu = escapeXml("For English, press 1. বাংলার জন্য 2 চাপুন.");
    if (params.CallSid) {
      await insertVoicePipelineEvent({
        callId: params.CallSid,
        step: "IVR_DTMF_MENU",
        detail: "Presenting language menu",
      });
    }
    return twiml(`<Response>
  <Gather numDigits="1" action="${ivrUrl}" method="POST" timeout="8">
    <Say voice="Polly.Matthew">${menu}</Say>
  </Gather>
  <Say voice="Polly.Matthew">${escapeXml("We did not receive a keypress. Goodbye.")}</Say>
</Response>`);
  }

  const gatherPath = "/api/webhooks/voice/gather";
  const gatherBase = twilioWebhookFullUrl(req, gatherPath);
  const gatherQs = lang ? `?lang=${encodeURIComponent(lang)}` : "";
  const gatherUrl = escapeXml(`${gatherBase}${gatherQs}`);
  const speechLang = speechGatherLanguage(lang);

  const prompt =
    lang === "bn"
      ? escapeXml("ধন্যবাদ কল করার জন্য। টোনের পর আপনার প্রশ্ন বলুন।")
      : escapeXml("Thanks for calling. After the tone, say your question in English or Bangla.");
  const reprompt =
    lang === "bn"
      ? escapeXml("দুঃখিত, শুনতে পাইনি। আবার চেষ্টা করুন।")
      : escapeXml("Sorry, I did not catch that. Please try once more.");

  const xml = `<Response>
  <Gather input="speech" action="${gatherUrl}" method="POST" speechTimeout="auto" language="${speechLang}">
    <Say voice="Polly.Matthew">${prompt}</Say>
  </Gather>
  <Gather input="speech" action="${gatherUrl}" method="POST" speechTimeout="3" language="${speechLang}">
    <Say voice="Polly.Matthew">${reprompt}</Say>
  </Gather>
  <Say voice="Polly.Matthew">${escapeXml("We could not hear you. Please call again soon. Goodbye.")}</Say>
</Response>`;

  return twiml(xml);
}
