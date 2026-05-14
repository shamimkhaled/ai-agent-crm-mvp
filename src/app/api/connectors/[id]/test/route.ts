import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { fetchFromConnectorConfig, type ConnectorConfig } from "@/lib/connectors/crmRetrieval";

export const dynamic = "force-dynamic";

/**
 * POST /api/connectors/[id]/test
 *
 * Tests a connector by making a live API call and returning a preview
 * of the first few records. Does NOT ingest into KB.
 *
 * Also supports ad-hoc testing of a connector config without saving:
 * pass the full config in the request body as { config: { ... } }.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  let cfg: ConnectorConfig | null = null;

  // Check if an ad-hoc config was provided in the body
  let body: Record<string, unknown> | null = null;
  try {
    body = await req.json() as Record<string, unknown>;
  } catch {
    // No body — will load from DB
  }

  if (body?.config) {
    cfg = body.config as ConnectorConfig;
  } else {
    // Load from database
    const admin = getSupabaseAdmin();
    if (!admin) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    const { data, error } = await admin
      .from("crm_connectors")
      .select("config")
      .eq("id", params.id)
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json(
        { error: error?.message ?? "Connector not found" },
        { status: 404 }
      );
    }

    cfg = (data as Record<string, unknown>).config as ConnectorConfig;
  }

  if (!cfg?.base_url || !cfg?.endpoint) {
    return NextResponse.json(
      { error: "Connector config is missing base_url or endpoint" },
      { status: 422 }
    );
  }

  // Override pagination for the test — only fetch first page
  const testCfg: ConnectorConfig = {
    ...cfg,
    pagination: cfg.pagination
      ? { ...cfg.pagination, max_pages: 1, limit: Math.min(cfg.pagination.limit ?? 10, 10) }
      : undefined,
  };

  const start = Date.now();
  const { records, error: fetchErr } = await fetchFromConnectorConfig(testCfg);
  const elapsed = Date.now() - start;

  if (fetchErr && records.length === 0) {
    return NextResponse.json(
      {
        success: false,
        error: fetchErr,
        elapsed_ms: elapsed,
        hint: "Check base_url, endpoint, auth settings, and network access.",
      },
      { status: 502 }
    );
  }

  return NextResponse.json({
    success: true,
    elapsed_ms: elapsed,
    records_returned: records.length,
    preview: records.slice(0, 5),
    warning: fetchErr ?? null,
    message: `Successfully connected. Retrieved ${records.length} record(s) in ${elapsed}ms.`,
  });
}
