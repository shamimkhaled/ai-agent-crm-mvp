import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { fetchFromConnectorConfig, type ConnectorConfig } from "@/lib/connectors/crmRetrieval";
import { ingestCrmRecordsIntoKb } from "@/lib/supabase/kb";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/connectors/[id]/ingest
 *
 * Fetches data from the connector and ingests it into the knowledge base with embeddings.
 * This is the full pipeline:
 *   External API → Fetch Records → Normalize → Chunk → Gemini Embed → Store in KB
 *
 * Differs from /sync in that it is connector-specific and provides detailed progress.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  const connectorId = params.id;

  const { data: connectorRow, error: connErr } = await admin
    .from("crm_connectors")
    .select("*")
    .eq("id", connectorId)
    .maybeSingle();

  if (connErr || !connectorRow) {
    return NextResponse.json(
      { error: connErr?.message ?? "Connector not found" },
      { status: 404 }
    );
  }

  const connector = connectorRow as Record<string, unknown>;
  const cfg = connector.config as ConnectorConfig & Record<string, unknown>;
  const connectorName = String(cfg.connector_name ?? connector.provider ?? "Unknown");
  const orgId = connector.organization_id as string | null;

  if (!cfg?.base_url || !cfg?.endpoint) {
    return NextResponse.json(
      { error: "Connector config is missing base_url or endpoint" },
      { status: 422 }
    );
  }

  await admin
    .from("crm_connectors")
    .update({ status: "syncing" })
    .eq("id", connectorId);

  const start = Date.now();

  try {
    // 1. Fetch records from external API
    const { records, error: fetchErr } = await fetchFromConnectorConfig(cfg);

    if (fetchErr && records.length === 0) {
      await admin
        .from("crm_connectors")
        .update({ status: "error" })
        .eq("id", connectorId);

      return NextResponse.json(
        { success: false, error: fetchErr, records_fetched: 0 },
        { status: 502 }
      );
    }

    // 2. Upsert kb_documents entry
    let documentId: string;
    const storagePath = `connector:${connectorId}`;

    const { data: existingDoc } = await admin
      .from("kb_documents")
      .select("id")
      .eq("storage_path", storagePath)
      .maybeSingle();

    if (existingDoc) {
      documentId = (existingDoc as { id: string }).id;
      await admin
        .from("kb_documents")
        .update({
          title: `${connectorName} — ${new Date().toISOString().slice(0, 10)}`,
          status: "processing",
        })
        .eq("id", documentId);
    } else {
      const { data: newDoc, error: docErr } = await admin
        .from("kb_documents")
        .insert({
          organization_id: orgId,
          storage_path: storagePath,
          title: `${connectorName} — ${new Date().toISOString().slice(0, 10)}`,
          mime_type: "application/json",
          status: "processing",
        })
        .select("id")
        .single();

      if (docErr || !newDoc) {
        return NextResponse.json(
          { error: `kb_documents insert failed: ${docErr?.message}` },
          { status: 500 }
        );
      }
      documentId = (newDoc as { id: string }).id;
    }

    // 3. Ingest with embeddings
    const { chunksInserted, recordsProcessed, errors } = await ingestCrmRecordsIntoKb(
      documentId,
      records,
      connectorId,
      connectorName
    );

    const elapsed = Date.now() - start;

    // 4. Update connector status
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
          },
        },
      })
      .eq("id", connectorId);

    return NextResponse.json({
      success: true,
      connector_id: connectorId,
      connector_name: connectorName,
      document_id: documentId,
      stats: {
        records_fetched: records.length,
        records_processed: recordsProcessed,
        chunks_inserted: chunksInserted,
        elapsed_ms: elapsed,
        errors: errors.slice(0, 10),
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await admin.from("crm_connectors").update({ status: "error" }).eq("id", connectorId);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
