/**
 * POST /api/calls/outbound
 *
 * Initiates a real outbound phone call from your AI Voice Agent to a customer.
 * Uses Twilio REST API directly (no SDK required).
 *
 * Flow:
 *   Dashboard → POST here → Twilio creates call → Customer phone rings →
 *   Customer answers → Twilio fetches /api/calls/outbound/twiml → AI conversation begins
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

interface OutboundCallRequest {
  to: string;           // Customer phone number (E.164 or local BD format)
  agentId: string;      // Which AI agent to use
  from?: string;        // Override from-number (uses TWILIO_PHONE_NUMBER by default)
}

/** Normalise a Bangladesh or international phone number to E.164. */
function normalizePhone(raw: string): string {
  const stripped = raw.replace(/\s|-|\(|\)/g, "");
  // Bangladesh: 01XXXXXXXXX → +8801XXXXXXXXX
  if (/^01[3-9]\d{8}$/.test(stripped)) return `+880${stripped}`;
  // Bangladesh with country code: 8801XXXXXXXXX
  if (/^8801[3-9]\d{8}$/.test(stripped)) return `+${stripped}`;
  // Already E.164
  if (/^\+\d{7,15}$/.test(stripped)) return stripped;
  throw new Error(
    `Invalid phone number: "${raw}". Use E.164 (+8801XXXXXXXXX) or local BD format (01XXXXXXXXX).`
  );
}

/** Reject obvious placeholder / invalid caller IDs before hitting Twilio. */
function validateFromNumber(fromNumber: string): string | null {
  const t = fromNumber.trim();
  if (!t) return "No caller ID (From) configured.";
  if (/[xX]/.test(t)) {
    return "TWILIO_PHONE_NUMBER still contains placeholder characters (X). Set it to your real Twilio number.";
  }
  if (!/^\+\d{10,15}$/.test(t)) {
    return `Invalid From number format: "${t}". Use E.164 (e.g. +15551234567).`;
  }
  // US +1 followed by 10 identical digits (e.g. +19999999999) — never a real Twilio line
  const m = t.match(/^\+1(\d)\1{9}$/);
  if (m) {
    return "From number looks like a test pattern (+1 repeated digits). Use the exact number shown in Twilio Console → Phone Numbers.";
  }
  return null;
}

/** Map Twilio REST failure to HTTP status + user hint. */
function twilioErrorResponse(data: { message?: string; code?: number }, twilioHttpStatus: number) {
  const msg = data.message ?? "Twilio call initiation failed";
  const code = data.code;

  let hint: string | undefined;
  if (/not yet verified|verified for your account|is not a valid phone number/i.test(msg)) {
    hint =
      "Open https://console.twilio.com/us1/develop/phone-numbers/manage/incoming — copy your purchased Twilio number into TWILIO_PHONE_NUMBER in .env.local (or assign that number to this agent in Phone Numbers). Trial accounts can only call verified numbers unless you use a purchased caller ID.";
  } else if (/Authenticate/i.test(msg)) {
    hint = "Check TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in .env.local.";
  }

  // Twilio uses 400 for most request errors (invalid From/To, unverified, etc.)
  const status =
    twilioHttpStatus === 400 ? 400 :
    twilioHttpStatus === 401 || twilioHttpStatus === 403 ? 401 :
    twilioHttpStatus >= 500 ? 502 : 400;

  return NextResponse.json(
    { error: msg, twilioCode: code, hint },
    { status }
  );
}

/** Build Twilio Basic Auth header from env credentials. */
function twilioAuthHeader(): string {
  const sid   = process.env.TWILIO_ACCOUNT_SID ?? "";
  const token = process.env.TWILIO_AUTH_TOKEN  ?? "";
  if (!sid || !token) throw new Error("TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN not configured.");
  return `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`;
}

