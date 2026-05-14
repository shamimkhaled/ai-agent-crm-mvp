/**
 * POST /api/agents/[id]/test
 * Voice playground: send a message, receive AI reply using the agent's config.
 * Uses Gemini for inference. Returns text reply + latency.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getPlatformSetting } from "@/lib/platformSettings";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface Message {
  role: "user" | "model";
  parts: { text: string }[];
}

interface AgentRow {
  id: string;
  name: string;
  system_prompt: string | null;
  first_message: string | null;
  model_id: string | null;
  language: string | null;
  confidence_threshold: number | null;
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const t0 = Date.now();
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "DB not configured" }, { status: 503 });

  let body: { message: string; history?: Message[] };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { message, history = [] } = body;
  if (!message?.trim()) return NextResponse.json({ error: "message required" }, { status: 400 });

  // ── Load agent ─────────────────────────────────────────────────────────────
  const { data: agent, error: agErr } = await admin
    .from("ai_agents")
    .select("id, name, system_prompt, first_message, model_id, language, confidence_threshold")
    .eq("id", params.id)
    .maybeSingle();

  if (agErr || !agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }
  const ag = agent as AgentRow;

  // ── Build system instruction ───────────────────────────────────────────────
  const sysInstruction =
    ag.system_prompt?.trim() ||
    `You are ${ag.name}, a helpful AI voice assistant. Be concise, natural, and conversational. ` +
    `Keep responses under 3 sentences unless the user needs detail.`;

  // ── Get Gemini API key ─────────────────────────────────────────────────────
  // Env var is GOOGLE_GEMINI_API_KEY; also support legacy GEMINI_API_KEY
  const apiKey =
    (await getPlatformSetting("GOOGLE_GEMINI_API_KEY")) ||
    (await getPlatformSetting("GEMINI_API_KEY")) ||
    process.env.GOOGLE_GEMINI_API_KEY ||
    process.env.GEMINI_API_KEY ||
    "";

  if (!apiKey) {
    return NextResponse.json(
      { error: "Gemini API key not configured. Set GOOGLE_GEMINI_API_KEY in .env.local" },
      { status: 503 }
    );
  }

  const modelId = ag.model_id || "gemini-2.5-flash";

  // ── Call Gemini via direct REST (avoids SDK version issues) ───────────────
  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;

  const contents: Message[] = [
    ...history.slice(-10), // last 10 turns
    { role: "user", parts: [{ text: message.trim() }] },
  ];

  const geminiBody = {
    system_instruction: { parts: [{ text: sysInstruction }] },
    contents,
    generationConfig: {
      temperature: 0.8,
      topP: 0.95,
      maxOutputTokens: 300,
    },
  };

  let reply = "";
  let tokenCount: number | null = null;

  try {
    const geminiRes = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(geminiBody),
    });

    if (!geminiRes.ok) {
      const errBody = await geminiRes.json().catch(() => ({}));
      console.error("[agent/test] Gemini error:", errBody);
      return NextResponse.json(
        { error: `Gemini error: ${(errBody as { error?: { message?: string } }).error?.message ?? geminiRes.statusText}` },
        { status: 502 }
      );
    }

    const geminiData = await geminiRes.json() as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
      usageMetadata?: { totalTokenCount?: number };
    };

    reply =
      geminiData.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ??
      "I'm sorry, I couldn't generate a response. Please try again.";
    tokenCount = geminiData.usageMetadata?.totalTokenCount ?? null;
  } catch (err) {
    console.error("[agent/test] fetch error:", err);
    return NextResponse.json({ error: "Failed to reach Gemini" }, { status: 502 });
  }

  const latencyMs = Date.now() - t0;

  return NextResponse.json({
    reply,
    latencyMs,
    tokenCount,
    model: modelId,
    agentName: ag.name,
  });
}
