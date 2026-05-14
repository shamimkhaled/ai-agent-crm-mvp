import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  twilioFormBodyToRecord,
  validateTwilioSignatureAnyCandidate,
  twilioWebhookFullUrl,
  twilioWebhookRequestUrl,
  isVoiceWebhookSmokeAuthorized,
} from "@/lib/twilio/signature";
import { insertVoicePipelineEvent } from "@/lib/twilio/callSessionSupabase";

export const dynamic = "force-dynamic";

function twiml(xml: string) {
  return new NextResponse(`<?xml version="1.0" encoding="UTF-8"?>\n${xml}`, {
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

/**
 * DTMF leg after optional language menu (`TWILIO_VOICE_DTMF_MENU=true`).
 * Maps digit 1 → English, 2 → Bangla, then `<Redirect>` POST to `/voice/inbound?lang=…`.
 */
export async function POST(req: NextRequest) {
  const requestUrl = twilioWebhookRequestUrl(req);
  const params = await twilioFormBodyToRecord(req);
  const sig = req.headers.get("x-twilio-signature");
  const authToken = process.env.TWILIO_AUTH_TOKEN || "";
  const skip = process.env.TWILIO_SKIP_SIGNATURE_VERIFY === "true";

  if (authToken && !skip) {
    const smokeOk = isVoiceWebhookSmokeAuthorized(req);
    if (!smokeOk) {
      const ok = validateTwilioSignatureAnyCandidate(req, params, sig, authToken);
      if (!ok) {
        console.warn("[voice ivr] invalid Twilio signature", { requestUrl, callSid: params.CallSid });
        return new NextResponse("Forbidden", { status: 403 });
      }
    }
  }

  const digit = (params.Digits || "").trim();
  const lang = digit === "2" ? "bn" : "en";
  const callSid = params.CallSid || "";

  if (callSid) {
    await insertVoicePipelineEvent({
      callId: callSid,
      step: "IVR_DTMF_DIGIT",
      detail: `Digits=${digit || "(none)"} → lang=${lang}`,
    });
  }

  const target = `${twilioWebhookFullUrl(req, "/api/webhooks/voice/inbound")}?lang=${encodeURIComponent(lang)}`;
  return twiml(`<Response><Redirect method="POST">${target}</Redirect></Response>`);
}
