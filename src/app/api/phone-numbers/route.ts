/**
 * /api/phone-numbers
 * GET  — list all phone numbers with their assigned agent
 * POST — add a new phone number
 *
 * Uses the service-role admin client to bypass RLS
 * (phone_numbers requires `authenticated` role for writes).
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001";

// ── helper: resolve org id ────────────────────────────────────────────────────
async function resolveOrgId(admin: ReturnType<typeof getSupabaseAdmin>) {
  if (!admin) return DEFAULT_ORG_ID;

  const { data } = await admin
    .from("organizations")
    .select("id")
    .limit(1)
    .maybeSingle();

  if (data?.id) return data.id as string;

  // Upsert default org
  await admin.from("organizations").upsert(
    { id: DEFAULT_ORG_ID, name: "Default Organization", slug: "default" },
    { onConflict: "slug" }
  );
  return DEFAULT_ORG_ID;
}

// ── GET ───────────────────────────────────────────────────────────────────────
export async function GET() {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "DB not configured" }, { status: 503 });

  const { data, error } = await admin
    .from("phone_numbers")
    .select(`
      id, e164, label, provider_kind, language, tts_voice, description,
      ai_agent_id,
      ai_agents ( id, name, department )
    `)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

// ── POST ──────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "DB not configured" }, { status: 503 });

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { e164, label, provider_kind, ai_agent_id } =
    body as { e164?: string; label?: string; provider_kind?: string; ai_agent_id?: string };

  if (!e164?.trim()) {
    return NextResponse.json({ error: "e164 (phone number) is required" }, { status: 422 });
  }

  const orgId = await resolveOrgId(admin);

  const { data, error } = await admin
    .from("phone_numbers")
    .insert({
      e164: e164.trim(),
      label: label?.trim() || null,
      provider_kind: (provider_kind ?? "twilio").trim(),
      ai_agent_id: ai_agent_id || null,
      organization_id: orgId,
      meta: {},
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
