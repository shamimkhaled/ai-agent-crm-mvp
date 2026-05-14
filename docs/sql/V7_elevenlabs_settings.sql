-- =============================================================================
-- V7 · ElevenLabs Integration Settings
-- Run in Supabase SQL Editor. Safe to re-run (idempotent).
--
-- Adds ElevenLabs configuration keys to platform_settings so operators
-- can configure the voice integration from the Settings UI without
-- requiring a server redeploy.
-- =============================================================================

-- ElevenLabs API credentials and defaults
INSERT INTO public.platform_settings (key, value, is_secret) VALUES
  ('ELEVENLABS_API_KEY',          '',                       true),
  ('ELEVENLABS_DEFAULT_VOICE_ID', 'pNInz6obpgDQGcFmaJgB',  false),
  ('ELEVENLABS_DEFAULT_MODEL',    'eleven_turbo_v2_5',       false),
  ('ELEVENLABS_STT_MODEL',        'scribe_v1',               false),
  ('ELEVENLABS_MAX_CONCURRENT',   '10',                      false)
ON CONFLICT (key) DO NOTHING;

-- Voice bridge server configuration
INSERT INTO public.platform_settings (key, value, is_secret) VALUES
  ('VOICE_BRIDGE_WS_URL',           '',    false),
  ('VOICE_BRIDGE_HTTP_URL',          '',    false),
  ('VOICE_MEDIA_STREAMS_ENABLED',   'false', false)
ON CONFLICT (key) DO NOTHING;

-- Feature flags
INSERT INTO public.platform_settings (key, value, is_secret) VALUES
  ('ELEVENLABS_ENABLED',   'false', false),
  ('VOICE_DEBUG_TIMING',   'false', false)
ON CONFLICT (key) DO NOTHING;

-- =============================================================================
-- Ensure ai_agents V6 columns exist (idempotent — safe to run after V6)
-- =============================================================================
ALTER TABLE public.ai_agents ADD COLUMN IF NOT EXISTS voice_provider     TEXT NOT NULL DEFAULT 'twilio_say';
ALTER TABLE public.ai_agents ADD COLUMN IF NOT EXISTS voice_id           TEXT;
ALTER TABLE public.ai_agents ADD COLUMN IF NOT EXISTS voice_speed        NUMERIC(3,1) NOT NULL DEFAULT 1.0;
ALTER TABLE public.ai_agents ADD COLUMN IF NOT EXISTS voice_temperature  NUMERIC(3,2) NOT NULL DEFAULT 0.8;
ALTER TABLE public.ai_agents ADD COLUMN IF NOT EXISTS transcriber        TEXT NOT NULL DEFAULT 'twilio_gather';
ALTER TABLE public.ai_agents ADD COLUMN IF NOT EXISTS agent_speaks_first BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.ai_agents ADD COLUMN IF NOT EXISTS first_message      TEXT;
ALTER TABLE public.ai_agents ADD COLUMN IF NOT EXISTS model_provider     TEXT NOT NULL DEFAULT 'gemini';
ALTER TABLE public.ai_agents ADD COLUMN IF NOT EXISTS model_id           TEXT NOT NULL DEFAULT 'gemini-2.5-flash';
ALTER TABLE public.ai_agents ADD COLUMN IF NOT EXISTS updated_at         TIMESTAMPTZ DEFAULT NOW();

-- =============================================================================
-- Add ElevenLabs voice metadata to phone_numbers (optional — for per-number override)
-- =============================================================================
-- The phone_numbers.meta JSONB column already supports arbitrary fields.
-- Add these to meta when assigning a number to override agent defaults:
--   { "voice_id": "pNInz6obpgDQGcFmaJgB", "voice_provider": "elevenlabs" }

-- =============================================================================
-- Indexes for performance
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_ai_agents_voice_provider
  ON public.ai_agents(voice_provider);

CREATE INDEX IF NOT EXISTS idx_ai_agents_transcriber
  ON public.ai_agents(transcriber);

-- =============================================================================
-- Helper view: agents with full voice configuration (for admin dashboard)
-- =============================================================================
CREATE OR REPLACE VIEW public.v_agent_voice_config
  WITH (security_invoker = true)
AS
SELECT
  a.id,
  a.name,
  a.department,
  a.status,
  a.voice_provider,
  a.voice_id,
  a.voice_speed,
  a.voice_temperature,
  a.transcriber,
  a.agent_speaks_first,
  a.first_message,
  a.model_provider,
  a.model_id,
  a.language,
  a.tts_voice,
  a.updated_at,
  COUNT(p.id) AS phone_numbers_assigned
FROM public.ai_agents a
LEFT JOIN public.phone_numbers p ON p.ai_agent_id = a.id
GROUP BY a.id
ORDER BY a.updated_at DESC NULLS LAST;

-- Grant read access to service role
GRANT SELECT ON public.v_agent_voice_config TO service_role;

-- =============================================================================
-- Sample data: update default agent to use ElevenLabs
-- Run this AFTER setting your ElevenLabs voice_id and API key.
-- Uncomment and customize before running:
-- =============================================================================
-- UPDATE public.ai_agents
-- SET
--   voice_provider = 'elevenlabs',
--   voice_id = 'pNInz6obpgDQGcFmaJgB',
--   transcriber = 'elevenlabs',
--   agent_speaks_first = true,
--   first_message = 'Thank you for calling. I am your AI assistant. How can I help you today?',
--   updated_at = NOW()
-- WHERE name = 'AI Support Agent';
