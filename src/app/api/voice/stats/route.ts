import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

const ZERO = { ok: true, activeCalls: 0, todayTotal: 0, avgConfidence: null, openEscalations: 0 };

/**
 * GET /api/voice/stats
 * Always returns HTTP 200 with usable values.
 * Each query is isolated — one broken table never crashes the whole response.
 */
export async function GET() {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ ...ZERO, asOf: new Date().toISOString(), warn: "Supabase not configured" });
  }

  const now = new Date();
  const sinceStr = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - 6 * 60 * 60 * 1000
  ).toISOString();

  // Run all queries in parallel, each with individual error handling
  const [activeRes, todayRes, confRes, escalRes] = await Promise.allSettled([
    admin.from("call_sessions").select("call_sid", { count: "exact", head: true }).is("ended_at", null),
    admin.from("call_sessions").select("call_sid", { count: "exact", head: true }).gte("started_at", sinceStr),
    admin.from("call_sessions").select("ai_confidence").gte("started_at", sinceStr).not("ai_confidence", "is", null),
    admin.from("escalations").select("id", { count: "exact", head: true }).eq("status", "open"),
  ]);

  const activeCalls   = activeRes.status   === "fulfilled" ? (activeRes.value.count   ?? 0) : 0;
  const todayTotal    = todayRes.status    === "fulfilled" ? (todayRes.value.count    ?? 0) : 0;
  const openEscalations = escalRes.status === "fulfilled" ? (escalRes.value.count    ?? 0) : 0;

  let avgConfidence: number | null = null;
  if (confRes.status === "fulfilled" && confRes.value.data?.length) {
    const rows = confRes.value.data as { ai_confidence: number }[];
    avgConfidence = Math.round(rows.reduce((a, b) => a + (b.ai_confidence ?? 0), 0) / rows.length);
  }

  return NextResponse.json({
    ok: true,
    activeCalls,
    todayTotal,
    avgConfidence,
    openEscalations,
    asOf: new Date().toISOString(),
  });
}
