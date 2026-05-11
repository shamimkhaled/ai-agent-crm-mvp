-- =========================================================================
-- AI CRM Agent MVP - Supabase Initialization Schema
-- Run this script in your Supabase SQL Editor (https://app.supabase.com)
-- =========================================================================

-- 1. Create the `conversations` table for Omnichannel Inbox
CREATE TABLE public.conversations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    customer_name TEXT NOT NULL,
    channel TEXT NOT NULL DEFAULT 'Web Chat',
    last_message TEXT,
    ai_confidence INTEGER DEFAULT 100,
    status TEXT DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Create the `live_calls_feed` table for the AI Simulator
CREATE TABLE public.live_calls_feed (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    call_id UUID NOT NULL,
    speaker TEXT NOT NULL,
    transcript_line TEXT NOT NULL,
    intent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Create the `ai_agents` configuration table
CREATE TABLE public.ai_agents (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    department TEXT NOT NULL,
    voice_model TEXT NOT NULL,
    system_prompt TEXT,
    status TEXT DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =========================================================================
-- ENABLE REALTIME SYNC (CRITICAL FOR MVP PIPELINE)
-- =========================================================================
-- This tells Supabase to stream changes from these tables to the Next.js frontend

-- Enable logical replication extension if not already enabled
ALTER PUBLICATION supabase_realtime ADD TABLE conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE live_calls_feed;
ALTER PUBLICATION supabase_realtime ADD TABLE ai_agents;

-- =========================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =========================================================================

-- Enable RLS
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_calls_feed ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_agents ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated accesses for MVP purposes (Simplest config for Edge rendering)
CREATE POLICY "Allow all authenticated users access to conversations" 
ON public.conversations FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Allow all authenticated users access to live_calls_feed" 
ON public.live_calls_feed FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Allow all authenticated users access to ai_agents" 
ON public.ai_agents FOR ALL USING (auth.role() = 'authenticated');

-- Also allow Anon reads if you didn't setup Auth yet during testing
CREATE POLICY "Allow anon read conversations" 
ON public.conversations FOR SELECT USING (true);
CREATE POLICY "Allow anon insert conversations" 
ON public.conversations FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow anon read calls" 
ON public.live_calls_feed FOR SELECT USING (true);
CREATE POLICY "Allow anon insert calls" 
ON public.live_calls_feed FOR INSERT WITH CHECK (true);

-- =========================================================================
-- STORAGE CONFIGURATION (KNOWLEDGE BASE)
-- =========================================================================

-- Insert the 'knowledge_base' bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('knowledge_base', 'knowledge_base', true) ON CONFLICT DO NOTHING;

-- Set up Storage RLS
CREATE POLICY "Allow public read access to knowledge_base" ON storage.objects FOR SELECT USING ( bucket_id = 'knowledge_base' );
CREATE POLICY "Allow auth inserts to knowledge_base" ON storage.objects FOR INSERT WITH CHECK ( bucket_id = 'knowledge_base' AND auth.role() = 'authenticated' );
CREATE POLICY "Allow auth updates to knowledge_base" ON storage.objects FOR UPDATE USING ( bucket_id = 'knowledge_base' AND auth.role() = 'authenticated' );
CREATE POLICY "Allow auth deletes from knowledge_base" ON storage.objects FOR DELETE USING ( bucket_id = 'knowledge_base' AND auth.role() = 'authenticated' );

-- =========================================================================
-- OPTIONAL: Voice / telephony observability (run once; ignore duplicate errors)
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.voice_pipeline_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    call_id TEXT NOT NULL,
    step TEXT NOT NULL,
    detail TEXT,
    duration_ms INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.whatsapp_inbound (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    from_number TEXT NOT NULL,
    body TEXT,
    provider TEXT DEFAULT 'twilio_whatsapp',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

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

ALTER TABLE public.voice_pipeline_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_inbound ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "voice_pipeline_events authenticated" ON public.voice_pipeline_events
  FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "whatsapp_inbound authenticated" ON public.whatsapp_inbound
  FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "call_history authenticated" ON public.call_history
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "voice_pipeline_events anon read" ON public.voice_pipeline_events FOR SELECT USING (true);
CREATE POLICY "whatsapp_inbound anon read" ON public.whatsapp_inbound FOR SELECT USING (true);
CREATE POLICY "call_history anon read" ON public.call_history FOR SELECT USING (true);

-- ALTER PUBLICATION supabase_realtime ADD TABLE voice_pipeline_events;
-- ALTER PUBLICATION supabase_realtime ADD TABLE whatsapp_inbound;
-- ALTER PUBLICATION supabase_realtime ADD TABLE call_history;

CREATE POLICY "Allow anon insert ai_agents"
ON public.ai_agents FOR INSERT WITH CHECK (true);
