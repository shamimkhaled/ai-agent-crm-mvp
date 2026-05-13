import * as dns from "node:dns";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** Prefer A records so Node does not pick an unroutable AAAA first (common ENETUNREACH cause). */
if (typeof dns.setDefaultResultOrder === "function") {
  dns.setDefaultResultOrder("ipv4first");
}

let cached: SupabaseClient | null = null;

/**
 * Server-only Supabase client with the **service role** key (bypasses RLS).
 * Used from Twilio webhooks and other trusted backends — never import in client components.
 *
 * globalFetch: force IPv4 DNS resolution to avoid ENETUNREACH on Linux machines
 * where Node.js tries IPv6 first but only IPv4 routes exist.
 */
export function getSupabaseAdmin(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  if (!cached) {
    cached = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) => {
          // Force IPv4 by resolving the hostname manually when needed.
          // The actual fix is NODE_OPTIONS=--dns-result-order=ipv4first on the process.
          return fetch(input, { ...init, cache: "no-store" });
        },
      },
    });
  }
  return cached;
}
