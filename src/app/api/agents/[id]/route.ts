import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const AgentUpdateSchema = z.object({
  // ── Core identity ────────────────────────────────────────────────────────
  name:           z.string().min(1).max(120).optional(),
  department:     z.string().max(80).optional(),
  status:         z.enum(["active", "inactive"]).optional(),
  template_id:    z.string().optional().nullable(),

  // ── Model / LLM ──────────────────────────────────────────────────────────
  model_provider: z.string().max(50).optional(),
  model_id:       z.string().max(100).optional(),
  voice_model:    z.string().optional(),              // legacy alias for model_id

  // ── Voice / TTS ──────────────────────────────────────────────────────────
  voice_provider:    z.string().max(50).optional(),
  voice_id:          z.string().optional().nullable(),
  voice_speed:       z.number().min(0.5).max(2.0).optional(),
  voice_temperature: z.number().min(0).max(1).optional(),
  tts_voice:         z.string().optional(),            // legacy Twilio/Polly voice

  // ── STT / Transcription ───────────────────────────────────────────────────
  transcriber: z.string().max(50).optional(),

  // ── Language ─────────────────────────────────────────────────────────────
  language: z.string().max(20).optional(),

  // ── Prompts & messaging ──────────────────────────────────────────────────
  system_prompt:      z.string().optional().nullable(),
  persona_prompt:     z.string().optional().nullable(),
  first_message:      z.string().optional().nullable(),
  agent_speaks_first: z.boolean().optional(),

  // ── Behaviour / safety ───────────────────────────────────────────────────
  escalation_enabled:   z.boolean().optional(),
  confidence_threshold: z.number().min(0).max(100).optional(),
  max_turns:            z.number().int().min(1).max(500).optional(),

  // ── Array linkage — full replacement ────────────────────────────────────
  connector_ids:    z.array(z.string().uuid()).optional(),
  kb_document_ids:  z.array(z.string().uuid()).optional(),

  // ── Incremental array helpers ────────────────────────────────────────────
  add_connector_id:      z.string().uuid().optional(),
  remove_connector_id:   z.string().uuid().optional(),
  add_kb_document_id:    z.string().uuid().optional(),
  remove_kb_document_id: z.string().uuid().optional(),
});

/** GET /api/agents/[id] */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "DB not configured" }, { status: 503 });

  const { data, error } = await admin
    .from("ai_agents")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Not found" }, { status: 404 });
  }
  return NextResponse.json({ agent: data });
}

/** PATCH /api/agents/[id] */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "DB not configured" }, { status: 503 });

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const parsed = AgentUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten().fieldErrors }, { status: 422 });
  }

  const updates = parsed.data;

  // ── Handle incremental array mutations ──────────────────────────────────
  if (
    updates.add_connector_id ||
    updates.remove_connector_id ||
    updates.add_kb_document_id ||
    updates.remove_kb_document_id
  ) {
    // Fetch current arrays
    const { data: current, error: fetchErr } = await admin
      .from("ai_agents")
      .select("connector_ids, kb_document_ids")
      .eq("id", params.id)
      .maybeSingle();

    if (fetchErr || !current) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    const cur = current as { connector_ids: string[]; kb_document_ids: string[] };
    let connIds: string[] = cur.connector_ids ?? [];
    let kbIds:   string[] = cur.kb_document_ids ?? [];

    if (updates.add_connector_id && !connIds.includes(updates.add_connector_id)) {
      connIds = [...connIds, updates.add_connector_id];
    }
    if (updates.remove_connector_id) {
      connIds = connIds.filter((id) => id !== updates.remove_connector_id);
    }
    if (updates.add_kb_document_id && !kbIds.includes(updates.add_kb_document_id)) {
      kbIds = [...kbIds, updates.add_kb_document_id];
    }
    if (updates.remove_kb_document_id) {
      kbIds = kbIds.filter((id) => id !== updates.remove_kb_document_id);
    }

    updates.connector_ids   = connIds;
    updates.kb_document_ids = kbIds;
  }

  // ── Build update payload (drop incremental helpers) ─────────────────────
  const {
    add_connector_id: _a,
    remove_connector_id: _b,
    add_kb_document_id: _c,
    remove_kb_document_id: _d,
    ...patch
  } = updates;
  void _a; void _b; void _c; void _d;

  const payload = { ...patch, updated_at: new Date().toISOString() };

  const { data: updated, error: updErr } = await admin
    .from("ai_agents")
    .update(payload)
    .eq("id", params.id)
    .select()
    .single();

  if (updErr) {
    console.error("[agents PATCH]", updErr.message);
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  return NextResponse.json({ agent: updated, message: "Agent updated" });
}

/** DELETE /api/agents/[id] */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "DB not configured" }, { status: 503 });

  const { error } = await admin.from("ai_agents").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
