/**
 * /api/settings/platform
 *
 * GET  — returns all platform_settings rows merged with process.env fallbacks.
 *         Secret values are masked to first 6 chars + "•••" so the UI can show
 *         whether a key is set without leaking the full value.
 *
 * POST — upserts one or more keys into the platform_settings table.
 *         Accepts { settings: Record<string, string> }
 *         The saved values are used by the app at runtime (no server restart needed).
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// Keys we expose, in display order. Maps setting key → env var name (if different).
const KNOWN_KEYS: { key: string; envKey?: string; isSecret: boolean }[] = [
  { key: "GOOGLE_GEMINI_API_KEY",         isSecret: true },
  { key: "GEMINI_MODEL",                   isSecret: false },
  { key: "TWILIO_ACCOUNT_SID",             isSecret: false },
  { key: "TWILIO_AUTH_TOKEN",              isSecret: true },
  { key: "TWILIO_WEBHOOK_BASE_URL",        isSecret: false },
  { key: "NEXT_PUBLIC_SUPABASE_URL",       isSecret: false },
  { key: "NEXT_PUBLIC_SUPABASE_ANON_KEY",  isSecret: true },
  { key: "SUPABASE_SERVICE_ROLE_KEY",      isSecret: true },
];

function mask(value: string, secret: boolean): string {
  if (!value) return "";
  if (!secret) return value;
  if (value.length <= 8) return "•".repeat(value.length);
  return value.slice(0, 6) + "•••" + value.slice(-4);
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET() {
  const admin = getSupabaseAdmin();

  // Load DB overrides (if table exists)
  let dbRows: Record<string, string> = {};
  if (admin) {
    const { data } = await admin
      .from("platform_settings")
      .select("key,value");
    for (const row of (data ?? []) as { key: string; value: string }[]) {
      if (row.value) dbRows[row.key] = row.value;
    }
  }

  // Merge: DB value → env fallback → empty
  const result = KNOWN_KEYS.map(({ key, envKey, isSecret }) => {
    const envName = envKey ?? key;
    const rawValue = dbRows[key] || process.env[envName] || "";
    const source: "db" | "env" | "unset" =
      dbRows[key] ? "db" : process.env[envName] ? "env" : "unset";

    return {
      key,
      isSecret,
      isSet: Boolean(rawValue),
      source,
      // For non-secrets return full value; for secrets return masked
      value: isSecret ? mask(rawValue, true) : rawValue,
    };
  });

  return NextResponse.json({ settings: result });
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const settings = (body as { settings?: Record<string, string> }).settings;
  if (!settings || typeof settings !== "object") {
    return NextResponse.json({ error: "settings object required" }, { status: 422 });
  }

  // Only allow known keys
  const allowed = new Set(KNOWN_KEYS.map((k) => k.key));
  const rows = Object.entries(settings)
    .filter(([k, v]) => allowed.has(k) && typeof v === "string" && v.trim() !== "")
    .map(([key, value]) => ({
      key,
      value: value.trim(),
      is_secret: KNOWN_KEYS.find((k) => k.key === key)?.isSecret ?? false,
      updated_at: new Date().toISOString(),
    }));

  if (rows.length === 0) {
    return NextResponse.json({ error: "No valid settings provided" }, { status: 422 });
  }

  // Try upsert; if table doesn't exist yet, return a helpful error
  const { error } = await admin
    .from("platform_settings")
    .upsert(rows, { onConflict: "key" });

  if (error) {
    if (error.message.includes("does not exist")) {
      return NextResponse.json({
        error: "platform_settings table not found. Run docs/sql/V4_platform_settings.sql in Supabase.",
      }, { status: 500 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, saved: rows.map((r) => r.key) });
}
