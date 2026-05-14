/**
 * POST /api/calls/outbound/status
 *
 * Twilio status callback — called on every call lifecycle event:
 *   initiated → ringing → answered (in-progress) → completed / failed / busy / no-answer
 *
 * Updates call_sessions in Supabase so the dashboard can react via realtime.
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let callSid    = "";
  let callStatus = "";
  let duration   = "";
  let amdStatus  = "";  // Machine Detection result

  try {
    const form = await req.formData();
    callSid    = form.get("CallSid")?.toString()         ?? "";
    callStatus = form.get("CallStatus")?.toString()      ?? "";
    duration   = form.get("CallDuration")?.toString()    ?? "";
    amdStatus  = form.get("AnsweredBy")?.toString()      ?? ""; // human/machine_start/machine_end_behavior_silence
  } catch {
    return NextResponse.json({ error: "Invalid form" }, { status: 400 });
  }

  if (!callSid) return NextResponse.json({ ok: true });

  console.log(`[outbound/status] ${callSid} → ${callStatus} ${amdStatus ? `(${amdStatus})` : ""}`);

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ ok: true });

  const dashboardState = (() => {
    switch (callStatus) {
      case "initiated":    return "outbound_initiated";
      case "ringing":      return "outbound_ringing";
      case "in-progress":  return "outbound_active";
      case "completed":    return "outbound_completed";
      case "busy":         return "outbound_busy";
      case "no-answer":    return "outbound_no_answer";
      case "failed":       return "outbound_failed";
      case "canceled":     return "outbound_canceled";
      default:             return "outbound_unknown";
    }
  })();

  // If machine detected, flag it in meta
  const extraMeta: Record<string, unknown> = {};
  if (amdStatus) extraMeta.answered_by = amdStatus;
  if (duration)  extraMeta.duration_seconds = parseInt(duration, 10);

  // Update call_sessions — need to merge meta carefully
  const { data: existing } = await admin
    .from("call_sessions")
    .select("id, meta")
    .eq("call_sid", callSid)
    .maybeSingle();

  if (existing) {
    const row = existing as { id: string; meta: Record<string, unknown> };
    await admin.from("call_sessions").update({
      call_status:     callStatus,
      dashboard_state: dashboardState,
      updated_at:      new Date().toISOString(),
      meta: { ...(row.meta ?? {}), ...extraMeta },
    }).eq("id", row.id);
  }

  return NextResponse.json({ ok: true });
}

/** GET for health check */
export async function GET() {
  return NextResponse.json({ ok: true, endpoint: "outbound status callback" });
}
