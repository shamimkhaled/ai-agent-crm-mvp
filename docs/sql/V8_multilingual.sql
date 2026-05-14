-- ============================================================
-- V8: Multilingual Agent Support
-- Adds auto-detection, fallback language, and per-agent
-- language configuration for ElevenLabs STT/TTS.
-- ============================================================

-- ── ai_agents: multilingual columns ─────────────────────────

-- Primary language (already exists from V6, kept for reference)
-- ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'en';

-- Auto language detection: detect caller's language mid-call
ALTER TABLE ai_agents
  ADD COLUMN IF NOT EXISTS auto_detect_language BOOLEAN DEFAULT TRUE;

-- Fallback language when detection is inconclusive
-- e.g. agent language = "bn" but caller speaks English → fallback = "en"
ALTER TABLE ai_agents
  ADD COLUMN IF NOT EXISTS fallback_language TEXT DEFAULT 'en';

-- ElevenLabs TTS model override per agent
-- Defaults to eleven_turbo_v2_5 (handles all multilingual including Bangla)
ALTER TABLE ai_agents
  ADD COLUMN IF NOT EXISTS elevenlabs_tts_model TEXT DEFAULT 'eleven_turbo_v2_5';

-- ElevenLabs STT model per agent
ALTER TABLE ai_agents
  ADD COLUMN IF NOT EXISTS elevenlabs_stt_model TEXT DEFAULT 'scribe_v1';

-- Language detection threshold (0.0–1.0) — used by detectLanguageFromText
-- Agents with mixed-language callers may want to lower this (e.g. 0.15)
ALTER TABLE ai_agents
  ADD COLUMN IF NOT EXISTS language_detection_threshold NUMERIC(3,2) DEFAULT 0.20;

-- ── platform_settings: multilingual defaults ─────────────────
-- Table schema: (key TEXT PK, value TEXT, is_secret BOOLEAN, updated_at TIMESTAMPTZ)

INSERT INTO public.platform_settings (key, value, is_secret) VALUES
  ('ELEVENLABS_DEFAULT_TTS_MODEL', 'eleven_turbo_v2_5', false),
  ('ELEVENLABS_STT_MODEL',         'scribe_v1',         false),
  ('VOICE_AUTO_DETECT_LANGUAGE',   'true',              false),
  ('VOICE_PRIMARY_LANGUAGE',       'en',                false),
  ('VOICE_BANGLA_VOICE_ID',        'cgSgspJ2msm6clMCkdW9', false)
ON CONFLICT (key) DO NOTHING;

-- ── call_sessions: language tracking ─────────────────────────

ALTER TABLE call_sessions
  ADD COLUMN IF NOT EXISTS detected_language TEXT;

ALTER TABLE call_sessions
  ADD COLUMN IF NOT EXISTS language_switches INTEGER DEFAULT 0;

-- ── View: v_multilingual_agents ──────────────────────────────

CREATE OR REPLACE VIEW v_multilingual_agents
  WITH (security_invoker = true)
AS
SELECT
  a.id,
  a.name,
  a.department,
  a.language                        AS primary_language,
  a.fallback_language,
  a.auto_detect_language,
  a.elevenlabs_tts_model,
  a.elevenlabs_stt_model,
  a.voice_id,
  a.transcriber,
  a.status,
  CASE
    WHEN a.language = 'bn'   THEN 'Bengali (Bangla)'
    WHEN a.language = 'en'   THEN 'English'
    WHEN a.language = 'hi'   THEN 'Hindi'
    WHEN a.language = 'ar'   THEN 'Arabic'
    WHEN a.language = 'es'   THEN 'Spanish'
    WHEN a.language = 'fr'   THEN 'French'
    WHEN a.language = 'de'   THEN 'German'
    WHEN a.language = 'pt'   THEN 'Portuguese'
    WHEN a.language = 'zh'   THEN 'Chinese'
    WHEN a.language = 'ja'   THEN 'Japanese'
    WHEN a.language = 'ko'   THEN 'Korean'
    WHEN a.language = 'ur'   THEN 'Urdu'
    WHEN a.language = 'id'   THEN 'Indonesian'
    ELSE a.language
  END                               AS language_display,
  CASE
    WHEN a.elevenlabs_tts_model = 'eleven_turbo_v2'
      THEN 'WARNING: eleven_turbo_v2 is English-only. Switch to eleven_turbo_v2_5 for multilingual.'
    ELSE NULL
  END                               AS model_warning
FROM ai_agents a
WHERE a.language != 'en'  -- focus on non-English agents
  AND a.status = 'active';

COMMENT ON VIEW v_multilingual_agents IS
  'Active non-English agents — useful for multilingual support audit.';

-- ── Seed: sample Bangla agent if none exists ─────────────────
-- Uncomment and customise if you want a default Bangla agent:

/*
INSERT INTO ai_agents (
  name, department, language, fallback_language,
  auto_detect_language, elevenlabs_tts_model, voice_id,
  transcriber, system_prompt, agent_speaks_first, first_message, status
) VALUES (
  'বাংলা সাপোর্ট',   -- Agent name in Bengali
  'Support',
  'bn',               -- Primary: Bangla
  'en',               -- Fallback: English
  true,               -- Auto-detect caller language
  'eleven_turbo_v2_5',
  'cgSgspJ2msm6clMCkdW9',  -- Jessica voice
  'elevenlabs_scribe',
  'আপনি একটি বাংলাদেশি ব্যবসার AI সাপোর্ট এজেন্ট। বাংলায় কথা বলুন।',
  true,
  'হ্যালো! আমি বাংলা সাপোর্ট। কীভাবে সাহায্য করতে পারি?',
  'active'
) ON CONFLICT DO NOTHING;
*/
