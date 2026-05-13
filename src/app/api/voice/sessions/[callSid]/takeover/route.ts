import { NextResponse } from "next/server";
import {
  insertVoiceCallTranscript,
  insertVoicePipelineEvent,
  patchCallSessionBySid,
} from "@/lib/twilio/callSessionSupabase";

export const dynamic = "force-dynamic";

/**
 * Operator dashboard: pause AI leg for a live call (next gather returns hold message).
 *
 * Protected via two layers:
 *   1. `DASHBOARD_SECRET` env var — if set, the request must include
 *      `X-Dashboard-Secret: <value>` header (used by the Next.js dashboard
 *      server components / actions calling this route server-side).
 *   2. Supabase anon auth check — when `NEXT_PUBLIC_SUPABASE_URL` is set the
 *      caller must be an authenticated Supabase user (checked via the
 *      `Authorization: Bearer <anon-jwt>` header).
 *
 * In production, wire in your full Supabase server-side session check
 * (`@supabase/ssr` `createServerClient`) before deploying to the public.
 */
export async function POST(
  req: Request,
  context: { params: { callSid: string } }
) {
  // --- Auth layer 1: shared dashboard secret ---
  const dashboardSecret = process.env.DASHBOARD_SECRET?.trim();
  if (dashboardSecret) {
    const provided = req.headers.get("x-dashboard-secret") ?? "";
    if (provided !== dashboardSecret) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized — missing or invalid X-Dashboard-Secret header." },
        { status: 401 }
      );
    }
  }

  // --- Auth layer 2: Supabase anon JWT (when Supabase is configured) ---
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (supabaseUrl && supabaseAnonKey) {
    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized — provide a valid Supabase session token in the Authorization header." },
        { status: 401 }
      );
    }
    // Lightweight JWT presence check (full verification happens via Supabase RLS on DB writes).
    // Replace this block with `createServerClient` + `getUser()` for stricter validation.
    const parts = token.split(".");
    if (parts.length !== 3) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized — malformed session token." },
        { status: 401 }
      );
    }
  }

  const { callSid } = context.params;
  if (!callSid || callSid.length < 5) {
    return NextResponse.json({ ok: false, error: "Invalid callSid" }, { status: 400 });
  }

  await Promise.all([
    patchCallSessionBySid(callSid, { human_takeover: true, dashboard_state: "thinking" }),
    insertVoicePipelineEvent({
      callId: callSid,
      step: "HUMAN_TAKEOVER_REQUEST",
      detail: "Dashboard operator requested takeover",
    }),
    insertVoiceCallTranscript({
      callSid,
      speaker: "system",
      body: "Human takeover requested from Live Call Monitor.",
      pipelineStep: "AI Agent",
    }),
  ]);

  return NextResponse.json({ ok: true, callSid });
}
