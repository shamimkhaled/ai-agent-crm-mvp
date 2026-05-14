import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { generateEmbedding, chunkText, normalizeRecordToText } from "@/lib/gemini/embeddings";

/**
 * Searches `kb_chunks` for semantically relevant content using:
 *   1. Gemini text-embedding-004 → cosine similarity via pgvector (primary, if available)
 *   2. Keyword ILIKE fallback (when pgvector is not set up or embedding fails)
 *
 * Optionally filters by document_id list (per-agent KB isolation).
 * Returns a concatenated string of the most relevant chunks, safe to embed
 * directly in the Gemini system prompt (max 5000 chars).
 */
export async function searchKbChunks(
  query: string,
  limit = 5,
  documentIds?: string[]
): Promise<string> {
  const admin = getSupabaseAdmin();
  if (!admin || !query.trim()) return "";

  // Try semantic search first (requires pgvector + embedding column)
  const semanticResult = await semanticSearchKbChunks(query, limit, documentIds);
  if (semanticResult) return semanticResult;

  // Fallback to keyword search
  return keywordSearchKbChunks(query, limit, documentIds);
}

/**
 * Semantic vector search using pgvector cosine similarity.
 * Requires the `kb_chunks.embedding` column (vector(768)) and the
 * `match_kb_chunks` RPC function defined in the SQL migration.
 */
async function semanticSearchKbChunks(
  query: string,
  limit: number,
  documentIds?: string[]
): Promise<string> {
  const admin = getSupabaseAdmin();
  if (!admin) return "";

  const { embedding, error: embErr } = await generateEmbedding(query);
  if (embErr || embedding.length === 0) return "";

  try {
    const rpcParams: Record<string, unknown> = {
      query_embedding: embedding,
      match_count: limit,
      similarity_threshold: 0.65,
    };

    if (documentIds && documentIds.length > 0) {
      rpcParams.filter_document_ids = documentIds;
    }

    const { data, error } = await admin.rpc("match_kb_chunks", rpcParams);

    if (error) {
      // pgvector not yet set up — silently fall through to keyword search
      if (error.message?.includes("does not exist") || error.message?.includes("function")) {
        return "";
      }
      console.warn("[kb] semantic search RPC error", error.message);
      return "";
    }

    if (!data || (data as unknown[]).length === 0) return "";

    return (data as { content: string; similarity: number }[])
      .map((c) => c.content)
      .join("\n\n")
      .slice(0, 5000);
  } catch {
    return "";
  }
}

/**
 * Keyword fallback search using ILIKE.
 * Extracts meaningful keywords from the query and searches kb_chunks content.
 */
async function keywordSearchKbChunks(
  query: string,
  limit: number,
  documentIds?: string[]
): Promise<string> {
  const admin = getSupabaseAdmin();
  if (!admin) return "";

  const stopWords = new Set([
    "that", "this", "with", "from", "have", "will", "what", "when", "where",
    "how", "your", "আমি", "আপনি", "কিন্তু", "তাহলে", "please", "can", "tell",
    "about", "need", "want", "would", "could", "should", "does", "did",
  ]);

  const keywords = query
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/[^a-z0-9\u0980-\u09FF]/g, ""))
    .filter((w) => w.length > 3 && !stopWords.has(w))
    .slice(0, 8);

  // Also try extracting numbers (order IDs, tracking numbers, etc.)
  const numbers = query.match(/\d{3,}/g) ?? [];
    const allTerms = Array.from(new Set([...keywords, ...numbers]));

  if (allTerms.length === 0) return "";

  try {
    let queryBuilder = admin
      .from("kb_chunks")
      .select("content,chunk_index,meta")
      .or(allTerms.map((k) => `content.ilike.%${k}%`).join(","))
      .order("chunk_index", { ascending: true })
      .limit(limit);

    if (documentIds && documentIds.length > 0) {
      queryBuilder = queryBuilder.in("document_id", documentIds);
    }

    const { data, error } = await queryBuilder;

    if (error || !data || data.length === 0) return "";

    return (data as { content: string }[])
      .map((c) => c.content)
      .join("\n\n")
      .slice(0, 5000);
  } catch {
    return "";
  }
}

/**
 * Returns the most recent FAQ-style kb_chunks (no query) as seed context
 * for the first turn of a call when no speech has been received yet.
 */
export async function getKbSeedContext(limit = 2, documentIds?: string[]): Promise<string> {
  const admin = getSupabaseAdmin();
  if (!admin) return "";
  try {
    let q = admin
      .from("kb_chunks")
      .select("content")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (documentIds && documentIds.length > 0) {
      q = q.in("document_id", documentIds);
    }

    const { data, error } = await q;
    if (error || !data) return "";
    return (data as { content: string }[])
      .map((c) => c.content)
      .join("\n\n")
      .slice(0, 2000);
  } catch {
    return "";
  }
}

