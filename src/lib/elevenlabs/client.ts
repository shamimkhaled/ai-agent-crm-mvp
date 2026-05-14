/**
 * ElevenLabs REST API client.
 * Handles voice library listing, cloning, and health checks.
 * Reads API key from env or platform_settings (UI-configurable).
 */

import { getPlatformSetting } from "@/lib/platformSettings";

export interface ElevenLabsVoice {
  voice_id: string;
  name: string;
  preview_url: string;
  category: "premade" | "cloned" | "generated" | "professional";
  labels: Record<string, string>;
  description?: string;
  samples?: Array<{ sample_id: string; file_name: string }>;
}

export interface ElevenLabsUser {
  subscription: {
    tier: string;
    character_count: number;
    character_limit: number;
    next_character_count_reset_unix: number;
    can_use_instant_voice_cloning: boolean;
    can_use_professional_voice_cloning: boolean;
    status: string;
  };
  xi_api_key: string;
}

export interface CloneVoiceOptions {
  name: string;
  description?: string;
  files: Blob[];
  labels?: Record<string, string>;
}

const BASE_URL = "https://api.elevenlabs.io/v1";

/**
 * Resolve ElevenLabs API key: env var → platform_settings → throw
 */
export async function getElevenLabsApiKey(): Promise<string> {
  // 1. Direct env (fastest, no DB round-trip)
  const envKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (envKey) return envKey;

  // 2. Platform settings (UI-configurable, stored encrypted)
  const dbKey = await getPlatformSetting("ELEVENLABS_API_KEY").catch(() => null);
  if (dbKey?.trim()) return dbKey.trim();

  throw new Error(
    "ELEVENLABS_API_KEY not configured. " +
    "Set it in .env.local or in Settings → Platform → ElevenLabs API Key."
  );
}

/**
 * Check ElevenLabs account status and quota.
 */
export async function getElevenLabsUser(apiKey: string): Promise<ElevenLabsUser> {
  const res = await fetch(`${BASE_URL}/user`, {
    headers: { "xi-api-key": apiKey },
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`ElevenLabs user check failed [${res.status}]: ${body.slice(0, 200)}`);
  }

  return res.json() as Promise<ElevenLabsUser>;
}

/**
 * List all available voices for this account.
 * Returns premade library + cloned voices.
 */
export async function listElevenLabsVoices(apiKey: string): Promise<ElevenLabsVoice[]> {
  const res = await fetch(`${BASE_URL}/voices`, {
    headers: { "xi-api-key": apiKey },
    next: { revalidate: 300 }, // Cache voice list for 5 minutes
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`ElevenLabs voices fetch failed [${res.status}]: ${body.slice(0, 200)}`);
  }

  const data = (await res.json()) as { voices: ElevenLabsVoice[] };
  return data.voices ?? [];
}

/**
 * Clone a voice from audio samples.
 * Requires Creator+ plan on ElevenLabs.
 *
 * @param apiKey - ElevenLabs API key
 * @param options - Voice name, description, audio sample blobs, labels
 * @returns Created voice with voice_id
 */
export async function cloneVoice(
  apiKey: string,
  options: CloneVoiceOptions
): Promise<ElevenLabsVoice> {
  const form = new FormData();
  form.append("name", options.name);
  if (options.description) form.append("description", options.description);
  if (options.labels) form.append("labels", JSON.stringify(options.labels));

  options.files.forEach((file, i) => {
    form.append("files", file, `sample_${i}.mp3`);
  });

  const res = await fetch(`${BASE_URL}/voices/add`, {
    method: "POST",
    headers: { "xi-api-key": apiKey },
    body: form,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`ElevenLabs voice clone failed [${res.status}]: ${body.slice(0, 300)}`);
  }

  const result = (await res.json()) as { voice_id: string };
  return {
    voice_id: result.voice_id,
    name: options.name,
    preview_url: "",
    category: "cloned",
    labels: options.labels ?? {},
    description: options.description,
  };
}

/**
 * Delete a cloned voice.
 */
export async function deleteVoice(apiKey: string, voiceId: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/voices/${voiceId}`, {
    method: "DELETE",
    headers: { "xi-api-key": apiKey },
  });

  if (!res.ok && res.status !== 404) {
    const body = await res.text();
    throw new Error(`ElevenLabs delete voice failed [${res.status}]: ${body.slice(0, 200)}`);
  }
}

/**
 * Generate a preview audio for a voice using a sample text.
 * Returns audio bytes (MP3).
 */
export async function previewVoice(
  apiKey: string,
  voiceId: string,
  text = "Hello! I am your AI assistant. How can I help you today?",
  model = "eleven_turbo_v2_5"
): Promise<Buffer> {
  const res = await fetch(`${BASE_URL}/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text,
      model_id: model,
      voice_settings: { stability: 0.5, similarity_boost: 0.8, speed: 1.0 },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`ElevenLabs TTS preview failed [${res.status}]: ${body.slice(0, 200)}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Validate API key — lightweight check (user info endpoint).
 */
export async function validateElevenLabsKey(apiKey: string): Promise<{
  valid: boolean;
  tier?: string;
  characterLimit?: number;
  charactersUsed?: number;
  error?: string;
}> {
  try {
    const user = await getElevenLabsUser(apiKey);
    return {
      valid: true,
      tier: user.subscription.tier,
      characterLimit: user.subscription.character_limit,
      charactersUsed: user.subscription.character_count,
    };
  } catch (e) {
    return {
      valid: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
