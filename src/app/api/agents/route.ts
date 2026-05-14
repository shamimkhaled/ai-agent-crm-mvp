/**
 * /api/agents
 * GET  — list all AI agents
 * POST — create a new AI agent
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001";

async function resolveOrgId(admin: ReturnType<typeof getSupabaseAdmin>) {
  if (!admin) return DEFAULT_ORG_ID;
  const { data } = await admin.from("organizations").select("id").limit(1).maybeSingle();
  if (data?.id) return data.id as string;
  await admin.from("organizations").upsert(
    { id: DEFAULT_ORG_ID, name: "Default Organization", slug: "default" },
    { onConflict: "slug" }
  );
  return DEFAULT_ORG_ID;
}

const AgentCreateSchema = z.object({
  name:               z.string().min(1).max(120),
  department:         z.string().max(80).optional().default("General"),
  model_provider:     z.enum(["gemini", "openai", "claude", "groq"]).default("gemini"),
  model_id:           z.string().default("gemini-2.5-flash"),
  voice_model:        z.string().optional().default("gemini-2.5-flash"),
  voice_provider:     z.string().optional().default("browser"),
  voice_id:           z.string().optional().nullable(),
  voice_speed:        z.number().min(0.5).max(2.0).optional().default(1.0),
  voice_temperature:  z.number().min(0).max(1).optional().default(0.8),
  transcriber:        z.string().optional().default("deepgram"),
  language:           z.string().optional().default("en"),
  tts_voice:          z.string().optional().default("Polly.Matthew"),
  system_prompt:      z.string().optional().nullable(),
  persona_prompt:     z.string().optional().nullable(),
  first_message:      z.string().optional().nullable(),
  agent_speaks_first: z.boolean().optional().default(true),
  status:             z.enum(["active", "inactive"]).optional().default("active"),
  template_id:        z.string().optional().nullable(),
  connector_ids:      z.array(z.string().uuid()).optional().default([]),
  kb_document_ids:    z.array(z.string().uuid()).optional().default([]),
  escalation_enabled:   z.boolean().optional().default(false),
  confidence_threshold: z.number().int().min(0).max(100).optional().default(70),
  max_turns:            z.number().int().min(1).max(50).optional().default(10),
});

// ── GET ───────────────────────────────────────────────────────────────────────
export async function GET() {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "DB not configured" }, { status: 503 });

  const { data, error } = await admin
    .from("ai_agents")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ agents: data ?? [] });
}

// ── POST ──────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "DB not configured" }, { status: 503 });

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const parsed = AgentCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten().fieldErrors }, { status: 422 });
  }

  const d = parsed.data;
  const now = new Date().toISOString();

  const { data, error } = await admin
    .from("ai_agents")
    .insert({
      name:               d.name,
      department:         d.department,
      model_provider:     d.model_provider,
      model_id:           d.model_id,
      voice_model:        d.voice_model,
      voice_provider:     d.voice_provider,
      voice_id:           d.voice_id,
      voice_speed:        d.voice_speed,
      voice_temperature:  d.voice_temperature,
      transcriber:        d.transcriber,
      language:           d.language,
      tts_voice:          d.tts_voice,
      system_prompt:      d.system_prompt,
      persona_prompt:     d.persona_prompt,
      first_message:      d.first_message,
      agent_speaks_first: d.agent_speaks_first,
      status:             d.status,
      template_id:        d.template_id,
      connector_ids:      d.connector_ids,
      kb_document_ids:    d.kb_document_ids,
      escalation_enabled: d.escalation_enabled,
      confidence_threshold: d.confidence_threshold,
      max_turns:          d.max_turns,
      updated_at:         now,
    })
    .select()
    .single();

  if (error) {
    console.error("[agents POST]", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ agent: data }, { status: 201 });
}
