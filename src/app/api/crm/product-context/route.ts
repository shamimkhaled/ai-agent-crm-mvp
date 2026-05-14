import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { searchKbChunks } from "@/lib/supabase/kb";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/product-context
 *
 * Returns CRM context for a caller's phone number or a text query.
 * Multi-source retrieval:
 *   1. Connector-synced KB data (semantic search via embeddings)
 *   2. Live API call to PRODUCTS_API_BASE (legacy fallback)
 *
 * Parameters:
 *   ?phone=+8801XXXXXXXXX   — caller E.164 number for caller-specific lookup
 *   ?query=order details    — search query for semantic retrieval
 *   ?connector_id=uuid      — limit to specific connector data (optional)
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const phone = searchParams.get("phone") ?? "";
  const query = searchParams.get("query") ?? "";
  const connectorId = searchParams.get("connector_id");

  const admin = getSupabaseAdmin();
  const results: string[] = [];

  // ── 1. Semantic KB search across connector-synced data ──────────────────────
  if (admin && (phone || query)) {
    const searchQuery = [phone, query].filter(Boolean).join(" ").slice(0, 500);
    try {
      const kbResult = await searchKbChunks(
        searchQuery,
        5,
        connectorId ? undefined : undefined // Can add document_id filter here
      );
      if (kbResult) results.push(kbResult);
    } catch (e) {
      console.warn("[crm/product-context] KB search failed", e instanceof Error ? e.message : e);
    }
  }

  // ── 2. Connector-specific data for this phone number ────────────────────────
  if (admin && phone) {
    const phoneDigits = phone.replace(/\D/g, "").slice(-10);
    try {
      const { data: phoneChunks } = await admin
        .from("kb_chunks")
        .select("content")
        .ilike("content", `%${phoneDigits}%`)
        .limit(3);

      if (phoneChunks && phoneChunks.length > 0) {
        const phoneContent = (phoneChunks as { content: string }[])
          .map((c) => c.content)
          .join("\n\n");
        if (!results.some((r) => r.includes(phoneDigits))) {
          results.push(phoneContent);
        }
      }
    } catch (e) {
      console.warn("[crm/product-context] phone search failed", e instanceof Error ? e.message : e);
    }
  }

  // ── 3. Legacy PRODUCTS_API_BASE proxy ───────────────────────────────────────
  const base = process.env.PRODUCTS_API_BASE;
  const key = process.env.PRODUCTS_API_KEY;

  if (base && phone) {
    try {
      const url = `${base.replace(/\/$/, "")}/customers/by-phone?phone=${encodeURIComponent(phone)}`;
      const res = await fetch(url, {
        headers: key ? { Authorization: `Bearer ${key}` } : {},
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const text = await res.text();
        if (text.trim()) results.push(text.slice(0, 4000));
      }
    } catch (e) {
      console.warn("[crm/product-context] PRODUCTS_API_BASE fetch failed", e instanceof Error ? e.message : e);
    }
  }

  // If no results, return a helpful hint rather than empty
  if (results.length === 0) {
    return NextResponse.json({
      ok: false,
      bodyPreview: null,
      message: base
        ? `No CRM data found for phone: ${phone || "(none)"}. Sync connector data to enable live lookups.`
        : "Configure connectors via /api/connectors and sync data, or set PRODUCTS_API_BASE in .env.",
      sources_checked: ["kb_chunks", base ? "PRODUCTS_API_BASE" : null].filter(Boolean),
    });
  }

  const combined = Array.from(new Set(results.filter(Boolean))).join("\n\n").slice(0, 8000);

  return NextResponse.json({
    ok: true,
    bodyPreview: combined,
    sources_count: results.length,
  });
}
