-- =============================================================================
-- V5 · Fix embedding dimension for gemini-embedding-001
--
-- gemini-embedding-001 outputs 3072-d by default, but pgvector's ivfflat index
-- has a hard 2000-dimension limit. We use outputDimensionality=1536 in the
-- API call (Gemini supports this natively) and store vector(1536) here.
--
-- 1536-d gives excellent retrieval quality while staying under pgvector limits.
-- Run this in Supabase SQL Editor ONCE, then re-sync your connectors.
-- Safe to re-run (idempotent).
-- =============================================================================

-- 1. Drop old cosine-similarity function (wrong dimension)
DROP FUNCTION IF EXISTS public.match_kb_chunks(vector(768), float, int, uuid[]);
DROP FUNCTION IF EXISTS public.match_kb_chunks(vector(3072), float, int, uuid[]);
DROP FUNCTION IF EXISTS public.match_kb_chunks(vector, float, int, uuid[]);

-- 2. Recreate the embedding column as vector(1536)
--    ⚠ This drops all existing embeddings — re-sync connectors afterwards.
ALTER TABLE public.kb_chunks DROP COLUMN IF EXISTS embedding;
ALTER TABLE public.kb_chunks ADD COLUMN embedding vector(1536);

-- 3. ivfflat index — supports cosine similarity, max 2000 dims ✓
DROP INDEX IF EXISTS kb_chunks_embedding_idx;
CREATE INDEX kb_chunks_embedding_idx
  ON public.kb_chunks
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- 4. Recreate match_kb_chunks RPC with vector(1536) signature
CREATE OR REPLACE FUNCTION public.match_kb_chunks(
  query_embedding vector(1536),
  similarity_threshold float DEFAULT 0.5,
  match_count        int   DEFAULT 10,
  filter_document_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (
  id           uuid,
  document_id  uuid,
  chunk_text   text,
  similarity   float,
  meta         jsonb
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    kc.id,
    kc.document_id,
    kc.chunk_text,
    1 - (kc.embedding <=> query_embedding) AS similarity,
    kc.meta
  FROM public.kb_chunks kc
  WHERE
    kc.embedding IS NOT NULL
    AND (filter_document_ids IS NULL OR kc.document_id = ANY(filter_document_ids))
    AND 1 - (kc.embedding <=> query_embedding) >= similarity_threshold
  ORDER BY kc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- 5. Grant execute to all roles
GRANT EXECUTE ON FUNCTION public.match_kb_chunks(vector(1536), float, int, uuid[])
  TO anon, authenticated, service_role;
