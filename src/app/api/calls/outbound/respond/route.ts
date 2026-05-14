/**
 * POST /api/calls/outbound/respond
 *
 * Called by Twilio's <Gather> on every customer utterance.
 * Processes speech → Gemini → returns next TwiML turn.
 *
 * Conversation history is persisted in call_sessions.meta.conversation
 * so each turn has full context.
 *
 * Query params: agentId (required)
 * Twilio form body:  CallSid, SpeechResult, Confidence, CallStatus
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getTwilioGatherLang } from "@/lib/elevenlabs/multilingual";

export const dynamic = "force-dynamic";
export const maxDuration = 25;

interface ConversationTurn {
  role: "user" | "agent";
  text: string;
  ts: number;
}

interface AgentRow {
  id: string;
  name: string;
  system_prompt: string | null;
  language: string | null;
  max_turns: number | null;
  model_id: string | null;
  escalation_enabled: boolean | null;
}

// ── TwiML helpers ─────────────────────────────────────────────────────────────

function twimlResponse(xml: string): NextResponse {
  return new NextResponse(`<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n${xml}\n</Response>`, {
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function sayVerb(text: string, lang: string): string {
  const escaped = escapeXml(text);
  const pollyVoice: Record<string, string> = {
    en: "Polly.Matthew", hi: "Polly.Aditi", ar: "Polly.Zeina",
    de: "Polly.Marlene", fr: "Polly.Celine", es: "Polly.Conchita",
    pt: "Polly.Vitoria", zh: "Polly.Zhiyu", ja: "Polly.Mizuki", ko: "Polly.Seoyeon",
  };
  if (pollyVoice[lang]) {
    return `  <Say voice="${pollyVoice[lang]}">${escaped}</Say>`;
  }
  const bcp47 = getTwilioGatherLang(lang);
  return `  <Say voice="alice" language="${bcp47}">${escaped}</Say>`;
}

function gatherBlock(actionUrl: string, lang: string): string {
  const gatherLang = getTwilioGatherLang(lang);
  return `  <Gather input="speech" action="${actionUrl}" method="POST" timeout="8" speechTimeout="auto" language="${gatherLang}"></Gather>`;
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const url     = new URL(req.url);
  const agentId = url.searchParams.get("agentId") ?? "";

  if (!agentId) {
    return twimlResponse(`  <Say>Configuration error. Goodbye.</Say>\n  <Hangup/>`);
  }

  // ── Parse Twilio form body ──────────────────────────────────────────────────
  let callSid    = "";
  let speechResult = "";
  let callStatus = "";

  try {
    const form = await req.formData();
    callSid      = form.get("CallSid")?.toString()     ?? "";
    speechResult = form.get("SpeechResult")?.toString() ?? "";
    callStatus   = form.get("CallStatus")?.toString()   ?? "";
  } catch {
    return twimlResponse(`  <Say>Request error. Goodbye.</Say>\n  <Hangup/>`);
  }

  // ── Abort if call is already ended ─────────────────────────────────────────
  if (["completed", "failed", "busy", "no-answer", "canceled"].includes(callStatus)) {
    return twimlResponse("  <Hangup/>");
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return twimlResponse(`  <Say>Service unavailable.</Say>\n  <Hangup/>`);
  }

  // ── Load agent config ───────────────────────────────────────────────────────
  const { data: agent } = await admin
    .from("ai_agents")
    .select("id, name, system_prompt, language, max_turns, model_id, escalation_enabled")
    .eq("id", agentId)
    .maybeSingle();

  if (!agent) {
    return twimlResponse(`  <Say>Agent not found. Goodbye.</Say>\n  <Hangup/>`);
  }

  const ag   = agent as AgentRow;
  const lang = ag.language ?? "en";

  // ── Load conversation history from Supabase ─────────────────────────────────
  const { data: session } = await admin
    .from("call_sessions")
    .select("id, meta, pipeline_step_index")
    .eq("call_sid", callSid)
    .maybeSingle();

  const sessionRow = session as {
    id: string;
    meta: { conversation?: ConversationTurn[]; direction?: string };
    pipeline_step_index: number;
  } | null;

  const conversation: ConversationTurn[] = sessionRow?.meta?.conversation ?? [];
  const turnCount = sessionRow?.pipeline_step_index ?? 0;
  const maxTurns  = ag.max_turns ?? 20;

  // ── Handle no-input from caller ─────────────────────────────────────────────
  if (!speechResult.trim()) {
    const reprompt = lang === "bn"
      ? "আমি বুঝতে পারিনি। আবার বলুন?"
      : "I didn't catch that. Could you repeat?";

    const respondUrl = `${(process.env.TWILIO_WEBHOOK_BASE_URL ?? "").replace(/\/$/, "")}/api/calls/outbound/respond?agentId=${agentId}`;

    return twimlResponse(
      `${sayVerb(reprompt, lang)}\n${gatherBlock(respondUrl, lang)}\n  <Hangup/>`
    );
  }

  // ── Max turns guard: politely end the conversation ──────────────────────────
  if (turnCount >= maxTurns) {
    const farewell = lang === "bn"
      ? "ধন্যবাদ আপনার সময়ের জন্য। আবার কথা হবে। শুভকামনা!"
      : "Thank you so much for your time today. It was great speaking with you. Have a wonderful day. Goodbye!";
    return twimlResponse(`${sayVerb(farewell, lang)}\n  <Hangup/>`);
  }

  // ── Add user turn to history ────────────────────────────────────────────────
  const userTurn: ConversationTurn = { role: "user", text: speechResult.trim(), ts: Date.now() };
  conversation.push(userTurn);

  // ── Build Gemini request ────────────────────────────────────────────────────
  const geminiApiKey =
    process.env.GOOGLE_GEMINI_API_KEY ||
    process.env.GEMINI_API_KEY || "";

  if (!geminiApiKey) {
    const errMsg = lang === "bn"
      ? "দুঃখিত, AI সংযোগে সমস্যা হচ্ছে।"
      : "I'm sorry, I'm having trouble connecting right now. Please try again later.";
    return twimlResponse(`${sayVerb(errMsg, lang)}\n  <Hangup/>`);
  }

  const sysPrompt = ag.system_prompt?.trim() ||
    (lang === "bn"
      ? `আপনি ${ag.name}, একটি AI ভয়েস সহকারী। ফোন কলে সংক্ষিপ্ত, স্বাভাবিক বাংলায় উত্তর দিন। সর্বোচ্চ ২-৩ বাক্য।`
      : `You are ${ag.name}, an AI voice assistant on a phone call. Be concise, natural, and conversational. Keep responses under 3 sentences unless absolutely necessary.`);

  // Full language instruction
  const langNote = lang === "bn"
    ? "\nউত্তর সবসময় বাংলায় দিন। Code-mixing স্বাভাবিক।"
    : "";

  const geminiContents = conversation.slice(-14).map((turn) => ({
    role: turn.role === "user" ? "user" : "model",
    parts: [{ text: turn.text }],
  }));

  const modelId   = ag.model_id || "gemini-2.5-flash";
  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${geminiApiKey}`;

  let agentReply = "";
  try {
    const geminiRes = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: sysPrompt + langNote }] },
        contents: geminiContents,
        generationConfig: {
          temperature: 0.8,
          topP: 0.95,
          maxOutputTokens: 200, // Short for voice — ~30 seconds of speech
          stopSequences: ["\n\n", "---"],
        },
      }),
    });

    const geminiData = await geminiRes.json() as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
      error?: { message?: string };
    };

    if (geminiData.error) {
      throw new Error(geminiData.error.message ?? "Gemini error");
    }

    agentReply = geminiData.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
  } catch (e) {
    console.error("[outbound/respond] Gemini error:", e);
    agentReply = lang === "bn"
      ? "দুঃখিত, একটু সমস্যা হচ্ছে। আবার চেষ্টা করুন।"
      : "I'm sorry, I had a small hiccup. Could you repeat that?";
  }

  // ── Clean reply for TTS (strip markdown, asterisks, etc.) ──────────────────
  const spokenReply = agentReply
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/#{1,6}\s/g, "")
    .replace(/`{1,3}(.+?)`{1,3}/g, "$1")
    .trim();

  // ── Save agent turn + update session ───────────────────────────────────────
  const agentTurn: ConversationTurn = { role: "agent", text: spokenReply, ts: Date.now() };
  conversation.push(agentTurn);

  if (sessionRow?.id) {
    await admin.from("call_sessions").update({
      pipeline_step_index: turnCount + 1,
      updated_at: new Date().toISOString(),
      dashboard_state: "outbound_active",
      meta: {
        ...(sessionRow.meta ?? {}),
        conversation,
      },
    }).eq("id", sessionRow.id);
  }

  // ── Build next TwiML ────────────────────────────────────────────────────────
  const baseUrl    = (process.env.TWILIO_WEBHOOK_BASE_URL ?? "").replace(/\/$/, "");
  const respondUrl = `${baseUrl}/api/calls/outbound/respond?agentId=${agentId}`;

  // Check if agent reply signals end of conversation
  const endSignals = [
    "goodbye", "have a great day", "take care", "bye", "farewell",
    "আবার কথা হবে", "শুভকামনা", "ধন্যবাদ কল করার",
  ];
  const isEndOfConversation = endSignals.some((sig) =>
    spokenReply.toLowerCase().includes(sig)
  );

  let xml = sayVerb(spokenReply, lang) + "\n";

  if (isEndOfConversation || turnCount + 1 >= maxTurns) {
    xml += "  <Hangup/>";
  } else {
    xml += gatherBlock(respondUrl, lang) + "\n";
    // Silence after gather = reprompt once then hang up
    const silence = lang === "bn"
      ? "আর কি সাহায্য করতে পারি?"
      : "Is there anything else I can help you with?";
    xml += sayVerb(silence, lang) + "\n";
    xml += gatherBlock(respondUrl, lang) + "\n";
    xml += "  <Hangup/>";
  }

  return twimlResponse(xml);
}
