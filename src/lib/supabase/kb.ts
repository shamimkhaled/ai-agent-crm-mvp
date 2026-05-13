import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * Searches `kb_chunks` using keyword pattern matching against the caller's speech.
 * Returns a concatenated string of the most relevant chunks, safe to embed directly
 * in the Gemini system prompt (max 4 000 chars).
 *
 * In production, replace with pgvector cosine-similarity search for semantic retrieval.
 */
export async function searchKbChunks(
  query: string,
  limit = 3
): Promise<string> {
  const admin = getSupabaseAdmin();
  if (!admin || !query.trim()) return "";

  // Extract meaningful keywords (>3 chars) from the caller's speech
  const stopWords = new Set([
    "that", "this", "with", "from", "have", "will", "what", "when", "where",
    "how", "your", "আমি", "আপনি", "কিন্তু", "তাহলে",
  ]);
  const keywords = query
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/[^a-z0-9\u0980-\u09FF]/g, ""))
    .filter((w) => w.length > 3 && !stopWords.has(w))
    .slice(0, 6);

  if (keywords.length === 0) return "";

  try {
    const orFilter = keywords.map((k) => `content.ilike.%${k}%`).join(",");
    const { data, error } = await admin
      .from("kb_chunks")
      .select("content,chunk_index")
      .or(orFilter)
      .order("chunk_index", { ascending: true })
      .limit(limit);

    if (error || !data || data.length === 0) return "";

    return (data as { content: string }[])
      .map((c) => c.content)
      .join("\n\n")
      .slice(0, 4000);
  } catch {
    return "";
  }
}

/**
 * Returns the most recent FAQ-style kb_chunks (no query) as seed context
 * for the first turn of a call when no speech has been received yet.
 */
export async function getKbSeedContext(limit = 2): Promise<string> {
  const admin = getSupabaseAdmin();
  if (!admin) return "";
  try {
    const { data, error } = await admin
      .from("kb_chunks")
      .select("content")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error || !data) return "";
    return (data as { content: string }[])
      .map((c) => c.content)
      .join("\n\n")
      .slice(0, 2000);
  } catch {
    return "";
  }
}
