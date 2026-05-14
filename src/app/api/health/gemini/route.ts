import { NextResponse } from "next/server";
import { getPlatformSetting } from "@/lib/platformSettings";

export const dynamic = "force-dynamic";

/**
 * Embedding model candidates confirmed available for this project.
 * See docs/sql/V5_embedding_dim_3072.sql — all three output 3072-d vectors.
 */
const CANDIDATES = [
  { model: "gemini-embedding-001",       apiVersion: "v1beta" },
  { model: "gemini-embedding-2",         apiVersion: "v1beta" },
  { model: "gemini-embedding-2-preview", apiVersion: "v1beta" },
];

export async function GET() {
  const start = Date.now();

  const apiKey = (await getPlatformSetting("GOOGLE_GEMINI_API_KEY")).trim();
  if (!apiKey) {
    return NextResponse.json({
      ok: false,
      error: "GOOGLE_GEMINI_API_KEY not set. Save it in API Credentials or add to .env.local.",
    });
  }

  const errors: string[] = [];

  for (const { model, apiVersion } of CANDIDATES) {
    try {
      const url = `https://generativelanguage.googleapis.com/${apiVersion}/models/${model}:embedContent?key=${apiKey}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: `models/${model}`,
          content: { parts: [{ text: "health check" }] },
          outputDimensionality: 1536,
        }),
      });

      const latencyMs = Date.now() - start;

      if (res.ok) {
        const json = await res.json() as { embedding?: { values?: number[] } };
        const dim = json?.embedding?.values?.length ?? 0;
        return NextResponse.json({ ok: true, latencyMs, model, apiVersion, dimensions: dim });
      }

      const errText = await res.text();
      errors.push(`${model}@${apiVersion} → ${res.status}: ${errText.slice(0, 120)}`);
    } catch (e) {
      errors.push(`${model}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return NextResponse.json({
    ok: false,
    error: errors.join(" | "),
    latencyMs: Date.now() - start,
  });
}
