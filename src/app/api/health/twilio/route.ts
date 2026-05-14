import { NextResponse } from "next/server";
import { getPlatformSetting } from "@/lib/platformSettings";

export const dynamic = "force-dynamic";

export async function GET() {
  const start = Date.now();
  try {
    const accountSid = await getPlatformSetting("TWILIO_ACCOUNT_SID");
    const authToken  = await getPlatformSetting("TWILIO_AUTH_TOKEN");

    if (!accountSid || !authToken) {
      return NextResponse.json({
        ok: false,
        error: "TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN not set. Save them in API Credentials.",
      });
    }

    // Hit the Twilio Accounts API — this confirms credentials are valid
    const credentials = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}.json`, {
      headers: { Authorization: `Basic ${credentials}` },
    });

    const latencyMs = Date.now() - start;

    if (!res.ok) {
      const body = await res.text();
      return NextResponse.json({
        ok: false,
        error: `Twilio returned ${res.status}: ${body.slice(0, 200)}`,
        latencyMs,
      });
    }

    const data = await res.json() as { friendly_name?: string; status?: string };
    return NextResponse.json({
      ok: true,
      latencyMs,
      account: data.friendly_name ?? accountSid,
      status: data.status,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg.slice(0, 300), latencyMs: Date.now() - start });
  }
}
