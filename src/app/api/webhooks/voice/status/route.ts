import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  twilioFormBodyToRecord,
  validateTwilioSignature,
  twilioWebhookRequestUrl,
} from "@/lib/twilio/signature";
import { insertVoicePipelineEvent, updateCallSessionStatus } from "@/lib/twilio/callSessionSupabase";

export const dynamic = "force-dynamic";

/**
 * Twilio call status callback (no TwiML body required).
 * Configure under your number or TwiML app: Status Callback URL → POST here.
 */
export async function POST(req: NextRequest) {
  const requestUrl = twilioWebhookRequestUrl(req);
  const params = await twilioFormBodyToRecord(req);
  const sig = req.headers.get("x-twilio-signature");
  const authToken = process.env.TWILIO_AUTH_TOKEN || "";
  const skip = process.env.TWILIO_SKIP_SIGNATURE_VERIFY === "true";

  if (authToken && !skip) {
    const ok = validateTwilioSignature(requestUrl, params, sig, authToken);
    if (!ok) return new NextResponse("Forbidden", { status: 403 });
  }

  const { CallSid, CallStatus, From, To, CallDuration } = params;
  console.info("[voice status]", { CallSid, CallStatus, From, To, CallDuration });

  if (CallSid) {
    await updateCallSessionStatus(params);
    await insertVoicePipelineEvent({
      callId: CallSid,
      step: "STATUS",
      detail: `CallStatus=${CallStatus ?? ""} Duration=${CallDuration ?? ""}`,
    });
  }

  return new NextResponse("", { status: 204 });
}
