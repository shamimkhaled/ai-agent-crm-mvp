import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

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
  try {
    const body: Body = await req.json().catch(() => ({}));
    const provider = body.provider ?? "twilio";

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
      const res = await fetch(url, {
        headers: { Authorization: basicAuth(twilioSid, twilioToken) },
        cache: "no-store",
      });
      const latencyMs = Math.round(performance.now() - started);
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        return NextResponse.json({
          ok: false,
          provider,
          latencyMs,
          message: `Twilio returned ${res.status}. Check SID and Auth Token. ${text.slice(0, 120)}`,
        });
      }
      const data = (await res.json().catch(() => ({}))) as { friendly_name?: string; status?: string };
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
      const res = await fetch(url, {
        headers: { Authorization: basicAuth(authId, authToken) },
        cache: "no-store",
      });
      const latencyMs = Math.round(performance.now() - started);
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        return NextResponse.json({
          ok: false,
          provider,
          latencyMs,
          message: `Plivo returned ${res.status}. ${text.slice(0, 120)}`,
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
      const res = await fetch("https://api.telnyx.com/v2/balance", {
        headers: { Authorization: `Bearer ${key}` },
        cache: "no-store",
      });
      const latencyMs = Math.round(performance.now() - started);
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        return NextResponse.json({
          ok: false,
          provider,
          latencyMs,
          message: `Telnyx returned ${res.status}. ${text.slice(0, 120)}`,
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
    return NextResponse.json(
      {
        ok: false,
        latencyMs,
        message: e instanceof Error ? e.message : "Network or server error during telephony test.",
      },
      { status: 500 }
    );
  }
}
