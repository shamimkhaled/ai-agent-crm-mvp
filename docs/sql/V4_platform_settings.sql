-- =============================================================================
-- V4 · platform_settings — dynamic credential storage
-- Run once in Supabase SQL Editor.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.platform_settings (
  key         TEXT        PRIMARY KEY,
  value       TEXT        NOT NULL DEFAULT '',
  is_secret   BOOLEAN     NOT NULL DEFAULT false,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS (only service role can read/write — never expose to anon)
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "platform_settings service only" ON public.platform_settings;
CREATE POLICY "platform_settings service only"
  ON public.platform_settings FOR ALL
  USING (auth.role() = 'service_role');

-- Seed defaults (empty — users fill via UI)
INSERT INTO public.platform_settings (key, is_secret) VALUES
  ('GOOGLE_GEMINI_API_KEY',          true),
  ('GEMINI_MODEL',                   false),
  ('TWILIO_ACCOUNT_SID',             false),
  ('TWILIO_AUTH_TOKEN',              true),
  ('TWILIO_WEBHOOK_BASE_URL',        false),
  ('NEXT_PUBLIC_SUPABASE_URL',       false),
  ('NEXT_PUBLIC_SUPABASE_ANON_KEY',  true),
  ('SUPABASE_SERVICE_ROLE_KEY',      true)
ON CONFLICT (key) DO NOTHING;
