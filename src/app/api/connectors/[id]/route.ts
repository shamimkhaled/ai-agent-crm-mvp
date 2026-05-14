import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const ConnectorUpdateSchema = z.object({
  connector_name: z.string().min(1).max(120).optional(),
  base_url: z.string().url().optional(),
  endpoint: z.string().min(1).max(500).optional(),
  method: z.enum(["GET", "POST"]).optional(),
  auth_type: z.enum(["none", "api_key", "bearer", "basic"]).optional(),
  api_key: z.string().optional().nullable(),
  bearer_token: z.string().optional().nullable(),
  username: z.string().optional().nullable(),
  password: z.string().optional().nullable(),
  custom_headers: z.record(z.string(), z.string()).optional().nullable(),
  sync_frequency: z.enum(["manual", "hourly", "daily", "weekly"]).optional(),
  agent_id: z.string().uuid().optional().nullable(),
  description: z.string().max(500).optional().nullable(),
});

function maskSensitiveFields(row: Record<string, unknown>): Record<string, unknown> {
  const cfg = (row.config ?? {}) as Record<string, unknown>;
  return {
    ...row,
    config: {
      ...cfg,
      api_key: cfg.api_key ? "***" : null,
      bearer_token: cfg.bearer_token ? "***" : null,
      password: cfg.password ? "***" : null,
    },
  };
}

/** GET /api/connectors/[id] */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Database not configured" }, { status: 503 });

  const { data, error } = await admin
    .from("crm_connectors")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Not found" }, { status: 404 });
  }

  return NextResponse.json({ connector: maskSensitiveFields(data as Record<string, unknown>) });
}

/** PATCH /api/connectors/[id] */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Database not configured" }, { status: 503 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = ConnectorUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 422 }
    );
  }

  // Load existing config to merge into
  const { data: existing, error: selErr } = await admin
    .from("crm_connectors")
    .select("config")
    .eq("id", params.id)
    .maybeSingle();

  if (selErr || !existing) {
    return NextResponse.json({ error: "Connector not found" }, { status: 404 });
  }

  const existingCfg = ((existing as Record<string, unknown>).config ?? {}) as Record<string, unknown>;
  const updates = parsed.data;

  const mergedConfig: Record<string, unknown> = {
    ...existingCfg,
    ...(updates.connector_name !== undefined && { connector_name: updates.connector_name }),
    ...(updates.base_url !== undefined && { base_url: updates.base_url }),
    ...(updates.endpoint !== undefined && { endpoint: updates.endpoint }),
    ...(updates.method !== undefined && { method: updates.method }),
    ...(updates.auth_type !== undefined && { auth_type: updates.auth_type }),
    ...(updates.api_key !== undefined && { api_key: updates.api_key }),
    ...(updates.bearer_token !== undefined && { bearer_token: updates.bearer_token }),
    ...(updates.username !== undefined && { username: updates.username }),
    ...(updates.password !== undefined && { password: updates.password }),
    ...(updates.custom_headers !== undefined && { headers: updates.custom_headers }),
    ...(updates.sync_frequency !== undefined && { sync_frequency: updates.sync_frequency }),
    ...(updates.agent_id !== undefined && { agent_id: updates.agent_id }),
    ...(updates.description !== undefined && { description: updates.description }),
  };

  const { data: updated, error: updErr } = await admin
    .from("crm_connectors")
    .update({ config: mergedConfig })
    .eq("id", params.id)
    .select()
    .single();

  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  return NextResponse.json({
    connector: maskSensitiveFields(updated as Record<string, unknown>),
    message: "Connector updated successfully",
  });
}

/** DELETE /api/connectors/[id] */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Database not configured" }, { status: 503 });

  // Also delete associated kb_documents entries
  await admin
    .from("kb_documents")
    .delete()
    .eq("storage_path", `connector:${params.id}`);

  const { error } = await admin
    .from("crm_connectors")
    .delete()
    .eq("id", params.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, message: "Connector deleted" });
}
