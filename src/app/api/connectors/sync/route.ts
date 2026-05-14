import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { fetchFromConnectorConfig, type ConnectorConfig } from "@/lib/connectors/crmRetrieval";
import { ingestCrmRecordsIntoKb } from "@/lib/supabase/kb";

export const dynamic = "force-dynamic";

// Allow up to 60s for large syncs (Vercel Pro / self-hosted)
export const maxDuration = 60;

const SyncSchema = z.object({
  connector_id: z.string().uuid("connector_id must be a valid UUID"),
  force_full_sync: z.boolean().optional().default(false),
});

/**
 * POST /api/connectors/sync
 *
 * Triggers a full data sync for a connector:
 *   1. Loads connector config from crm_connectors table
 *   2. Fetches records from the external REST API
 *   3. Creates / updates a kb_documents row for this sync batch
 *   4. Chunks each record, generates Gemini embeddings, stores in kb_chunks
 *   5. Updates connector last_sync_at and status
 *
 * This fixes the 422 error by properly implementing the endpoint that was missing.
 */
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

  const parsed = SyncSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Validation failed",
        details: parsed.error.flatten().fieldErrors,
        hint: "Required: { connector_id: '<uuid>' }",
      },
      { status: 422 }
    );
  }

  const { connector_id } = parsed.data;

  // 1. Load connector from database
  const { data: connectorRow, error: connErr } = await admin
    .from("crm_connectors")
    .select("*")
    .eq("id", connector_id)
    .maybeSingle();

  if (connErr || !connectorRow) {
    return NextResponse.json(
      { error: connErr?.message ?? "Connector not found", connector_id },
      { status: 404 }
    );
  }

  const connector = connectorRow as Record<string, unknown>;
  const cfg = connector.config as ConnectorConfig;

  if (!cfg?.base_url || !cfg?.endpoint) {
    return NextResponse.json(
      { error: "Connector config is missing base_url or endpoint" },
      { status: 422 }
    );
  }

  // Update connector status to syncing
  await admin
    .from("crm_connectors")
    .update({ status: "syncing" })
    .eq("id", connector_id);

  const syncStart = Date.now();
  const cfgMeta = cfg as unknown as Record<string, unknown>;
  const connectorName = String(cfgMeta.connector_name ?? connector.provider ?? "Unknown");

  try {
    // 2. Fetch records from external API
    console.info("[connectors/sync] fetching from", cfg.base_url + cfg.endpoint);
    const { records, error: fetchErr } = await fetchFromConnectorConfig(cfg);

    if (fetchErr && records.length === 0) {
      await admin
        .from("crm_connectors")
        .update({ status: "error", config: { ...cfgMeta, last_error: fetchErr } })
        .eq("id", connector_id);
      return NextResponse.json(
        { error: `Failed to fetch from connector: ${fetchErr}`, connector_id },
        { status: 502 }
      );
    }

    console.info("[connectors/sync] fetched records", { count: records.length, connector_id });

    // 3. Create or update kb_documents row for this sync
    const orgId = connector.organization_id as string | null;
    const docTitle = `${connectorName} — Sync ${new Date().toISOString().slice(0, 10)}`;

    let documentId: string;
    const { data: existingDoc } = await admin
      .from("kb_documents")
      .select("id")
      .eq("storage_path", `connector:${connector_id}`)
      .maybeSingle();

    if (existingDoc) {
      documentId = (existingDoc as { id: string }).id;
      await admin
        .from("kb_documents")
        .update({ title: docTitle, status: "processing" })
        .eq("id", documentId);
    } else {
      const { data: newDoc, error: docErr } = await admin
        .from("kb_documents")
        .insert({
          organization_id: orgId,
          storage_path: `connector:${connector_id}`,
          title: docTitle,
          mime_type: "application/json",
          status: "processing",
        })
        .select("id")
        .single();

      if (docErr || !newDoc) {
        return NextResponse.json(
          { error: `Failed to create kb_documents entry: ${docErr?.message}` },
          { status: 500 }
        );
      }
      documentId = (newDoc as { id: string }).id;
    }

    // 4. Ingest records into KB with embeddings
    const { chunksInserted, recordsProcessed, errors } = await ingestCrmRecordsIntoKb(
      documentId,
      records,
      connector_id,
      connectorName
    );

    const elapsed = Date.now() - syncStart;

    // 5. Update connector status
    await admin
      .from("crm_connectors")
      .update({
        status: errors.length === 0 ? "connected" : "partial",
        last_sync_at: new Date().toISOString(),
        config: {
          ...(cfg as unknown as Record<string, unknown>),
          last_sync_stats: {
            records_fetched: records.length,
            records_processed: recordsProcessed,
            chunks_inserted: chunksInserted,
            elapsed_ms: elapsed,
            errors: errors.slice(0, 10),
          },
        },
      })
      .eq("id", connector_id);

    console.info("[connectors/sync] complete", {
      connector_id,
      connectorName,
      recordsProcessed,
      chunksInserted,
      elapsed,
      errorCount: errors.length,
    });

    return NextResponse.json({
      success: true,
      connector_id,
      connector_name: connectorName,
      document_id: documentId,
      stats: {
        records_fetched: records.length,
        records_processed: recordsProcessed,
        chunks_inserted: chunksInserted,
        elapsed_ms: elapsed,
        error_count: errors.length,
      },
      errors: errors.slice(0, 20),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[connectors/sync] fatal error", msg);

    await admin
      .from("crm_connectors")
      .update({ status: "error" })
      .eq("id", connector_id);

    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * GET /api/connectors/sync?connector_id=uuid
 *
 * Returns the last sync stats for a connector.
 */
export async function GET(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  const { searchParams } = new URL(req.url);
  const connectorId = searchParams.get("connector_id");

  if (!connectorId) {
    return NextResponse.json(
      { error: "connector_id query parameter is required" },
      { status: 400 }
    );
  }

  const { data, error } = await admin
    .from("crm_connectors")
    .select("id,provider,status,last_sync_at,config")
    .eq("id", connectorId)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "Connector not found" },
      { status: 404 }
    );
  }

  const row = data as Record<string, unknown>;
  const cfg = (row.config ?? {}) as Record<string, unknown>;

  return NextResponse.json({
    connector_id: row.id,
    provider: row.provider,
    status: row.status,
    last_sync_at: row.last_sync_at,
    last_sync_stats: cfg.last_sync_stats ?? null,
  });
}
