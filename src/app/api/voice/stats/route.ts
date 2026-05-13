import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Returns live operational metrics for the Live Call Monitor top-bar:
 *   - activeCalls     : call_sessions with ended_at IS NULL
 *   - todayTotal      : call_sessions started today (Asia/Dhaka)
 *   - avgConfidence   : average ai_confidence for today's completed calls
 *   - openEscalations : escalations with status = 'open'
 */
export async function GET() {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "Supabase service role not configured" }, { status: 503 });
  }

  // Start of today in Asia/Dhaka (UTC+6)
  const now = new Date();
  const dhakaMidnight = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - 6 * 60 * 60 * 1000
  );

  const [activeRes, todayRes, confidenceRes, escalationRes] = await Promise.all([
    admin.from("call_sessions").select("call_sid", { count: "exact", head: true }).is("ended_at", null),
    admin.from("call_sessions").select("call_sid", { count: "exact", head: true }).gte("started_at", dhakaMidnight.toISOString()),
    admin.from("call_sessions").select("ai_confidence").gte("started_at", dhakaMidnight.toISOString()).not("ai_confidence", "is", null),
    admin.from("escalations").select("id", { count: "exact", head: true }).eq("status", "open"),
  ]);

  let avgConfidence: number | null = null;
  if (confidenceRes.data && confidenceRes.data.length > 0) {
    const vals = (confidenceRes.data as { ai_confidence: number }[]).map((r) => r.ai_confidence);
    avgConfidence = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  }

  return NextResponse.json({
    ok: true,
    activeCalls: activeRes.count ?? 0,
    todayTotal: todayRes.count ?? 0,
    avgConfidence,
    openEscalations: escalationRes.count ?? 0,
    asOf: new Date().toISOString(),
  });
}
