import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Example: server-side proxy to your product REST API.
 * Set PRODUCTS_API_BASE (+ optional PRODUCTS_API_KEY) in .env — never expose keys to the browser.
 *
 * Call from Twilio gather handler: GET /api/crm/product-context?phone=%2B8801...
 * Then pass the JSON/text as `crmContext` in POST /api/chat.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const phone = searchParams.get("phone") ?? "";
  const base = process.env.PRODUCTS_API_BASE;
  const key = process.env.PRODUCTS_API_KEY;

  if (!base) {
    return NextResponse.json({
      ok: false,
      message: "Set PRODUCTS_API_BASE in .env to enable live product lookup.",
      hint: phone ? `Would lookup caller: ${phone}` : "Add ?phone=…",
    });
  }

  try {
    const url = `${base.replace(/\/$/, "")}/customers/by-phone?phone=${encodeURIComponent(phone)}`;
    const res = await fetch(url, {
      headers: key ? { Authorization: `Bearer ${key}` } : undefined,
      cache: "no-store",
    });
    const text = await res.text();
    return NextResponse.json({
      ok: res.ok,
      status: res.status,
      bodyPreview: text.slice(0, 4000),
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "fetch failed" },
      { status: 502 }
    );
  }
}
