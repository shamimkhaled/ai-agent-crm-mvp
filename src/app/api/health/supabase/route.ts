import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const start = Date.now();
  try {
    const admin = getSupabaseAdmin();
    if (!admin) {
      return NextResponse.json({
        ok: false,
        error: "SUPABASE_SERVICE_ROLE_KEY not set. Save it in API Credentials or add to .env.local.",
      });
    }

    // Simple round-trip: count rows in ai_agents
    const { count, error } = await admin
      .from("ai_agents")
      .select("*", { count: "exact", head: true });

    const latencyMs = Date.now() - start;

    if (error) {
      return NextResponse.json({ ok: false, error: error.message, latencyMs });
    }

    return NextResponse.json({ ok: true, latencyMs, agentCount: count ?? 0 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg.slice(0, 300), latencyMs: Date.now() - start });
  }
}