/**
 * Ingests raw text content into kb_chunks with embeddings.
 * Used by both file uploads and connector data sync.
 *
 * @param documentId - UUID of the parent kb_documents row
 * @param rawText - Full text content to chunk and embed
 * @param sourceMetadata - Additional metadata to store with each chunk
 */
export async function ingestTextIntoKb(
  documentId: string,
  rawText: string,
  sourceMetadata: Record<string, unknown> = {}
): Promise<{ chunksInserted: number; errors: string[] }> {
  const admin = getSupabaseAdmin();
  if (!admin) return { chunksInserted: 0, errors: ["no_admin_client"] };

  const chunks = chunkText(rawText, { maxChunkSize: 1000, overlap: 100 });
  if (chunks.length === 0) return { chunksInserted: 0, errors: ["no_chunks_produced"] };

  const errors: string[] = [];
  let inserted = 0;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];

    // Generate embedding
    const { embedding, error: embErr } = await generateEmbedding(chunk);
    if (embErr && embErr !== "missing_api_key") {
      errors.push(`chunk_${i}: embedding_failed: ${embErr}`);
    }

    const row: Record<string, unknown> = {
      document_id: documentId,
      chunk_index: i,
      content: chunk,
      meta: { ...sourceMetadata, chunk_index: i, total_chunks: chunks.length },
    };

    // Include embedding if available (pgvector)
    if (embedding.length > 0) {
      row.embedding = `[${embedding.join(",")}]`;
    }

    const { error: insertErr } = await admin
      .from("kb_chunks")
      .upsert(row, { onConflict: "document_id,chunk_index" });

    if (insertErr) {
      errors.push(`chunk_${i}: ${insertErr.message}`);
    } else {
      inserted++;
    }

    // Small delay to avoid overwhelming the DB
    if (i > 0 && i % 10 === 0) {
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  // Mark document as processed
  await admin
    .from("kb_documents")
    .update({ status: errors.length === 0 ? "ready" : "partial" })
    .eq("id", documentId);

  return { chunksInserted: inserted, errors };
}

/**
 * Ingests an array of CRM records into the knowledge base.
 * Each record is normalized to text, then chunked and embedded.
 *
 * @param documentId - Parent kb_documents row for this sync batch
 * @param records - Array of raw CRM records (any JSON structure)
 * @param connectorId - Source connector ID for metadata tagging
 */
export async function ingestCrmRecordsIntoKb(
  documentId: string,
  records: unknown[],
  connectorId: string,
  connectorName: string
): Promise<{ chunksInserted: number; recordsProcessed: number; errors: string[] }> {
  if (!records || records.length === 0) {
    return { chunksInserted: 0, recordsProcessed: 0, errors: [] };
  }

  const admin = getSupabaseAdmin();
  if (!admin) return { chunksInserted: 0, recordsProcessed: 0, errors: ["no_admin_client"] };

  const errors: string[] = [];
  let totalChunks = 0;
  let chunkIndex = 0;

  for (let recIdx = 0; recIdx < records.length; recIdx++) {
    const record = records[recIdx];
    const recordText = normalizeRecordToText(record);
    if (!recordText.trim()) continue;

    // Each record becomes one or more chunks
    const chunks = chunkText(recordText, { maxChunkSize: 800, overlap: 80 });

    for (const chunk of chunks) {
      const { embedding, error: embErr } = await generateEmbedding(chunk);
      if (embErr && embErr !== "missing_api_key") {
        errors.push(`rec_${recIdx}_chunk_${chunkIndex}: embedding_failed`);
      }

      const row: Record<string, unknown> = {
        document_id: documentId,
        chunk_index: chunkIndex,
        content: chunk,
        meta: {
          connector_id: connectorId,
          connector_name: connectorName,
          record_index: recIdx,
          source_type: "crm_connector",
          synced_at: new Date().toISOString(),
        },
      };

      if (embedding.length > 0) {
        row.embedding = `[${embedding.join(",")}]`;
      }

      const { error: insertErr } = await admin
        .from("kb_chunks")
        .upsert(row, { onConflict: "document_id,chunk_index" });

      if (insertErr) {
        errors.push(`chunk_${chunkIndex}: ${insertErr.message}`);
      } else {
        totalChunks++;
      }

      chunkIndex++;

      if (chunkIndex % 10 === 0) {
        await new Promise((r) => setTimeout(r, 150));
      }
    }
  }

  // Update document status
  await admin
    .from("kb_documents")
    .update({
      status: errors.length === 0 ? "ready" : "partial",
      meta: {
        total_records: records.length,
        total_chunks: totalChunks,
        last_sync: new Date().toISOString(),
      },
    } as Record<string, unknown>)
    .eq("id", documentId);

  return { chunksInserted: totalChunks, recordsProcessed: records.length, errors };
}
