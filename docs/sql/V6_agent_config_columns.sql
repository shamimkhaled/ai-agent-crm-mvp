-- =============================================================================
-- V6 · Extended agent configuration columns
-- Run in Supabase SQL Editor. Safe to re-run (idempotent).
-- =============================================================================

-- Agent speaks first message
ALTER TABLE public.ai_agents ADD COLUMN IF NOT EXISTS first_message      TEXT;

-- LLM provider + model variant separate from voice_model
ALTER TABLE public.ai_agents ADD COLUMN IF NOT EXISTS model_provider     TEXT NOT NULL DEFAULT 'gemini';
ALTER TABLE public.ai_agents ADD COLUMN IF NOT EXISTS model_id           TEXT NOT NULL DEFAULT 'gemini-2.5-flash';

-- Voice provider separate from tts_voice
ALTER TABLE public.ai_agents ADD COLUMN IF NOT EXISTS voice_provider     TEXT NOT NULL DEFAULT 'browser';
ALTER TABLE public.ai_agents ADD COLUMN IF NOT EXISTS voice_id           TEXT;
ALTER TABLE public.ai_agents ADD COLUMN IF NOT EXISTS voice_speed        NUMERIC(3,1) NOT NULL DEFAULT 1.0;
ALTER TABLE public.ai_agents ADD COLUMN IF NOT EXISTS voice_temperature  NUMERIC(3,2) NOT NULL DEFAULT 0.8;

-- Transcriber / STT
ALTER TABLE public.ai_agents ADD COLUMN IF NOT EXISTS transcriber        TEXT NOT NULL DEFAULT 'deepgram';

-- Agent speaks first
ALTER TABLE public.ai_agents ADD COLUMN IF NOT EXISTS agent_speaks_first BOOLEAN NOT NULL DEFAULT true;

-- Template tag
ALTER TABLE public.ai_agents ADD COLUMN IF NOT EXISTS template_id        TEXT;

-- updated_at
ALTER TABLE public.ai_agents ADD COLUMN IF NOT EXISTS updated_at         TIMESTAMPTZ DEFAULT NOW();

-- Backfill updated_at where null
UPDATE public.ai_agents SET updated_at = created_at WHERE updated_at IS NULL;
