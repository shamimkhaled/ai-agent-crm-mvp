-- ============================================================
-- Clean up fake curl-test sessions from the active calls list
-- Run once in Supabase SQL Editor
-- ============================================================

-- Mark all fake test sessions as ended
UPDATE public.call_sessions
SET
  ended_at    = NOW(),
  call_status = 'completed',
  dashboard_state = 'ended',
  pipeline_step_index = 8,
  updated_at  = NOW()
WHERE call_sid IN ('CAtest', 'CAtest123', 'CAtest999');

-- Verify — should now return 0 rows
SELECT call_sid, dashboard_state, ended_at
FROM public.call_sessions
WHERE call_sid IN ('CAtest', 'CAtest123', 'CAtest999');
