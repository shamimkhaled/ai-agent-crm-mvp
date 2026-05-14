import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// ─── Default org UUID (matches V3_seed_default_org.sql) ─────────────────────
const DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001";

/**
 * Returns the organization_id to use for a new record:
 *   1. Use the explicitly supplied tenantId if valid.
 *   2. Otherwise look up the first org in the DB.
 *   3. If no orgs exist yet, upsert the default seed org and return its id.
 */
async function resolveOrgId(
  admin: ReturnType<typeof getSupabaseAdmin>,
  tenantId: string | null | undefined
): Promise<string> {
  if (!admin) return DEFAULT_ORG_ID;

  // Caller explicitly supplied a tenant_id — trust it.
  if (tenantId) return tenantId;

  // Try to find any existing organization.
  const { data: orgs } = await admin
    .from("organizations")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1);

  if (orgs && orgs.length > 0) {
    return (orgs[0] as { id: string }).id;
  }

  // No organizations at all — create the default one.
  const { data: created, error } = await admin
    .from("organizations")
    .upsert(
      { id: DEFAULT_ORG_ID, name: "Default Organization", slug: "default" },
      { onConflict: "slug" }
    )
    .select("id")
    .single();

  if (error || !created) {
    console.warn("[connectors] could not upsert default org:", error?.message);
    return DEFAULT_ORG_ID;
  }
  return (created as { id: string }).id;
}

// ─── Validation Schema ────────────────────────────────────────────────────────

const ConnectorCreateSchema = z.object({
  connector_name: z.string().min(1, "connector_name is required").max(120),
  connector_type: z.enum([
    "rest_api", "crm_api", "erp_api", "order_api", "inventory_api",
    "delivery_api", "custom",
  ]),
  base_url: z.string().url("base_url must be a valid URL"),
  endpoint: z.string().min(1, "endpoint is required").max(500),
  method: z.enum(["GET", "POST"]).default("GET"),
  auth_type: z.enum(["none", "api_key", "bearer", "basic"]).default("none"),
  api_key: z.string().optional().nullable(),
  bearer_token: z.string().optional().nullable(),
  username: z.string().optional().nullable(),
  password: z.string().optional().nullable(),
  custom_headers: z.record(z.string(), z.string()).optional().nullable(),
  request_body: z.record(z.string(), z.unknown()).optional().nullable(),
  response_data_path: z.string().optional().nullable(),
  pagination_type: z.enum(["none", "page", "offset", "cursor"]).default("none"),
  pagination_page_param: z.string().optional().nullable(),
  pagination_limit_param: z.string().optional().nullable(),
  pagination_limit: z.number().int().min(1).max(1000).optional().nullable(),
  pagination_max_pages: z.number().int().min(1).max(50).optional().nullable(),
  sync_frequency: z.enum(["manual", "hourly", "daily", "weekly"]).default("manual"),
  tenant_id: z.string().uuid().optional().nullable(),
  agent_id: z.string().uuid().optional().nullable(),
  description: z.string().max(500).optional().nullable(),
});

type ConnectorCreate = z.infer<typeof ConnectorCreateSchema>;

function buildConnectorConfig(data: ConnectorCreate) {
  return {
    base_url: data.base_url,
    endpoint: data.endpoint,
    method: data.method,
    auth_type: data.auth_type,
    api_key: data.api_key ?? null,
    bearer_token: data.bearer_token ?? null,
    username: data.username ?? null,
    password: data.password ?? null,
    headers: data.custom_headers ?? {},
    body: data.request_body ?? null,
    response_data_path: data.response_data_path ?? null,
    pagination:
      data.pagination_type !== "none"
        ? {
            type: data.pagination_type,
            page_param: data.pagination_page_param ?? "page",
            limit_param: data.pagination_limit_param ?? "limit",
            limit: data.pagination_limit ?? 100,
            max_pages: data.pagination_max_pages ?? 10,
          }
        : null,
  };
}

// ─── GET /api/connectors ──────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  const { searchParams } = new URL(req.url);
  const tenantId = searchParams.get("tenant_id");
  const agentId = searchParams.get("agent_id");

  let query = admin
    .from("crm_connectors")
    .select("*")
    .order("created_at", { ascending: false });

  if (tenantId) {
    query = query.eq("organization_id", tenantId);
  }
  if (agentId) {
    query = query.contains("config", { agent_id: agentId });
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Mask sensitive fields for response
  const sanitized = (data ?? []).map(maskSensitiveFields);
  return NextResponse.json({ connectors: sanitized, count: sanitized.length });
}

// ─── POST /api/connectors ─────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = ConnectorCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Validation failed",
        details: parsed.error.flatten().fieldErrors,
      },
      { status: 422 }
    );
  }

  const data = parsed.data;
  const config = buildConnectorConfig(data);

  // Resolve org — never pass null (the column is NOT NULL)
  const organization_id = await resolveOrgId(admin, data.tenant_id);

  const row = {
    organization_id,
    provider: `${data.connector_type}:${new URL(data.base_url).hostname}`,
    config: {
      ...config,
      connector_name: data.connector_name,
      connector_type: data.connector_type,
      sync_frequency: data.sync_frequency,
      agent_id: data.agent_id ?? null,
      description: data.description ?? null,
    },
    status: "disconnected",
  };

  const { data: created, error } = await admin
    .from("crm_connectors")
    .insert(row)
    .select()
    .single();

  if (error) {
    console.error("[connectors POST]", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    { connector: maskSensitiveFields(created as Record<string, unknown>), message: "Connector created successfully" },
    { status: 201 }
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
