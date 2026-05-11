import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

export const dynamic = "force-dynamic";

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

export async function GET() {
  const apiKey = process.env.GOOGLE_GEMINI_API_KEY || "";
  if (!apiKey) {
    return NextResponse.json({
      ok: false,
      configured: false,
      message: "GOOGLE_GEMINI_API_KEY is not set in the environment.",
    });
  }

  const started = performance.now();
  try {
    const ai = new GoogleGenAI({ apiKey });
    const result = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: "Reply with exactly: OK",
    });
    const text = result.text ?? "";
    const latencyMs = Math.round(performance.now() - started);
    return NextResponse.json({
      ok: true,
      configured: true,
      latencyMs,
      model: GEMINI_MODEL,
      preview: text.slice(0, 80),
    });
  } catch (e: unknown) {
    const latencyMs = Math.round(performance.now() - started);
    return NextResponse.json(
      {
        ok: false,
        configured: true,
        latencyMs,
        model: GEMINI_MODEL,
        error: e instanceof Error ? e.message : "Gemini request failed",
      },
      { status: 502 }
    );
  }
}
