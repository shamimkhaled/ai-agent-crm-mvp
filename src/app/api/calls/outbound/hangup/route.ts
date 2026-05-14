/**
 * POST /api/calls/outbound/hangup
 *
 * Ends an active outbound call from the dashboard.
 * Calls Twilio REST API to update call status to "completed".
 *
 * Body: { callSid: string }
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function twilioAuthHeader(): string {
  const sid   = process.env.TWILIO_ACCOUNT_SID ?? "";
  const token = process.env.TWILIO_AUTH_TOKEN  ?? "";
  return `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`;
}

export async function POST(req: NextRequest) {
  let body: { callSid?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { callSid } = body;
  if (!callSid) return NextResponse.json({ error: "callSid required" }, { status: 400 });

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  if (!accountSid) {
    return NextResponse.json({ error: "Twilio not configured" }, { status: 503 });
  }

  // ── Tell Twilio to end the call ──────────────────────────────────────────────
  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls/${callSid}.json`,
      {
        method: "POST",
        headers: {
          "Authorization": twilioAuthHeader(),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ Status: "completed" }).toString(),
      }
    );

    const data = await res.json() as { status?: string; message?: string };
    if (!res.ok && res.status !== 404) {
      // 404 = call already ended, that's fine
      console.error("[outbound/hangup] Twilio error:", data);
    }
  } catch (e) {
    console.error("[outbound/hangup] fetch error:", e);
    // Don't fail — still update our DB
  }

  // ── Mark call ended in Supabase ──────────────────────────────────────────────
  const admin = getSupabaseAdmin();
  if (admin) {
    await admin.from("call_sessions").update({
      call_status:     "completed",
      dashboard_state: "outbound_completed",
      updated_at:      new Date().toISOString(),
    }).eq("call_sid", callSid);
  }

  return NextResponse.json({ ok: true, callSid, status: "completed" });
}
