/**
 * GET/POST /api/calls/outbound/twiml
 *
 * Called by Twilio when the customer answers the outbound call.
 * Returns TwiML that:
 *   1. Greets the customer with the agent's first_message (if agent_speaks_first)
 *   2. Opens a <Gather speech> to capture caller input
 *   3. Routes speech to /api/calls/outbound/respond for AI processing
 *
 * Query params: agentId (required)
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getTwilioGatherLang, getTwilioSayVoice } from "@/lib/elevenlabs/multilingual";

export const dynamic = "force-dynamic";

interface AgentRow {
  id: string;
  name: string;
  system_prompt: string | null;
  first_message: string | null;
  agent_speaks_first: boolean | null;
  language: string | null;
  tts_voice: string | null;
  max_turns: number | null;
}

/** Build valid TwiML XML response */
function twimlResponse(xml: string): NextResponse {
  return new NextResponse(`<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n${xml}\n</Response>`, {
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

/**
 * Build a <Say> verb with the right voice for the agent's language.
 * Falls back to `alice` for unsupported languages.
 */
function sayVerb(text: string, lang: string): string {
  const escapedText = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

  // Polly voices that support speaking naturally in their language
  const pollyVoice = (() => {
    switch (lang) {
      case "en": return "Polly.Matthew";
      case "hi": return "Polly.Aditi";
      case "ar": return "Polly.Zeina";
      case "de": return "Polly.Marlene";
      case "fr": return "Polly.Celine";
      case "es": return "Polly.Conchita";
      case "pt": return "Polly.Vitoria";
      case "zh": return "Polly.Zhiyu";
      case "ja": return "Polly.Mizuki";
      case "ko": return "Polly.Seoyeon";
      // Bengali has no native Polly TTS — use alice + bn-BD language tag
      default:   return null;
    }
  })();

  if (pollyVoice) {
    return `  <Say voice="${pollyVoice}">${escapedText}</Say>`;
  }

  // Bengali and others: use alice with language tag
  const bcp47 = getTwilioGatherLang(lang);
  return `  <Say voice="alice" language="${bcp47}">${escapedText}</Say>`;
}

/**
 * Build the <Gather> block that captures caller's speech.
 */
function gatherBlock(actionUrl: string, lang: string, nested?: string): string {
  const gatherLang = getTwilioGatherLang(lang);
  return `  <Gather input="speech" action="${actionUrl}" method="POST" timeout="8" speechTimeout="auto" language="${gatherLang}">
${nested ?? ""}  </Gather>`;
}

async function handleRequest(req: NextRequest): Promise<NextResponse> {
  const url     = new URL(req.url);
  const agentId = url.searchParams.get("agentId") ?? "";

  if (!agentId) {
    return twimlResponse(`  <Say>Configuration error: no agent ID provided.</Say>\n  <Hangup/>`);
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return twimlResponse(`  <Say>Service unavailable. Please try again later.</Say>\n  <Hangup/>`);
  }

  // Get call_sid from Twilio POST body (sent when call is answered)
  let callSid = url.searchParams.get("callSid") ?? "";
  if (!callSid && req.method === "POST") {
    try {
      const form = await req.formData();
      callSid = form.get("CallSid")?.toString() ?? "";
    } catch {
      callSid = "";
    }
  }

  // ── Load agent ──────────────────────────────────────────────────────────────
  const { data: agent, error } = await admin
    .from("ai_agents")
    .select("id, name, system_prompt, first_message, agent_speaks_first, language, tts_voice, max_turns")
    .eq("id", agentId)
    .maybeSingle();

  if (error || !agent) {
    return twimlResponse(`  <Say>Agent not found. Goodbye.</Say>\n  <Hangup/>`);
  }

  const ag = agent as AgentRow;
  const lang     = ag.language ?? "en";
  const baseUrl  = (process.env.TWILIO_WEBHOOK_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  const respondUrl = `${baseUrl}/api/calls/outbound/respond?agentId=${agentId}`;

  // ── Build TwiML ─────────────────────────────────────────────────────────────
  let xml = "";

  if (ag.agent_speaks_first && ag.first_message?.trim()) {
    xml += sayVerb(ag.first_message.trim(), lang) + "\n";
  } else {
    // Default greeting
    const defaultGreeting =
      lang === "bn"
        ? `হ্যালো! আমি ${ag.name}। কীভাবে সাহায্য করতে পারি?`
        : `Hello! I'm ${ag.name}. How can I help you today?`;
    xml += sayVerb(defaultGreeting, lang) + "\n";
  }

  xml += gatherBlock(respondUrl, lang) + "\n";

  // No-input fallback
  xml += sayVerb(
    lang === "bn" ? "আমি কোনো কথা শুনতে পাইনি। ধন্যবাদ।" : "I didn't catch that. Thank you for calling. Goodbye!",
    lang
  ) + "\n";
  xml += "  <Hangup/>";

  return twimlResponse(xml);
}

export const GET  = handleRequest;
export const POST = handleRequest;
