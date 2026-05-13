-- =========================================================================
-- MVP platform tables — operational realtime SaaS (no separate backend)
-- Run in Supabase SQL Editor after base supabase_schema.sql / voice scripts.
-- Idempotent: safe to re-run (IF NOT EXISTS / DO blocks).
-- =========================================================================

-- -------------------------------------------------------------------------
-- Organizations & workspace members (spec: organizations, users)
-- -------------------------------------------------------------------------
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

-- -------------------------------------------------------------------------
-- Phone directory (Twilio / Exotel / Plivo / Telnyx)
-- -------------------------------------------------------------------------
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

-- -------------------------------------------------------------------------
-- Conversations: extend for BD / omnichannel operational fields
-- -------------------------------------------------------------------------
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations (id);
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS locale TEXT DEFAULT 'auto';
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS dealer_code TEXT;
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS customer_phone TEXT;

-- -------------------------------------------------------------------------
-- Conversation messages (realtime inbox thread)
-- -------------------------------------------------------------------------
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

-- -------------------------------------------------------------------------
-- live_calls — lightweight operational leg (distinct from Twilio call_sessions)
-- -------------------------------------------------------------------------
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

-- -------------------------------------------------------------------------
-- Escalations, CRM, KB, analytics, notifications
-- -------------------------------------------------------------------------
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

CREATE TABLE IF NOT EXISTS public.kb_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  title TEXT NOT NULL,
  mime_type TEXT,
  status TEXT NOT NULL DEFAULT 'processing',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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

-- -------------------------------------------------------------------------
-- RLS (match existing MVP: authenticated + anon read / insert where needed)
-- -------------------------------------------------------------------------
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.phone_numbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.escalations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_connectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kb_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kb_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Organizations: open read for dashboard wiring (tighten for production)
DROP POLICY IF EXISTS "organizations read all" ON public.organizations;
CREATE POLICY "organizations read all" ON public.organizations FOR SELECT USING (true);

DROP POLICY IF EXISTS "workspace_members read all" ON public.workspace_members;
CREATE POLICY "workspace_members read all" ON public.workspace_members FOR SELECT USING (true);

DROP POLICY IF EXISTS "phone_numbers all authenticated" ON public.phone_numbers;
CREATE POLICY "phone_numbers all authenticated" ON public.phone_numbers
  FOR ALL USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "phone_numbers anon read" ON public.phone_numbers;
CREATE POLICY "phone_numbers anon read" ON public.phone_numbers FOR SELECT USING (true);

DROP POLICY IF EXISTS "conversation_messages authenticated" ON public.conversation_messages;
CREATE POLICY "conversation_messages authenticated" ON public.conversation_messages
  FOR ALL USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "conversation_messages anon read" ON public.conversation_messages;
CREATE POLICY "conversation_messages anon read" ON public.conversation_messages FOR SELECT USING (true);
DROP POLICY IF EXISTS "conversation_messages anon insert" ON public.conversation_messages;
CREATE POLICY "conversation_messages anon insert" ON public.conversation_messages FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "live_calls authenticated" ON public.live_calls;
CREATE POLICY "live_calls authenticated" ON public.live_calls FOR ALL USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "live_calls anon read" ON public.live_calls;
CREATE POLICY "live_calls anon read" ON public.live_calls FOR SELECT USING (true);

DROP POLICY IF EXISTS "escalations authenticated" ON public.escalations;
CREATE POLICY "escalations authenticated" ON public.escalations FOR ALL USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "escalations anon read" ON public.escalations;
CREATE POLICY "escalations anon read" ON public.escalations FOR SELECT USING (true);

DROP POLICY IF EXISTS "crm_connectors authenticated" ON public.crm_connectors;
CREATE POLICY "crm_connectors authenticated" ON public.crm_connectors FOR ALL USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "crm_connectors anon read" ON public.crm_connectors;
CREATE POLICY "crm_connectors anon read" ON public.crm_connectors FOR SELECT USING (true);

