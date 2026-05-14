/**
 * POST /api/agents/generate-prompt
 *
 * Generates a complete, production-quality system prompt for an AI voice agent
 * using Gemini. Takes the user's seed text + agent context as input.
 *
 * Also generates multiple first_message options in one round-trip.
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { generateGeminiResponse } from "@/services/gemini";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const RequestSchema = z.object({
  seed: z.string().max(8000).optional().default(""),
  agentName: z.string().max(200).optional().default("AI Assistant"),
  department: z.string().max(200).optional().default("Support"),
  language: z.string().max(20).optional().default("en"),
  voiceProvider: z.string().max(100).optional().default("browser"),
  mode: z.enum(["prompt", "first_messages", "both"]).optional().default("both"),
});

const SYSTEM_INSTRUCTION = `You are an expert AI voice agent designer specializing in building 
production-grade conversational AI systems (similar to Bland AI, Retell AI, Vapi).
Your job is to write precise, effective system prompts and natural opening messages 
for AI voice agents used in customer service, sales, and support call centers.

Rules for system prompts:
- Write in clear, direct instruction format
- Cover: persona, tone, goals, behavior rules, escalation triggers, response length limits
- Keep responses concise for voice (2-3 sentences max per answer)
- Include language-appropriate instructions
- Mention the agent's name and role naturally
- Cover edge cases (confused caller, angry caller, off-topic questions)

Rules for first messages (opening greetings):
- 1-2 sentences max — this is what the caller hears first
- Natural, warm, professional — not robotic
- Include agent name
- Invite the caller to share their need
- Vary style: formal, casual, branded, question-based
`;

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
    return NextResponse.json(
      { error: "Validation failed", issues },
      { status: 422 }
    );
  }

  const { seed, agentName, department, language, voiceProvider, mode } = parsed.data;

  const langLabel = language === "bn" ? "Bengali (Bangla)" : language === "es" ? "Spanish" : language === "fr" ? "French" : language === "ar" ? "Arabic" : language === "hi" ? "Hindi" : "English";

  const contextBlock = `
Agent Name: ${agentName}
Department: ${department}
Language: ${langLabel}
Voice Provider: ${voiceProvider}
${seed.trim() ? `User's seed/notes: "${seed.trim()}"` : "No seed provided — generate a complete default for this department."}
`.trim();

  const requests: Promise<{ text: string; error?: string }>[] = [];

  // ── Generate system prompt ─────────────────────────────────────────────────
  if (mode === "prompt" || mode === "both") {
    const promptRequest = generateGeminiResponse(
      [{
        role: "user",
        content: `Generate a complete, production-ready system prompt for this AI voice agent:

${contextBlock}

Return ONLY the system prompt text. No explanations, no markdown, no code blocks.
The prompt should be 200-400 words, covering:
1. Agent identity and role
2. Tone and communication style  
3. Primary goals and capabilities
4. What the agent can and cannot do
5. Escalation triggers (when to transfer to human)
6. Response format rules (concise for voice, 2-3 sentences max)
7. Language and cultural notes if non-English`,
      }],
      SYSTEM_INSTRUCTION
    );
    requests.push(promptRequest);
  }

  // ── Generate first message options ─────────────────────────────────────────
  if (mode === "first_messages" || mode === "both") {
    const messagesRequest = generateGeminiResponse(
      [{
        role: "user",
        content: `Generate exactly 5 different opening messages for this AI voice agent:

${contextBlock}

Requirements:
- Each message is 1-2 sentences
- Natural, warm, professional — sounds human when spoken aloud
- Include the agent's name (${agentName})
- End with an open-ended invitation
- Vary the style: (1) formal, (2) friendly/casual, (3) branded/company-focused, (4) question-based, (5) empathetic/service-focused

Return ONLY a JSON array of 5 strings, no explanation:
["message 1", "message 2", "message 3", "message 4", "message 5"]`,
      }],
      SYSTEM_INSTRUCTION
    );
    requests.push(messagesRequest);
  }

  try {
    const results = await Promise.all(requests);

    let systemPrompt: string | undefined;
    let firstMessages: string[] | undefined;

    if (mode === "prompt") {
      systemPrompt = results[0]?.text?.trim() || "";
    } else if (mode === "first_messages") {
      firstMessages = parseMessageArray(results[0]?.text || "", agentName);
    } else {
      // both
      systemPrompt = results[0]?.text?.trim() || "";
      firstMessages = parseMessageArray(results[1]?.text || "", agentName);
    }

    return NextResponse.json({
      ok: true,
      systemPrompt,
      firstMessages,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[generate-prompt]", message);
    return NextResponse.json(
      { error: "Generation failed", detail: message.slice(0, 200) },
      { status: 502 }
    );
  }
}

function parseMessageArray(text: string, agentName: string): string[] {
  // Extract JSON array from Gemini response
  try {
    const match = text.match(/\[[\s\S]*\]/);
    if (match) {
      const arr = JSON.parse(match[0]) as unknown;
      if (Array.isArray(arr)) {
        return (arr as unknown[])
          .filter((item): item is string => typeof item === "string")
          .slice(0, 5);
      }
    }
  } catch {
    // fallback below
  }

  // Fallback: default department-appropriate messages
  return [
    `Hello! I'm ${agentName}. How can I help you today?`,
    `Hi there! You've reached ${agentName}. What can I assist you with?`,
    `Thank you for calling. I'm ${agentName} and I'm here to help. What brings you in today?`,
    `Good day! ${agentName} here — what can I do for you?`,
    `Welcome! I'm ${agentName}. I'm ready to assist — what's on your mind?`,
  ];
}
