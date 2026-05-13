import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function withRetries<T>(label: string, fn: () => Promise<T>, attempts = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      const msg = e instanceof Error ? e.message : String(e);
      if (i < attempts - 1) {
        console.warn(`[voice/stats] ${label} attempt ${i + 1}/${attempts} failed: ${msg}, retrying…`);
        await sleep(400 * (i + 1));
      }
    }
  }
  throw last;
}

/**
 * Returns live operational metrics for the Live Call Monitor top-bar:
 *   - activeCalls     : call_sessions with ended_at IS NULL
 *   - todayTotal      : call_sessions started today (Asia/Dhaka)
 *   - avgConfidence   : average ai_confidence for today's completed calls
 *   - openEscalations : escalations with status = 'open'
 */
export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const admin = getSupabaseAdmin();
  if (!admin) {
    const missing: string[] = [];
    if (!url) missing.push("NEXT_PUBLIC_SUPABASE_URL");
    if (!key) missing.push("SUPABASE_SERVICE_ROLE_KEY");
    return NextResponse.json(
      {
        ok: false,
        error: "Supabase admin not configured",
        /** Safe to show in browser Network tab — names only, no secrets. */
        missingEnvVars: missing,
        hint:
          missing.length > 0
            ? "Add these in Vercel → Project → Settings → Environment Variables → Production, then redeploy."
            : "Check env values (empty after trim?).",
      },
      { status: 503 }
    );
  }

  // Start of today in Asia/Dhaka (UTC+6)
  const now = new Date();
  const dhakaMidnight = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - 6 * 60 * 60 * 1000
  );

  try {
    const [activeRes, todayRes, confidenceRes, escalationRes] = await withRetries(
      "supabase",
      () =>
        Promise.all([
          admin.from("call_sessions").select("call_sid", { count: "exact", head: true }).is("ended_at", null),
          admin.from("call_sessions").select("call_sid", { count: "exact", head: true }).gte("started_at", dhakaMidnight.toISOString()),
          admin
            .from("call_sessions")
            .select("ai_confidence")
            .gte("started_at", dhakaMidnight.toISOString())
            .not("ai_confidence", "is", null),
          admin.from("escalations").select("id", { count: "exact", head: true }).eq("status", "open"),
        ]),
      3
    );

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
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const cause = e instanceof Error && "cause" in e ? String((e as Error & { cause?: unknown }).cause) : "";
    console.error("[voice/stats] Supabase unreachable:", message, cause);
    return NextResponse.json(
      {
        ok: false,
        error: "Supabase temporarily unreachable",
        detail: `${message}${cause ? ` (${cause})` : ""}`,
        asOf: new Date().toISOString(),
      },
      { status: 503 }
    );
  }
}
