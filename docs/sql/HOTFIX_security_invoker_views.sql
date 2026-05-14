-- ============================================================
-- HOTFIX: Remove SECURITY DEFINER from views
--
-- WHY: PostgreSQL views default to SECURITY DEFINER behaviour —
-- they run as the view owner and bypass RLS policies.
-- Setting security_invoker = true makes each view run as the
-- querying user so Postgres RLS is enforced correctly.
--
-- HOW TO APPLY: Run this entire script in the Supabase SQL editor.
-- It recreates all three views with security_invoker = true.
-- ============================================================


-- ── 1. v_active_calls (V2_embeddings_connectors.sql) ─────────

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


-- ── 2. v_agent_voice_config (V7_elevenlabs_settings.sql) ─────

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


-- ── 3. v_multilingual_agents (V8_multilingual.sql) ───────────

CREATE OR REPLACE VIEW public.v_multilingual_agents
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
WHERE a.language != 'en'
  AND a.status = 'active';


-- ── Verify: confirm all three views now have security_invoker ─

SELECT
  schemaname,
  viewname,
  definition
FROM pg_views
WHERE schemaname = 'public'
  AND viewname IN ('v_active_calls', 'v_agent_voice_config', 'v_multilingual_agents')
ORDER BY viewname;

-- You can also verify via the Supabase linter:
-- Dashboard → Database → Linter → re-run to confirm warnings are gone.
