-- Run in Supabase SQL Editor (or merge into supabase_schema.sql).
-- Enables Twilio webhooks to persist rows via SUPABASE_SERVICE_ROLE_KEY.

CREATE TABLE IF NOT EXISTS public.call_sessions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    call_sid TEXT NOT NULL UNIQUE,
    account_sid TEXT,
    from_e164 TEXT,
    to_e164 TEXT,
    direction TEXT DEFAULT 'inbound',
    agent_id TEXT,
    speech_input TEXT,
    ai_reply_preview TEXT,
    gemini_error TEXT,
    call_status TEXT,
    duration_sec INTEGER,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ended_at TIMESTAMP WITH TIME ZONE,
    raw_last_payload JSONB
);

CREATE INDEX IF NOT EXISTS call_sessions_from_idx ON public.call_sessions (from_e164);
CREATE INDEX IF NOT EXISTS call_sessions_started_idx ON public.call_sessions (started_at DESC);

ALTER TABLE public.call_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "call_sessions authenticated select" ON public.call_sessions
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "call_sessions authenticated insert" ON public.call_sessions
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "call_sessions authenticated update" ON public.call_sessions
  FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "call_sessions anon read" ON public.call_sessions FOR SELECT USING (true);
