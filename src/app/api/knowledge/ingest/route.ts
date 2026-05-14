import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { ingestTextIntoKb } from "@/lib/supabase/kb";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const IngestSchema = z.object({
  document_id: z.string().uuid("document_id must be a valid UUID"),
  // Either provide raw text content directly:
  content: z.string().min(1).optional(),
  // Or a Supabase Storage path to load:
  storage_path: z.string().optional(),
  organization_id: z.string().uuid().optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional().default({}),
});

/**
 * POST /api/knowledge/ingest
 *
 * Ingests a knowledge base document into searchable chunks with Gemini embeddings.
 *
 * Accepts either:
 *   - { document_id, content } — raw text to chunk and embed
 *   - { document_id, storage_path } — path in Supabase Storage to download and process
 *
 * Pipeline:
 *   Text → Smart Chunking → Gemini text-embedding-004 → kb_chunks (with vector column)
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

  const parsed = IngestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Validation failed",
        details: parsed.error.flatten().fieldErrors,
        hint: "Required: { document_id: '<uuid>', content: '<text>' }",
      },
      { status: 422 }
    );
  }

  const { document_id, content, storage_path, metadata } = parsed.data;

  if (!content && !storage_path) {
    return NextResponse.json(
      { error: "Either 'content' (text) or 'storage_path' must be provided" },
      { status: 422 }
    );
  }

  let textToIngest = content ?? "";

  // If storage_path given, download from Supabase Storage
  if (!textToIngest && storage_path) {
    try {
      const { data: file, error: downloadErr } = await admin
        .storage
        .from("knowledge_base")
        .download(storage_path);

      if (downloadErr || !file) {
        return NextResponse.json(
          { error: `Storage download failed: ${downloadErr?.message ?? "file not found"}` },
          { status: 404 }
        );
      }

      // Convert Blob to text (works for .txt, .md, .json, .csv, .html)
      textToIngest = await file.text();

      // For JSON, convert to readable text
      if (storage_path.endsWith(".json")) {
        try {
          const json = JSON.parse(textToIngest) as unknown;
          textToIngest = jsonToReadableText(json);
        } catch {
          // Keep as raw text
        }
      }
    } catch (e) {
      return NextResponse.json(
        { error: `Storage access failed: ${e instanceof Error ? e.message : String(e)}` },
        { status: 502 }
      );
    }
  }

  if (!textToIngest.trim()) {
    return NextResponse.json(
      { error: "Document content is empty after processing" },
      { status: 422 }
    );
  }

  // Mark document as processing
  await admin
    .from("kb_documents")
    .update({ status: "processing" })
    .eq("id", document_id);

  const start = Date.now();
  const { chunksInserted, errors } = await ingestTextIntoKb(
    document_id,
    textToIngest,
    { ...metadata, source: storage_path ?? "direct_content" }
  );
  const elapsed = Date.now() - start;

  return NextResponse.json({
    success: true,
    document_id,
    stats: {
      text_length: textToIngest.length,
      chunks_inserted: chunksInserted,
      elapsed_ms: elapsed,
      error_count: errors.length,
    },
    errors: errors.slice(0, 10),
  });
}

/**
 * GET /api/knowledge/ingest?document_id=uuid
 *
 * Returns ingestion status and chunk count for a document.
 */
export async function GET(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  const { searchParams } = new URL(req.url);
  const documentId = searchParams.get("document_id");

  if (!documentId) {
    return NextResponse.json(
      { error: "document_id query parameter is required" },
      { status: 400 }
    );
  }

  const [docResult, chunksResult] = await Promise.all([
    admin
      .from("kb_documents")
      .select("id,title,status,mime_type,created_at")
      .eq("id", documentId)
      .maybeSingle(),
    admin
      .from("kb_chunks")
      .select("id", { count: "exact", head: true })
      .eq("document_id", documentId),
  ]);

  if (!docResult.data) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  return NextResponse.json({
    document: docResult.data,
    chunk_count: chunksResult.count ?? 0,
    has_embeddings: (chunksResult.count ?? 0) > 0,
  });
}

function jsonToReadableText(json: unknown, depth = 0): string {
  if (depth > 5) return String(json);
  if (json === null || json === undefined) return "";
  if (typeof json === "string") return json;
  if (typeof json === "number" || typeof json === "boolean") return String(json);

  if (Array.isArray(json)) {
    return json.map((item, i) => `Record ${i + 1}:\n${jsonToReadableText(item, depth + 1)}`).join("\n\n");
  }

  if (typeof json === "object") {
    const obj = json as Record<string, unknown>;
    return Object.entries(obj)
      .filter(([, v]) => v !== null && v !== undefined && v !== "")
      .map(([k, v]) => {
        const key = k.replace(/_/g, " ");
        const val = typeof v === "object" ? jsonToReadableText(v, depth + 1) : String(v);
        return `${key}: ${val}`;
      })
      .join(". ");
  }

  return String(json);
}