export async function POST(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "DB not configured" }, { status: 503 });
  }

  let body: OutboundCallRequest;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { agentId, from } = body;
  let toE164: string;

  if (!agentId) return NextResponse.json({ error: "agentId required" }, { status: 400 });
  if (!body.to)  return NextResponse.json({ error: "to (phone number) required" }, { status: 400 });

  try {
    toE164 = normalizePhone(body.to);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }

  // ── Load agent config ────────────────────────────────────────────────────────
  const { data: agent, error: agErr } = await admin
    .from("ai_agents")
    .select("id, name, system_prompt, first_message, agent_speaks_first, language, tts_voice, voice_provider, voice_id, voice_speed, status")
    .eq("id", agentId)
    .maybeSingle();

  if (agErr || !agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }
  if ((agent as { status: string }).status !== "active") {
    return NextResponse.json({ error: "Agent is not active. Enable it in the Agent settings." }, { status: 400 });
  }

  // ── Resolve FROM phone number ────────────────────────────────────────────────
  // Priority: request override → agent's assigned number → TWILIO_PHONE_NUMBER env
  let fromNumber = from?.trim() ?? "";

  if (!fromNumber) {
    // Look for a phone number assigned to this agent
    const { data: assignedPhone } = await admin
      .from("phone_numbers")
      .select("phone_number")
      .eq("ai_agent_id", agentId)
      .limit(1)
      .maybeSingle();

    fromNumber = (assignedPhone as { phone_number?: string } | null)?.phone_number ?? "";
  }

  if (!fromNumber) {
    fromNumber = process.env.TWILIO_PHONE_NUMBER?.trim() ?? "";
  }

  if (!fromNumber) {
    return NextResponse.json(
      {
        error:
          "No Twilio FROM number configured. " +
          "Add TWILIO_PHONE_NUMBER to .env.local or assign a phone number to this agent.",
        hint: "Twilio Console → Phone Numbers → Manage → Active numbers → copy E.164 into TWILIO_PHONE_NUMBER, then restart `npm run dev`.",
      },
      { status: 400 }
    );
  }

  const fromErr = validateFromNumber(fromNumber);
  if (fromErr) {
    return NextResponse.json(
      { error: fromErr, hint: "Use the exact number Twilio issued you (starts with +). Never use placeholders like +1XXXXXXXXXX or +19999999999." },
      { status: 400 }
    );
  }

  // ── Build Twilio call webhook URLs ───────────────────────────────────────────
  const baseUrl = process.env.TWILIO_WEBHOOK_BASE_URL?.replace(/\/$/, "")
    ?? process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "")
    ?? "";

  if (!baseUrl) {
    return NextResponse.json(
      { error: "TWILIO_WEBHOOK_BASE_URL not configured in .env.local" },
      { status: 500 }
    );
  }

  const twimlUrl    = `${baseUrl}/api/calls/outbound/twiml?agentId=${agentId}`;
  const statusUrl   = `${baseUrl}/api/calls/outbound/status`;
  const accountSid  = process.env.TWILIO_ACCOUNT_SID!;

  // ── Create Twilio call via REST ──────────────────────────────────────────────
  const callParams = new URLSearchParams({
    To:                   toE164,
    From:                 fromNumber,
    Url:                  twimlUrl,
    StatusCallback:       statusUrl,
    StatusCallbackMethod: "POST",
    // Get all status events
    "StatusCallbackEvent[0]": "initiated",
    "StatusCallbackEvent[1]": "ringing",
    "StatusCallbackEvent[2]": "answered",
    "StatusCallbackEvent[3]": "completed",
    MachineDetection:     "Enable",             // Detect voicemail
    AsyncAmdStatusCallback: `${baseUrl}/api/calls/outbound/status`,
    Record:               "false",
    Timeout:              "30",                 // Ring timeout in seconds
  });

  let twilioCalls: { sid: string; status: string; error_message?: string };
  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`,
      {
        method: "POST",
        headers: {
          "Authorization": twilioAuthHeader(),
          "Content-Type":  "application/x-www-form-urlencoded",
        },
        body: callParams.toString(),
      }
    );

    const data = await res.json() as { sid?: string; status?: string; message?: string; code?: number };

    if (!res.ok) {
      console.error("[outbound] Twilio error:", res.status, data);
      return twilioErrorResponse(data, res.status);
    }
    twilioCalls = { sid: data.sid!, status: data.status! };
  } catch (e) {
    return NextResponse.json({ error: `Network error calling Twilio: ${String(e)}` }, { status: 502 });
  }

  // ── Persist call to Supabase ─────────────────────────────────────────────────
  const ag = agent as {
    name: string; language: string | null; tts_voice: string | null;
    first_message: string | null; agent_speaks_first: boolean | null;
  };

  await admin.from("call_sessions").insert({
    call_sid:       twilioCalls.sid,
    from_e164:      fromNumber,
    to_e164:        toE164,
    agent_id:       agentId,
    call_status:    twilioCalls.status,
    dashboard_state: "outbound_initiated",
    pipeline_step_index: 0,
    started_at:     new Date().toISOString(),
    updated_at:     new Date().toISOString(),
    meta: {
      direction:      "outbound",
      agent_name:     ag.name,
      agent_language: ag.language ?? "en",
      tts_voice:      ag.tts_voice,
      conversation:   [] as Array<{ role: string; text: string; ts: number }>,
    },
  }).select().single();

  console.log(`[outbound] Call ${twilioCalls.sid} initiated → ${toE164} (agent: ${ag.name})`);

  return NextResponse.json({
    ok: true,
    callSid:  twilioCalls.sid,
    status:   twilioCalls.status,
    to:       toE164,
    from:     fromNumber,
    agentName: ag.name,
  });
}
