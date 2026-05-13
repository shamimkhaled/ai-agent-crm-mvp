-- Operational realtime voice dashboard (run in Supabase SQL Editor after base schema).
-- Enables: voice_call_transcripts, call_sessions dashboard columns, Realtime for browser Live Call Monitor.

-- ---------------------------------------------------------------------------
-- call_sessions: dashboard + routing hints (idempotent)
-- ---------------------------------------------------------------------------
ALTER TABLE public.call_sessions ADD COLUMN IF NOT EXISTS dashboard_state TEXT DEFAULT 'idle';
ALTER TABLE public.call_sessions ADD COLUMN IF NOT EXISTS pipeline_step_index INTEGER DEFAULT 0;
ALTER TABLE public.call_sessions ADD COLUMN IF NOT EXISTS ai_confidence INTEGER;
ALTER TABLE public.call_sessions ADD COLUMN IF NOT EXISTS escalation BOOLEAN DEFAULT false;
ALTER TABLE public.call_sessions ADD COLUMN IF NOT EXISTS human_takeover BOOLEAN DEFAULT false;
ALTER TABLE public.call_sessions ADD COLUMN IF NOT EXISTS intent_label TEXT;
ALTER TABLE public.call_sessions ADD COLUMN IF NOT EXISTS dealer_code_hint TEXT;
ALTER TABLE public.call_sessions ADD COLUMN IF NOT EXISTS caller_display_name TEXT;

COMMENT ON COLUMN public.call_sessions.dashboard_state IS 'ringing | thinking | speaking | idle | ended';
COMMENT ON COLUMN public.call_sessions.pipeline_step_index IS 'Index into VOICE_PIPELINE_STEPS (0..8)';

-- ---------------------------------------------------------------------------
-- Line-by-line transcript for Supabase Realtime → browser
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.voice_call_transcripts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    call_sid TEXT NOT NULL,
    speaker TEXT NOT NULL CHECK (speaker IN ('system', 'caller', 'ai')),
    body TEXT NOT NULL,
    pipeline_step TEXT,
    intent_hint TEXT,
    confidence INTEGER,
    meta JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS voice_call_transcripts_call_sid_idx
  ON public.voice_call_transcripts (call_sid, created_at ASC);

ALTER TABLE public.voice_call_transcripts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "voice_call_transcripts authenticated all"
  ON public.voice_call_transcripts FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "voice_call_transcripts anon read"
  ON public.voice_call_transcripts FOR SELECT USING (true);

-- ---------------------------------------------------------------------------
-- Realtime publication (safe re-run)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'call_sessions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.call_sessions;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'voice_call_transcripts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.voice_call_transcripts;
  END IF;
END $$;
