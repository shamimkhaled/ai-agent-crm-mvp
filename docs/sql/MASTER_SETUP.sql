-- =============================================================================
-- AI VOICE CRM — MASTER SUPABASE SETUP
-- Run this ONE FILE in Supabase SQL Editor (https://app.supabase.com)
-- Project: ilrgfhxvwwypldscityq
--
-- Safe to re-run (all statements are idempotent: IF NOT EXISTS / DO blocks).
-- =============================================================================


-- =============================================================================
-- STEP 1 · CORE TABLES
-- =============================================================================

-- Omnichannel inbox conversations
CREATE TABLE IF NOT EXISTS public.conversations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    customer_name TEXT NOT NULL,
    channel TEXT NOT NULL DEFAULT 'Web Chat',
    last_message TEXT,
    ai_confidence INTEGER DEFAULT 100,
    status TEXT DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Legacy live-calls feed (AI simulator)
CREATE TABLE IF NOT EXISTS public.live_calls_feed (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    call_id UUID NOT NULL,
    speaker TEXT NOT NULL,
    transcript_line TEXT NOT NULL,
    intent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- AI agent configuration
CREATE TABLE IF NOT EXISTS public.ai_agents (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    department TEXT NOT NULL,
    voice_model TEXT NOT NULL,
    system_prompt TEXT,
    status TEXT DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);


-- =============================================================================
-- STEP 2 · VOICE / TELEPHONY TABLES
-- =============================================================================

-- Pipeline observability (every step of a call written here)
CREATE TABLE IF NOT EXISTS public.voice_pipeline_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    call_id TEXT NOT NULL,
    step TEXT NOT NULL,
    detail TEXT,
    duration_ms INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Twilio / Exotel / Plivo inbound call sessions
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

CREATE INDEX IF NOT EXISTS call_sessions_from_idx    ON public.call_sessions (from_e164);
CREATE INDEX IF NOT EXISTS call_sessions_started_idx ON public.call_sessions (started_at DESC);

-- Live-dashboard columns (safe to add on existing tables)
ALTER TABLE public.call_sessions ADD COLUMN IF NOT EXISTS dashboard_state      TEXT DEFAULT 'idle';
ALTER TABLE public.call_sessions ADD COLUMN IF NOT EXISTS pipeline_step_index  INTEGER DEFAULT 0;
ALTER TABLE public.call_sessions ADD COLUMN IF NOT EXISTS ai_confidence        INTEGER;
ALTER TABLE public.call_sessions ADD COLUMN IF NOT EXISTS escalation           BOOLEAN DEFAULT false;
ALTER TABLE public.call_sessions ADD COLUMN IF NOT EXISTS human_takeover       BOOLEAN DEFAULT false;
ALTER TABLE public.call_sessions ADD COLUMN IF NOT EXISTS intent_label         TEXT;
ALTER TABLE public.call_sessions ADD COLUMN IF NOT EXISTS dealer_code_hint     TEXT;
ALTER TABLE public.call_sessions ADD COLUMN IF NOT EXISTS caller_display_name  TEXT;

-- Line-by-line live transcript (streams to browser via Realtime)
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

-- WhatsApp inbound messages
CREATE TABLE IF NOT EXISTS public.whatsapp_inbound (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    from_number TEXT NOT NULL,
    body TEXT,
    provider TEXT DEFAULT 'twilio_whatsapp',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Historical call records
CREATE TABLE IF NOT EXISTS public.call_history (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    caller TEXT NOT NULL,
    channel TEXT NOT NULL,
    provider TEXT,
    agent_name TEXT,
    duration_sec INTEGER DEFAULT 0,
    avg_confidence INTEGER,
    escalation BOOLEAN DEFAULT false,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ended_at TIMESTAMP WITH TIME ZONE
);


-- =============================================================================
-- STEP 3 · PLATFORM TABLES (org, KB, escalations, analytics)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.workspace_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
    email TEXT,
    display_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'agent' CHECK (role IN ('owner', 'admin', 'agent')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.phone_numbers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
    provider_kind TEXT NOT NULL,
    e164 TEXT NOT NULL,
    label TEXT,
    ai_agent_id UUID REFERENCES public.ai_agents (id) ON DELETE SET NULL,
    meta JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, e164)
);

-- Extend conversations for multi-org / BD-specific fields
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations (id);
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS locale TEXT DEFAULT 'auto';
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS dealer_code TEXT;
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS customer_phone TEXT;

CREATE TABLE IF NOT EXISTS public.conversation_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES public.conversations (id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('customer', 'agent', 'ai', 'system')),
    body TEXT NOT NULL,
    meta JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS conversation_messages_conv_created_idx
    ON public.conversation_messages (conversation_id, created_at ASC);

-- Operational live-calls table (lightweight companion to call_sessions)
CREATE TABLE IF NOT EXISTS public.live_calls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations (id) ON DELETE SET NULL,
    external_id TEXT,
    channel TEXT NOT NULL DEFAULT 'phone',
    state TEXT NOT NULL DEFAULT 'ringing',
    from_e164 TEXT,
    to_e164 TEXT,
    assigned_agent_id UUID REFERENCES public.ai_agents (id) ON DELETE SET NULL,
    meta JSONB NOT NULL DEFAULT '{}'::jsonb,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS live_calls_started_idx ON public.live_calls (started_at DESC);

-- ★ ESCALATIONS — shown in Live Call Monitor dashboard alert queue
CREATE TABLE IF NOT EXISTS public.escalations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations (id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES public.conversations (id) ON DELETE SET NULL,
    call_sid TEXT,
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'assigned', 'resolved')),
    meta JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.crm_connectors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'disconnected',
    last_sync_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ★ KNOWLEDGE BASE — documents uploaded via the Knowledge page
CREATE TABLE IF NOT EXISTS public.kb_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
    storage_path TEXT NOT NULL,
    title TEXT NOT NULL,
    mime_type TEXT,
    status TEXT NOT NULL DEFAULT 'processing',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ★ KB CHUNKS — text chunks searched during voice calls (keyword / pgvector)
CREATE TABLE IF NOT EXISTS public.kb_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES public.kb_documents (id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    meta JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (document_id, chunk_index)
);

CREATE TABLE IF NOT EXISTS public.analytics_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations (id) ON DELETE SET NULL,
    event_type TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS analytics_events_created_idx ON public.analytics_events (created_at DESC);

CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations (id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    body TEXT,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- =============================================================================
-- STEP 4 · STORAGE BUCKET (Knowledge base file uploads)
-- =============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('knowledge_base', 'knowledge_base', true)
ON CONFLICT DO NOTHING;


-- =============================================================================
-- STEP 5 · ROW LEVEL SECURITY (RLS)
-- =============================================================================

-- Enable RLS on all tables
ALTER TABLE public.conversations           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_calls_feed         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_agents               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voice_pipeline_events   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_sessions           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voice_call_transcripts  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_inbound        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_history            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_members       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.phone_numbers           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_messages   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_calls              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.escalations             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_connectors          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kb_documents            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kb_chunks               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_events        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications           ENABLE ROW LEVEL SECURITY;

-- ── conversations ──
DROP POLICY IF EXISTS "Allow all authenticated users access to conversations" ON public.conversations;
CREATE POLICY "Allow all authenticated users access to conversations"
    ON public.conversations FOR ALL USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "Allow anon read conversations" ON public.conversations;
CREATE POLICY "Allow anon read conversations"
    ON public.conversations FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow anon insert conversations" ON public.conversations;
CREATE POLICY "Allow anon insert conversations"
    ON public.conversations FOR INSERT WITH CHECK (true);

-- ── live_calls_feed ──
DROP POLICY IF EXISTS "Allow all authenticated users access to live_calls_feed" ON public.live_calls_feed;
CREATE POLICY "Allow all authenticated users access to live_calls_feed"
    ON public.live_calls_feed FOR ALL USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "Allow anon read calls" ON public.live_calls_feed;
CREATE POLICY "Allow anon read calls"
    ON public.live_calls_feed FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow anon insert calls" ON public.live_calls_feed;
CREATE POLICY "Allow anon insert calls"
    ON public.live_calls_feed FOR INSERT WITH CHECK (true);

-- ── ai_agents ──
DROP POLICY IF EXISTS "Allow all authenticated users access to ai_agents" ON public.ai_agents;
CREATE POLICY "Allow all authenticated users access to ai_agents"
    ON public.ai_agents FOR ALL USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "Allow anon insert ai_agents" ON public.ai_agents;
CREATE POLICY "Allow anon insert ai_agents"
    ON public.ai_agents FOR INSERT WITH CHECK (true);

-- ── voice_pipeline_events ──
DROP POLICY IF EXISTS "voice_pipeline_events authenticated" ON public.voice_pipeline_events;
CREATE POLICY "voice_pipeline_events authenticated"
    ON public.voice_pipeline_events FOR ALL USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "voice_pipeline_events anon read" ON public.voice_pipeline_events;
CREATE POLICY "voice_pipeline_events anon read"
    ON public.voice_pipeline_events FOR SELECT USING (true);

-- ── call_sessions ──
DROP POLICY IF EXISTS "call_sessions authenticated select" ON public.call_sessions;
CREATE POLICY "call_sessions authenticated select"
    ON public.call_sessions FOR SELECT USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "call_sessions authenticated insert" ON public.call_sessions;
CREATE POLICY "call_sessions authenticated insert"
    ON public.call_sessions FOR INSERT WITH CHECK (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "call_sessions authenticated update" ON public.call_sessions;
CREATE POLICY "call_sessions authenticated update"
    ON public.call_sessions FOR UPDATE USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "call_sessions anon read" ON public.call_sessions;
CREATE POLICY "call_sessions anon read"
    ON public.call_sessions FOR SELECT USING (true);

-- ── voice_call_transcripts ──
DROP POLICY IF EXISTS "voice_call_transcripts authenticated all" ON public.voice_call_transcripts;
CREATE POLICY "voice_call_transcripts authenticated all"
    ON public.voice_call_transcripts FOR ALL USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "voice_call_transcripts anon read" ON public.voice_call_transcripts;
CREATE POLICY "voice_call_transcripts anon read"
    ON public.voice_call_transcripts FOR SELECT USING (true);

-- ── whatsapp_inbound ──
DROP POLICY IF EXISTS "whatsapp_inbound authenticated" ON public.whatsapp_inbound;
CREATE POLICY "whatsapp_inbound authenticated"
    ON public.whatsapp_inbound FOR ALL USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "whatsapp_inbound anon read" ON public.whatsapp_inbound;
CREATE POLICY "whatsapp_inbound anon read"
    ON public.whatsapp_inbound FOR SELECT USING (true);

-- ── call_history ──
DROP POLICY IF EXISTS "call_history authenticated" ON public.call_history;
CREATE POLICY "call_history authenticated"
    ON public.call_history FOR ALL USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "call_history anon read" ON public.call_history;
CREATE POLICY "call_history anon read"
    ON public.call_history FOR SELECT USING (true);

-- ── organizations ──
DROP POLICY IF EXISTS "organizations read all" ON public.organizations;
CREATE POLICY "organizations read all"
    ON public.organizations FOR SELECT USING (true);

-- ── workspace_members ──
DROP POLICY IF EXISTS "workspace_members read all" ON public.workspace_members;
CREATE POLICY "workspace_members read all"
    ON public.workspace_members FOR SELECT USING (true);

-- ── phone_numbers ──
DROP POLICY IF EXISTS "phone_numbers all authenticated" ON public.phone_numbers;
CREATE POLICY "phone_numbers all authenticated"
    ON public.phone_numbers FOR ALL USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "phone_numbers anon read" ON public.phone_numbers;
CREATE POLICY "phone_numbers anon read"
    ON public.phone_numbers FOR SELECT USING (true);

-- ── conversation_messages ──
DROP POLICY IF EXISTS "conversation_messages authenticated" ON public.conversation_messages;
CREATE POLICY "conversation_messages authenticated"
    ON public.conversation_messages FOR ALL USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "conversation_messages anon read" ON public.conversation_messages;
CREATE POLICY "conversation_messages anon read"
    ON public.conversation_messages FOR SELECT USING (true);
DROP POLICY IF EXISTS "conversation_messages anon insert" ON public.conversation_messages;
CREATE POLICY "conversation_messages anon insert"
    ON public.conversation_messages FOR INSERT WITH CHECK (true);

-- ── live_calls ──
DROP POLICY IF EXISTS "live_calls authenticated" ON public.live_calls;
CREATE POLICY "live_calls authenticated"
    ON public.live_calls FOR ALL USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "live_calls anon read" ON public.live_calls;
CREATE POLICY "live_calls anon read"
    ON public.live_calls FOR SELECT USING (true);

-- ── escalations ──
DROP POLICY IF EXISTS "escalations authenticated" ON public.escalations;
CREATE POLICY "escalations authenticated"
    ON public.escalations FOR ALL USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "escalations anon read" ON public.escalations;
CREATE POLICY "escalations anon read"
    ON public.escalations FOR SELECT USING (true);

-- ── crm_connectors ──
DROP POLICY IF EXISTS "crm_connectors authenticated" ON public.crm_connectors;
CREATE POLICY "crm_connectors authenticated"
    ON public.crm_connectors FOR ALL USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "crm_connectors anon read" ON public.crm_connectors;
CREATE POLICY "crm_connectors anon read"
    ON public.crm_connectors FOR SELECT USING (true);

-- ── kb_documents ──
DROP POLICY IF EXISTS "kb_documents authenticated" ON public.kb_documents;
CREATE POLICY "kb_documents authenticated"
    ON public.kb_documents FOR ALL USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "kb_documents anon read" ON public.kb_documents;
CREATE POLICY "kb_documents anon read"
    ON public.kb_documents FOR SELECT USING (true);

-- ── kb_chunks ──
DROP POLICY IF EXISTS "kb_chunks authenticated" ON public.kb_chunks;
CREATE POLICY "kb_chunks authenticated"
    ON public.kb_chunks FOR ALL USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "kb_chunks anon read" ON public.kb_chunks;
CREATE POLICY "kb_chunks anon read"
    ON public.kb_chunks FOR SELECT USING (true);

-- ── analytics_events ──
DROP POLICY IF EXISTS "analytics_events authenticated" ON public.analytics_events;
CREATE POLICY "analytics_events authenticated"
    ON public.analytics_events FOR ALL USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "analytics_events anon read" ON public.analytics_events;
CREATE POLICY "analytics_events anon read"
    ON public.analytics_events FOR SELECT USING (true);
DROP POLICY IF EXISTS "analytics_events anon insert" ON public.analytics_events;
CREATE POLICY "analytics_events anon insert"
    ON public.analytics_events FOR INSERT WITH CHECK (true);

-- ── notifications ──
DROP POLICY IF EXISTS "notifications authenticated" ON public.notifications;
CREATE POLICY "notifications authenticated"
    ON public.notifications FOR ALL USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "notifications anon read" ON public.notifications;
CREATE POLICY "notifications anon read"
    ON public.notifications FOR SELECT USING (true);

-- ── Storage ──
DROP POLICY IF EXISTS "Allow public read access to knowledge_base" ON storage.objects;
CREATE POLICY "Allow public read access to knowledge_base"
    ON storage.objects FOR SELECT USING (bucket_id = 'knowledge_base');
DROP POLICY IF EXISTS "Allow auth inserts to knowledge_base" ON storage.objects;
CREATE POLICY "Allow auth inserts to knowledge_base"
    ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'knowledge_base' AND auth.role() = 'authenticated');
DROP POLICY IF EXISTS "Allow auth updates to knowledge_base" ON storage.objects;
CREATE POLICY "Allow auth updates to knowledge_base"
    ON storage.objects FOR UPDATE USING (bucket_id = 'knowledge_base' AND auth.role() = 'authenticated');
DROP POLICY IF EXISTS "Allow auth deletes from knowledge_base" ON storage.objects;
CREATE POLICY "Allow auth deletes from knowledge_base"
    ON storage.objects FOR DELETE USING (bucket_id = 'knowledge_base' AND auth.role() = 'authenticated');


-- =============================================================================
-- STEP 6 · REALTIME PUBLICATION
-- Every table listed here streams changes to the browser via WebSocket.
-- The DO blocks are safe to re-run.
-- =============================================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='conversations') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations; END IF; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='live_calls_feed') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.live_calls_feed; END IF; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='ai_agents') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_agents; END IF; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='voice_pipeline_events') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.voice_pipeline_events; END IF; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='call_sessions') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.call_sessions; END IF; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='voice_call_transcripts') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.voice_call_transcripts; END IF; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='conversation_messages') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_messages; END IF; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='live_calls') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.live_calls; END IF; END $$;

-- ★ ESCALATIONS realtime (Live Call Monitor alert queue)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='escalations') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.escalations; END IF; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='analytics_events') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.analytics_events; END IF; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='notifications') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications; END IF; END $$;


-- =============================================================================
-- DONE ✓
-- All tables, RLS policies, indexes, storage bucket, and Realtime subscriptions
-- are now configured for your AI Voice CRM system.
-- =============================================================================
