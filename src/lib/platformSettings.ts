/**
 * Server-side utility: reads a platform setting from the DB first,
 * falls back to process.env. This lets credentials saved via the UI
 * take effect at runtime without a server restart.
 *
 * Usage:
 *   const key = await getPlatformSetting("GOOGLE_GEMINI_API_KEY");
 */

import { getSupabaseAdmin } from "@/lib/supabase/admin";

// Simple in-process cache so we don't hit the DB on every request.
// TTL: 60 seconds.
const cache = new Map<string, { value: string; expiresAt: number }>();
const CACHE_TTL_MS = 60_000;

export async function getPlatformSetting(key: string): Promise<string> {
  // 1. Check cache
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  // 2. Try DB
  const admin = getSupabaseAdmin();
  if (admin) {
    const { data } = await admin
      .from("platform_settings")
      .select("value")
      .eq("key", key)
      .maybeSingle();

    const dbValue = (data as { value?: string } | null)?.value;
    if (dbValue) {
      cache.set(key, { value: dbValue, expiresAt: Date.now() + CACHE_TTL_MS });
      return dbValue;
    }
  }

  // 3. Fallback to process.env
  const envValue = process.env[key] ?? "";
  if (envValue) {
    cache.set(key, { value: envValue, expiresAt: Date.now() + CACHE_TTL_MS });
  }
  return envValue;
}

/** Invalidate cache for a specific key (call after saving a new value). */
export function invalidatePlatformSetting(key: string) {
  cache.delete(key);
}
