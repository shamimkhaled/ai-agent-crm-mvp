-- =============================================================================
-- V2 MIGRATION — pgvector embeddings, enhanced connectors, agent metadata
-- Run this in Supabase SQL Editor AFTER the MASTER_SETUP.sql
--
-- Safe to re-run (all statements are idempotent).
-- =============================================================================


-- =============================================================================
-- STEP 1 · ENABLE pgvector EXTENSION
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS vector;


-- =============================================================================
-- STEP 2 · ADD EMBEDDING COLUMN TO kb_chunks
-- Stores 768-dimensional Gemini text-embedding-004 vectors.
-- =============================================================================

ALTER TABLE public.kb_chunks
  ADD COLUMN IF NOT EXISTS embedding vector(768);

-- IVFFlat index for approximate nearest-neighbor search
-- Use after you have >= 1000 rows. For smaller datasets, a full scan is fine.
CREATE INDEX IF NOT EXISTS kb_chunks_embedding_idx
  ON public.kb_chunks
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 50);


-- =============================================================================
-- STEP 3 · SEMANTIC SEARCH RPC (used by searchKbChunks in kb.ts)
-- =============================================================================

CREATE OR REPLACE FUNCTION match_kb_chunks(
  query_embedding        vector(768),
  match_count            int          DEFAULT 5,
  similarity_threshold   float        DEFAULT 0.65,
  filter_document_ids    uuid[]       DEFAULT NULL
)
RETURNS TABLE (
  id          uuid,
  document_id uuid,
  content     text,
  meta        jsonb,
  similarity  float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    kc.id,
    kc.document_id,
    kc.content,
    kc.meta,
    1 - (kc.embedding <=> query_embedding) AS similarity
  FROM public.kb_chunks kc
  WHERE
    kc.embedding IS NOT NULL
    AND (filter_document_ids IS NULL OR kc.document_id = ANY(filter_document_ids))
    AND 1 - (kc.embedding <=> query_embedding) >= similarity_threshold
  ORDER BY kc.embedding <=> query_embedding
  LIMIT match_count;
$$;


-- =============================================================================
-- STEP 4 · ENHANCE ai_agents TABLE
-- Add language, voice, and KB/connector linkage columns.
-- =============================================================================

ALTER TABLE public.ai_agents
  ADD COLUMN IF NOT EXISTS language       TEXT    NOT NULL DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS tts_voice      TEXT    NOT NULL DEFAULT 'Polly.Matthew',
  ADD COLUMN IF NOT EXISTS kb_document_ids UUID[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS connector_ids  UUID[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS persona_prompt TEXT,
  ADD COLUMN IF NOT EXISTS escalation_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS max_turns      INTEGER NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS confidence_threshold INTEGER NOT NULL DEFAULT 65,
  ADD COLUMN IF NOT EXISTS updated_at     TIMESTAMPTZ DEFAULT NOW();


-- =============================================================================
-- STEP 5 · ENHANCE phone_numbers TABLE
-- Add language/voice/agent metadata columns.
-- =============================================================================

ALTER TABLE public.phone_numbers
  ADD COLUMN IF NOT EXISTS language   TEXT NOT NULL DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS tts_voice  TEXT NOT NULL DEFAULT 'Polly.Matthew',
  ADD COLUMN IF NOT EXISTS description TEXT;


-- =============================================================================
-- STEP 6 · ENHANCE crm_connectors TABLE
-- Rename / expand to support the full connector config schema.
-- =============================================================================

ALTER TABLE public.crm_connectors
  ADD COLUMN IF NOT EXISTS connector_name TEXT,
  ADD COLUMN IF NOT EXISTS connector_type TEXT NOT NULL DEFAULT 'rest_api',
  ADD COLUMN IF NOT EXISTS sync_frequency TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS last_sync_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at     TIMESTAMPTZ DEFAULT NOW();


-- =============================================================================
-- STEP 7 · ENHANCE kb_documents TABLE
-- Add meta JSONB column for sync stats.
-- =============================================================================

ALTER TABLE public.kb_documents
  ADD COLUMN IF NOT EXISTS meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();


-- =============================================================================
-- STEP 8 · CALL SESSIONS — add meta column for agent config cache
-- =============================================================================

ALTER TABLE public.call_sessions
  ADD COLUMN IF NOT EXISTS meta JSONB NOT NULL DEFAULT '{}'::jsonb;


-- =============================================================================
-- STEP 9 · SEED DEFAULT AGENT (if none exist)
-- This ensures the system always has a fallback agent for incoming calls.
-- =============================================================================

INSERT INTO public.ai_agents (
  id,
  name,
  department,
  voice_model,
  system_prompt,
  language,
  tts_voice,
  status,
  persona_prompt
)
VALUES (
  gen_random_uuid(),
  'AI Support Agent',
  'Support',
  'gemini-2.5-flash',
  'You are a helpful AI support assistant for a business in Bangladesh.',
  'en',
  'Polly.Matthew',
  'active',
  'You are a helpful AI support agent. Answer customer queries clearly and concisely. If you cannot find the specific information, say you will note it and a human will follow up.'
)
ON CONFLICT DO NOTHING;


-- =============================================================================
-- STEP 10 · SYNC LOGS TABLE
-- Tracks all connector sync attempts for debugging and auditing.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.connector_sync_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connector_id  UUID NOT NULL REFERENCES public.crm_connectors (id) ON DELETE CASCADE,
  status        TEXT NOT NULL CHECK (status IN ('running', 'success', 'partial', 'failed')),
  records_fetched  INTEGER DEFAULT 0,
  chunks_inserted  INTEGER DEFAULT 0,
  error_messages   TEXT[],
  started_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at  TIMESTAMPTZ,
  elapsed_ms    INTEGER
);

CREATE INDEX IF NOT EXISTS connector_sync_logs_connector_idx
  ON public.connector_sync_logs (connector_id, started_at DESC);

ALTER TABLE public.connector_sync_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "connector_sync_logs authenticated" ON public.connector_sync_logs;
CREATE POLICY "connector_sync_logs authenticated"
  ON public.connector_sync_logs FOR ALL USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "connector_sync_logs anon read" ON public.connector_sync_logs;
CREATE POLICY "connector_sync_logs anon read"
  ON public.connector_sync_logs FOR SELECT USING (true);


-- =============================================================================
-- STEP 11 · REALTIME PUBLICATION for new tables
-- =============================================================================

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'connector_sync_logs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.connector_sync_logs;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'kb_chunks'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.kb_chunks;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'kb_documents'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.kb_documents;
  END IF;
END $$;


-- =============================================================================
-- STEP 12 · HELPER VIEW — active call dashboard enriched with agent info
-- =============================================================================

CREATE OR REPLACE VIEW public.v_active_calls
  WITH (security_invoker = true)
AS
SELECT
  cs.id,
  cs.call_sid,
  cs.from_e164,
  cs.to_e164,
  cs.agent_id,
  cs.call_status,
  cs.dashboard_state,
  cs.pipeline_step_index,
  cs.ai_confidence,
  cs.escalation,
  cs.human_takeover,
  cs.intent_label,
  cs.caller_display_name,
  cs.started_at,
  cs.updated_at,
  cs.meta->>'agent_name'        AS agent_name,
  cs.meta->>'agent_department'  AS agent_department,
  cs.meta->>'agent_language'    AS agent_language,
  cs.meta->>'agent_tts_voice'   AS agent_tts_voice,
  ag.name                        AS resolved_agent_name,
  ag.department                  AS resolved_agent_department
FROM public.call_sessions cs
LEFT JOIN public.ai_agents ag ON ag.id::text = cs.agent_id
WHERE cs.dashboard_state NOT IN ('ended')
  AND cs.started_at > NOW() - INTERVAL '4 hours';


-- =============================================================================
-- DONE ✓
-- Run in Supabase SQL Editor after MASTER_SETUP.sql.
-- =============================================================================
