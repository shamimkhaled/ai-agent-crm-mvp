import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      realtime: {
        // Give the WebSocket more time to connect on slow/IPv6 networks
        timeout: 30000,
        params: { eventsPerSecond: 10 },
      },
    }
  )
}
