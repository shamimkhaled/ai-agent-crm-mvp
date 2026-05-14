import { getPlatformSetting } from "@/lib/platformSettings";

/**
 * Embedding model candidates — tried in order until one succeeds.
 *
 * Confirmed available for this project (via ListModels):
 *   gemini-embedding-001     → 3072-d  (stable, recommended)
 *   gemini-embedding-2       → 3072-d  (latest stable)
 *   gemini-embedding-2-preview → 3072-d (preview)
 *
 * NOTE: text-embedding-004 / text-embedding-005 are NOT available for
 * every API key — they depend on the Google Cloud project configuration.
 * Always call /api/debug/gemini-models to verify what your key supports.
 */
const CANDIDATES = [
  { model: "gemini-embedding-001",       apiVersion: "v1beta" },
  { model: "gemini-embedding-2",         apiVersion: "v1beta" },
  { model: "gemini-embedding-2-preview", apiVersion: "v1beta" },
];

// Matches vector(1536) in Supabase kb_chunks after running V5 migration.
// Gemini natively truncates 3072 → 1536 via the outputDimensionality param,
// keeping us well within pgvector's 2000-dimension index limit.
export const EMBEDDING_DIMENSIONS = 1536;
const OUTPUT_DIM = 1536;

/** Call the Gemini embedContent REST endpoint directly (no SDK). */
async function callEmbedRest(
  apiKey: string,
  model: string,
  apiVersion: string,
  text: string
): Promise<number[] | null> {
  const url =
    `https://generativelanguage.googleapis.com/${apiVersion}/models/${model}:embedContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: `models/${model}`,
      content: { parts: [{ text: text.slice(0, 8192) }] },
      outputDimensionality: OUTPUT_DIM,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.warn(`[embeddings] ${model} @ ${apiVersion} → ${res.status}: ${err.slice(0, 200)}`);
    return null;
  }

  const json = await res.json() as { embedding?: { values?: number[] } };
  const values = json?.embedding?.values;
  return values && values.length > 0 ? values : null;
}

export interface EmbeddingResult {
  embedding: number[];
  error?: string;
}

/**
 * Generates a 3072-d embedding vector via the Gemini REST API.
 * Tries multiple model/version candidates so a single endpoint change
 * from Google won't break the whole pipeline.
 */
export async function generateEmbedding(text: string): Promise<EmbeddingResult> {
  const apiKey = (await getPlatformSetting("GOOGLE_GEMINI_API_KEY")).trim();
  if (!apiKey) {
    return { embedding: [], error: "missing_api_key" };
  }
  if (!text?.trim()) {
    return { embedding: new Array(EMBEDDING_DIMENSIONS).fill(0), error: "empty_text" };
  }

  const errors: string[] = [];

  for (const { model, apiVersion } of CANDIDATES) {
    try {
      const values = await callEmbedRest(apiKey, model, apiVersion, text);
      if (values) {
        return { embedding: values };
      }
      errors.push(`${model}@${apiVersion}: empty response`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${model}@${apiVersion}: ${msg.slice(0, 120)}`);
    }
  }

  const errMsg = errors.join(" | ");
  console.error("[embeddings] all candidates failed:", errMsg);
  return { embedding: [], error: errMsg };
}

/**
 * Batch generates embeddings for multiple texts.
 * Processes in batches of 5 to avoid rate limits.
 */
export async function generateEmbeddingsBatch(
  texts: string[],
  batchSize = 5
): Promise<EmbeddingResult[]> {
  const results: EmbeddingResult[] = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map((text) => generateEmbedding(text))
    );
    results.push(...batchResults);

    // Throttle to avoid rate limits
    if (i + batchSize < texts.length) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  return results;
}

/**
 * Chunks a long text into overlapping segments suitable for embedding.
 * Uses sentence-aware chunking to avoid cutting mid-sentence.
 */
export function chunkText(
  text: string,
  options: {
    maxChunkSize?: number;
    overlap?: number;
    minChunkSize?: number;
  } = {}
): string[] {
  const { maxChunkSize = 1000, overlap = 100, minChunkSize = 50 } = options;

  if (!text?.trim()) return [];
  if (text.length <= maxChunkSize) return [text.trim()];

  const chunks: string[] = [];
  // Split on sentence boundaries: ।, .!, ?, newlines
  const sentences = text.split(/(?<=[।.!?\n])\s+/);
  let current = "";

  for (const sentence of sentences) {
    if ((current + " " + sentence).trim().length > maxChunkSize) {
      if (current.trim().length >= minChunkSize) {
        chunks.push(current.trim());
      }
      // Start new chunk with overlap
      const words = current.split(" ");
      const overlapWords = words.slice(-Math.floor(overlap / 5));
      current = [...overlapWords, sentence].join(" ");
    } else {
      current = current ? `${current} ${sentence}` : sentence;
    }
  }

  if (current.trim().length >= minChunkSize) {
    chunks.push(current.trim());
  }

  return chunks;
}

/**
 * Normalizes a JSON record into a searchable text string.
 * Handles nested objects, arrays, and common CRM field names.
 */
export function normalizeRecordToText(
  record: unknown,
  prefix?: string
): string {
  if (record === null || record === undefined) return "";
  if (typeof record === "string") return record;
  if (typeof record === "number" || typeof record === "boolean") {
    return String(record);
  }
  if (Array.isArray(record)) {
    return record.map((item) => normalizeRecordToText(item)).join(", ");
  }
  if (typeof record === "object") {
    const obj = record as Record<string, unknown>;
    const parts: string[] = [];
    for (const [key, value] of Object.entries(obj)) {
      if (value === null || value === undefined || value === "") continue;
      const fieldName = key.replace(/_/g, " ").replace(/([A-Z])/g, " $1").trim();
      const fullKey = prefix ? `${prefix} ${fieldName}` : fieldName;
      const valueText = normalizeRecordToText(value, fullKey);
      if (valueText) {
        parts.push(`${fieldName}: ${valueText}`);
      }
    }
    return parts.join(". ");
  }
  return String(record);
}

/** @deprecated use EMBEDDING_DIMENSIONS instead */
export const EMBEDDING_DIMENSIONS_CONST = EMBEDDING_DIMENSIONS;
