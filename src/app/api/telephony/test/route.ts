import { NextResponse } from "next/server";
import { httpsGetJson } from "@/lib/telephony/carrierHttps";

export const dynamic = "force-dynamic";

/** Outbound HTTPS to carrier APIs (Twilio can be slow or blocked on some networks). */
const CARRIER_HTTPS_TIMEOUT_MS = 28_000;

type Body = {
  provider?: "twilio" | "exotel" | "plivo" | "telnyx";
  accountSid?: string;
  authToken?: string;
  apiKey?: string;
  apiSecret?: string;
};

function basicAuth(user: string, pass: string) {
  const raw = `${user}:${pass}`;
  return `Basic ${Buffer.from(raw, "utf8").toString("base64")}`;
}

export async function POST(req: Request) {
  const started = performance.now();
  let provider: NonNullable<Body["provider"]> = "twilio";
  try {
    const body: Body = await req.json().catch(() => ({}));
    provider = body.provider ?? "twilio";

    const twilioSid = body.accountSid?.trim() || process.env.TWILIO_ACCOUNT_SID || "";
    const twilioToken = body.authToken?.trim() || process.env.TWILIO_AUTH_TOKEN || "";

    if (provider === "twilio") {
      if (!twilioSid || !twilioToken) {
        return NextResponse.json({
          ok: false,
          provider,
          latencyMs: Math.round(performance.now() - started),
          message:
            "Add Account SID and Auth Token in the form, or set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in your server environment.",
        });
      }
      const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(twilioSid)}.json`;
      const res = await httpsGetJson(url, { Authorization: basicAuth(twilioSid, twilioToken) }, CARRIER_HTTPS_TIMEOUT_MS);
      const latencyMs = Math.round(performance.now() - started);
      if (res.statusCode < 200 || res.statusCode >= 300) {
        return NextResponse.json({
          ok: false,
          provider,
          latencyMs,
          message: `Twilio returned ${res.statusCode}. Check SID and Auth Token. ${res.text.slice(0, 120)}`,
        });
      }
      let data: { friendly_name?: string; status?: string } = {};
      try {
        data = JSON.parse(res.text || "{}") as { friendly_name?: string; status?: string };
      } catch {
        return NextResponse.json({
          ok: false,
          provider,
          latencyMs,
          message: "Twilio returned non-JSON body. Check credentials and try again.",
        });
      }
      return NextResponse.json({
        ok: true,
        provider,
        latencyMs,
        message: `Connected as ${data.friendly_name ?? twilioSid} (${data.status ?? "active"})`,
      });
    }

    if (provider === "plivo") {
      const authId = body.accountSid?.trim() || body.apiKey?.trim();
      const authToken = body.authToken?.trim() || body.apiSecret?.trim();
      if (!authId || !authToken) {
        return NextResponse.json({
          ok: false,
          provider,
          latencyMs: Math.round(performance.now() - started),
          message: "Plivo needs Auth ID and Auth Token (use Account SID + Auth Token fields).",
        });
      }
      const url = `https://api.plivo.com/v1/Account/${encodeURIComponent(authId)}/`;
      const res = await httpsGetJson(url, { Authorization: basicAuth(authId, authToken) }, CARRIER_HTTPS_TIMEOUT_MS);
      const latencyMs = Math.round(performance.now() - started);
      if (res.statusCode < 200 || res.statusCode >= 300) {
        return NextResponse.json({
          ok: false,
          provider,
          latencyMs,
          message: `Plivo returned ${res.statusCode}. ${res.text.slice(0, 120)}`,
        });
      }
      return NextResponse.json({
        ok: true,
        provider,
        latencyMs,
        message: "Plivo account credentials verified.",
      });
    }

    if (provider === "telnyx") {
      const key = body.apiKey?.trim() || process.env.TELNYX_API_KEY || "";
      if (!key) {
        return NextResponse.json({
          ok: false,
          provider,
          latencyMs: Math.round(performance.now() - started),
          message: "Telnyx needs an API key (V2 key) in the API Key field or TELNYX_API_KEY in .env.",
        });
      }
      const res = await httpsGetJson(
        "https://api.telnyx.com/v2/balance",
        { Authorization: `Bearer ${key}` },
        CARRIER_HTTPS_TIMEOUT_MS
      );
      const latencyMs = Math.round(performance.now() - started);
      if (res.statusCode < 200 || res.statusCode >= 300) {
        return NextResponse.json({
          ok: false,
          provider,
          latencyMs,
          message: `Telnyx returned ${res.statusCode}. ${res.text.slice(0, 120)}`,
        });
      }
      return NextResponse.json({
        ok: true,
        provider,
        latencyMs,
        message: "Telnyx API key verified (balance endpoint).",
      });
    }

    // Exotel: regional APIs vary — validate presence then synthetic OK for MVP
    if (provider === "exotel") {
      const sid = body.accountSid?.trim();
      const key = body.apiKey?.trim();
      const token = body.authToken?.trim() || body.apiSecret?.trim();
      const latencyMs = Math.round(performance.now() - started);
      if (!sid || !key || !token) {
        return NextResponse.json({
          ok: false,
          provider,
          latencyMs,
          message: "Exotel needs SID, API Key, and Token filled in. Use your Exotel dashboard values.",
        });
      }
      return NextResponse.json({
        ok: true,
        provider,
        latencyMs,
        message:
          "Exotel fields saved. Live HTTP check is region-specific — confirm in Exotel console or wire their Campaigns API next.",
        mode: "exotel-fields-ok",
      });
    }

    const latencyMs = Math.round(performance.now() - started);
    return NextResponse.json({
      ok: true,
      provider,
      latencyMs,
      message: "Unknown provider — synthetic OK.",
    });
  } catch (e) {
    const latencyMs = Math.round(performance.now() - started);
    let message = e instanceof Error ? e.message : "Network or server error during telephony test.";
    if (e instanceof Error && e.cause instanceof Error) {
      message += ` — ${e.cause.name}: ${e.cause.message}`;
    }
    const lower = message.toLowerCase();
    if (lower.includes("timeout") || lower.includes("etimedout") || lower.includes("connect")) {
      message +=
        " Outbound HTTPS from this machine to the carrier API could not complete. Try: different network/VPN off, corporate proxy (HTTP_PROXY/HTTPS_PROXY), or from a deployed host (Vercel) if local ISP blocks Twilio.";
    }
    return NextResponse.json({ ok: false, provider, latencyMs, message }, { status: 500 });
  }
}