DROP POLICY IF EXISTS "kb_documents authenticated" ON public.kb_documents;
CREATE POLICY "kb_documents authenticated" ON public.kb_documents FOR ALL USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "kb_documents anon read" ON public.kb_documents;
CREATE POLICY "kb_documents anon read" ON public.kb_documents FOR SELECT USING (true);

DROP POLICY IF EXISTS "kb_chunks authenticated" ON public.kb_chunks;
CREATE POLICY "kb_chunks authenticated" ON public.kb_chunks FOR ALL USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "kb_chunks anon read" ON public.kb_chunks;
CREATE POLICY "kb_chunks anon read" ON public.kb_chunks FOR SELECT USING (true);

DROP POLICY IF EXISTS "analytics_events authenticated" ON public.analytics_events;
CREATE POLICY "analytics_events authenticated" ON public.analytics_events FOR ALL USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "analytics_events anon read" ON public.analytics_events;
CREATE POLICY "analytics_events anon read" ON public.analytics_events FOR SELECT USING (true);
DROP POLICY IF EXISTS "analytics_events anon insert" ON public.analytics_events;
CREATE POLICY "analytics_events anon insert" ON public.analytics_events FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "notifications authenticated" ON public.notifications;
CREATE POLICY "notifications authenticated" ON public.notifications FOR ALL USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "notifications anon read" ON public.notifications;
CREATE POLICY "notifications anon read" ON public.notifications FOR SELECT USING (true);

-- -------------------------------------------------------------------------
-- Realtime publication
-- -------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'conversation_messages') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_messages;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'live_calls') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.live_calls;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'escalations') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.escalations;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'analytics_events') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.analytics_events;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'notifications') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END $$;


-- -- -------------------------------------------------------------------------
-- -- Seed: one org + Dhaka-area demo conversation (Bangla + operational metadata)
-- -- Re-run safe: uses fixed slug upsert
-- -- -------------------------------------------------------------------------
-- INSERT INTO public.organizations (id, name, slug)
-- VALUES (
--   '11111111-1111-1111-1111-111111111111'::uuid,
--   'Shadesh Commerce',
--   'shadesh-commerce'
-- )
-- ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name;

-- INSERT INTO public.workspace_members (organization_id, email, display_name, role)
-- SELECT
--   '11111111-1111-1111-1111-111111111111'::uuid,
--   'ops@shadesh.bd',
--   'Gulshan Floor Lead',
--   'admin'
-- WHERE NOT EXISTS (
--   SELECT 1 FROM public.workspace_members wm WHERE wm.email = 'ops@shadesh.bd'
-- );

-- INSERT INTO public.conversations (
--   id,
--   customer_name,
--   channel,
--   last_message,
--   ai_confidence,
--   status,
--   organization_id,
--   locale,
--   dealer_code,
--   customer_phone
-- )
-- SELECT
--   '22222222-2222-2222-2222-222222222222'::uuid,
--   'Karim (Dhanmondi)',
--   'WhatsApp',
--   'অর্ডার #BD-9081 কোথায় আছে?',
--   88,
--   'active',
--   '11111111-1111-1111-1111-111111111111'::uuid,
--   'bn',
--   'DLR-3340',
--   '+8801711122334'
-- WHERE NOT EXISTS (SELECT 1 FROM public.conversations WHERE id = '22222222-2222-2222-2222-222222222222'::uuid);

-- INSERT INTO public.conversation_messages (conversation_id, role, body)
-- SELECT '22222222-2222-2222-2222-222222222222'::uuid, 'customer', 'অর্ডার #BD-9081 কোথায় আছে?'
-- WHERE NOT EXISTS (
--   SELECT 1 FROM public.conversation_messages m
--   WHERE m.conversation_id = '22222222-2222-2222-2222-222222222222'::uuid
-- );

-- INSERT INTO public.analytics_events (organization_id, event_type, payload)
-- VALUES (
--   '11111111-1111-1111-1111-111111111111'::uuid,
--   'seed',
--   '{"note":"mvp_platform_tables seed"}'::jsonb
-- )
-- WHERE NOT EXISTS (
--   SELECT 1 FROM public.analytics_events WHERE event_type = 'seed' AND payload->>'note' = 'mvp_platform_tables seed'
-- );
