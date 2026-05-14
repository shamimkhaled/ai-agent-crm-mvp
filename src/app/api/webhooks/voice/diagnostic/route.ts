import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Operator self-check (browser). Does not expose secret values.
 * Use after a call "completes" but you hear no AI — compare `voiceWebhookUrl` to Twilio Console.
 */
export async function GET() {
  const base = process.env.TWILIO_WEBHOOK_BASE_URL?.replace(/\/$/, "") || null;
  const voiceInbound = base ? `${base}/api/webhooks/voice/inbound` : null;
  const voiceGather = base ? `${base}/api/webhooks/voice/gather` : null;
  const statusUrl = base ? `${base}/api/webhooks/voice/status` : null;

  return NextResponse.json({
    ok: true,
    checks: {
      twilioWebhookBaseUrlSet: Boolean(base),
      twilioAuthTokenSet: Boolean(process.env.TWILIO_AUTH_TOKEN),
      geminiKeySet: Boolean(process.env.GOOGLE_GEMINI_API_KEY),
      supabaseServiceRoleSet: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      signatureVerifySkipped: process.env.TWILIO_SKIP_SIGNATURE_VERIFY === "true",
      smokeSecretConfigured: Boolean(
        process.env.VOICE_WEBHOOK_SMOKE_SECRET && process.env.VOICE_WEBHOOK_SMOKE_SECRET.trim().length >= 24
      ),
      dtmfMenuEnabled: process.env.TWILIO_VOICE_DTMF_MENU === "true",
    },
    urls: {
      /** Paste this EXACT string into Twilio → Phone number → Voice webhook (POST) */
      voiceWebhookUrl: voiceInbound,
      gatherActionBase: voiceGather,
      statusCallbackUrl: statusUrl,
    },
    hints: [
      "If voiceWebhookUrl is null, set TWILIO_WEBHOOK_BASE_URL in .env.local (no trailing slash) and restart next dev.",
      "Twilio Console voice URL must match voiceWebhookUrl character-for-character (https, host, path).",
      "If the Console shows https://webhooks.twilio.com/.../Flows/FW… that is Twilio Studio: the call never hits your Next.js app until you change “A call comes in” to Webhook → your https://<host>/api/webhooks/voice/inbound, or add a Studio “TwiML Redirect” widget to that URL.",
      "If Debugger shows HTTP 403 on /voice/inbound, signature failed: fix base URL + TWILIO_AUTH_TOKEN, set VOICE_WEBHOOK_SMOKE_SECRET and send X-Voice-Webhook-Smoke-Secret for curl tests, or temporarily set TWILIO_SKIP_SIGNATURE_VERIFY=true only while debugging.",
      "If Debugger shows no request to your host, the number is still pointing at Studio or another URL.",
    ],
  });
}
