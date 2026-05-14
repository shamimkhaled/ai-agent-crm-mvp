-- =============================================================================
-- V3 · Seed default organization + make organization_id nullable safely
-- Run this once in your Supabase SQL editor.
-- =============================================================================

-- 1. Insert a default organization (idempotent — skipped if slug already exists)
INSERT INTO public.organizations (id, name, slug)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Default Organization',
  'default'
)
ON CONFLICT (slug) DO NOTHING;

-- 2. Backfill any existing rows in crm_connectors that have organization_id = NULL
--    (should not happen after a clean setup, but safe to run)
UPDATE public.crm_connectors
SET organization_id = '00000000-0000-0000-0000-000000000001'
WHERE organization_id IS NULL;

-- Done. The API will now automatically use this org when no tenant_id is supplied.
