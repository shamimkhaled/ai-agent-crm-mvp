/**
 * ElevenLabs TTS Preview API Route
 * POST /api/voice/tts-preview
 *
 * Generates a short audio preview for a given voice and text.
 * Used by the Voice Test Console and agent editor voice selector.
 * Returns audio/mpeg stream.
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getElevenLabsApiKey, previewVoice } from "@/lib/elevenlabs/client";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const RequestSchema = z.object({
  voiceId: z.string().min(1).max(100),
  text: z.string().min(1).max(2000).optional().default(
    "Hello! I'm your AI assistant. How can I help you today?"
  ),
  model: z.string().optional().default("eleven_turbo_v2_5"),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 }
    );
  }

  const { voiceId, text, model } = parsed.data;

  try {
    const apiKey = await getElevenLabsApiKey();
    const audioBuffer = await previewVoice(apiKey, voiceId, text, model);

    const body = new Uint8Array(audioBuffer);
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": String(body.byteLength),
        "Cache-Control": "private, max-age=300",
        "X-Voice-Id": voiceId,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isUnusualActivity = message.includes("detected_unusual_activity") || message.includes("unusual activity");
    const isFreeTierBlocked = message.includes("Free Tier usage disabled");
    const isAuthError       = message.includes("401") || message.includes("403") || message.includes("not configured");
    console.error("[tts-preview]", message);

    let userError: string;
    if (isUnusualActivity || isFreeTierBlocked) {
      userError =
        "ElevenLabs Free Tier blocked: unusual activity detected (common with VPN or non-US IPs). " +
        "Upgrade to a paid plan at elevenlabs.io or disable your VPN. Using browser TTS as fallback.";
    } else if (isAuthError) {
      userError = "ElevenLabs API key invalid or missing. Check ELEVENLABS_API_KEY in .env.local. Using browser TTS as fallback.";
    } else {
      userError = `ElevenLabs TTS unavailable: ${message.slice(0, 120)}. Using browser TTS as fallback.`;
    }

    // Return 200 with fallback flag — client uses browser TTS silently
    return NextResponse.json(
      { error: userError, fallback: true },
      { status: 200 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ status: "ok — POST with { voiceId, text?, model? }" });
}
