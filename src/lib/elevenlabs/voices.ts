/**
 * ElevenLabs voice library — language-grouped, multilingual-aware.
 *
 * Primary focus: English + Bangla (with full extensibility for future languages).
 *
 * KEY FACTS about ElevenLabs multilingual TTS:
 *   - eleven_turbo_v2_5 detects language automatically from input TEXT
 *   - Bangla (বাংলা) text → Bangla speech, no separate "set language" API needed
 *   - Use MULTILINGUAL voices for any non-English language (they handle Bengali natively)
 *   - For best Bangla quality: jessica or chris voice + eleven_turbo_v2_5 model
 *   - Custom cloned Bangla voices: add via addCustomVoice() at runtime
 */

import type { SupportedLanguageCode } from "./multilingual";
import { MULTILINGUAL_VOICE_IDS } from "./multilingual";

// ============================================================
// Types
// ============================================================

export interface VoiceOption {
  voice_id: string;
  name: string;
  /** Primary language this voice is optimized for */
  language: SupportedLanguageCode | "multilingual";
  /** All languages this voice can speak (multilingual voices support many) */
  supported_languages: Array<SupportedLanguageCode | "all">;
  accent?: string;
  gender: "male" | "female" | "neutral";
  use_case: string;
  /** Quality tier — affects model recommendation */
  tier: "premium" | "standard" | "fast";
  preview_url?: string;
  /** Whether this is a cloned/custom voice */
  custom?: boolean;
  /** Short note shown in UI */
  note?: string;
}

// ============================================================
// English voices
// ============================================================

export const ENGLISH_VOICES: VoiceOption[] = [
  // Female
  {
    voice_id: "pNInz6obpgDQGcFmaJgB",
    name: "Rachel",
    language: "en",
    supported_languages: ["en"],
    accent: "American",
    gender: "female",
    use_case: "Customer Support, Narration",
    tier: "premium",
  },
  {
    voice_id: "EXAVITQu4vr4xnSDxMaL",
    name: "Bella",
    language: "en",
    supported_languages: ["en"],
    accent: "American",
    gender: "female",
    use_case: "IVR, Informational",
    tier: "standard",
  },
  {
    voice_id: "AZnzlk1XvdvUeBnXmlld",
    name: "Domi",
    language: "en",
    supported_languages: ["en"],
    accent: "American",
    gender: "female",
    use_case: "Technical Support, Professional",
    tier: "standard",
  },
  {
    voice_id: "MF3mGyEYCl7XYWbV9V6O",
    name: "Elli",
    language: "en",
    supported_languages: ["en"],
    accent: "American",
    gender: "female",
    use_case: "Sales, Friendly",
    tier: "standard",
  },
  {
    voice_id: "jsCqWAovK2LkecY7zXl4",
    name: "Freya",
    language: "en",
    supported_languages: ["en"],
    accent: "British",
    gender: "female",
    use_case: "Professional, UK Market",
    tier: "standard",
  },
  // Male
  {
    voice_id: "ErXwobaYiN019PkySvjV",
    name: "Antoni",
    language: "en",
    supported_languages: ["en"],
    accent: "American",
    gender: "male",
    use_case: "Sales, Outbound Calls",
    tier: "premium",
  },
  {
    voice_id: "VR6AewLTigWG4xSOukaG",
    name: "Arnold",
    language: "en",
    supported_languages: ["en"],
    accent: "American",
    gender: "male",
    use_case: "Enterprise, Authority",
    tier: "standard",
  },
  {
    voice_id: "pqHfZKP75CvOlQylNhV4",
    name: "Bill",
    language: "en",
    supported_languages: ["en"],
    accent: "American",
    gender: "male",
    use_case: "Dealer Desk, B2B",
    tier: "standard",
  },
  {
    voice_id: "21m00Tcm4TlvDq8ikWAM",
    name: "Adam",
    language: "en",
    supported_languages: ["en"],
    accent: "American",
    gender: "male",
    use_case: "General Purpose, Deep Voice",
    tier: "standard",
  },
  {
    voice_id: "IKne3meq5aSn9XLyUdCD",
    name: "Charlie",
    language: "en",
    supported_languages: ["en"],
    accent: "Australian",
    gender: "male",
    use_case: "Casual, APAC Market",
    tier: "standard",
  },
  {
    voice_id: "onwK4e9ZLuTAKqWW03F9",
    name: "Daniel",
    language: "en",
    supported_languages: ["en"],
    accent: "British",
    gender: "male",
    use_case: "Professional, Corporate",
    tier: "premium",
  },
];

// ============================================================
// Multilingual voices — RECOMMENDED for Bangla + other languages
// ============================================================

export const MULTILINGUAL_VOICES: VoiceOption[] = [
  {
    voice_id: MULTILINGUAL_VOICE_IDS.jessica,
    name: "Jessica",
    language: "multilingual",
    supported_languages: ["all"],
    gender: "female",
    use_case: "Bangla Support, Multilingual CRM",
    tier: "premium",
    note: "⭐ Best for Bangla — warm, natural Bengali pronunciation",
  },
  {
    voice_id: MULTILINGUAL_VOICE_IDS.chris,
    name: "Chris",
    language: "multilingual",
    supported_languages: ["all"],
    gender: "male",
    use_case: "Bangla Sales, Multilingual B2B",
    tier: "premium",
    note: "⭐ Best male for Bangla — professional, clear",
  },
  {
    voice_id: MULTILINGUAL_VOICE_IDS.matilda,
    name: "Matilda",
    language: "multilingual",
    supported_languages: ["all"],
    gender: "female",
    use_case: "Friendly, Customer Service",
    tier: "premium",
    note: "Warm and friendly — works well with Bengali text",
  },
  {
    voice_id: MULTILINGUAL_VOICE_IDS.callum,
    name: "Callum",
    language: "multilingual",
    supported_languages: ["all"],
    gender: "male",
    use_case: "Conversational, IVR",
    tier: "standard",
    note: "Natural conversational tone for mixed Bangla-English",
  },
  {
    voice_id: MULTILINGUAL_VOICE_IDS.lily,
    name: "Lily",
    language: "multilingual",
    supported_languages: ["all"],
    gender: "female",
    use_case: "Soft, Calm — After Hours IVR",
    tier: "standard",
    note: "Calm and soothing — good for after-hours messages",
  },
  {
    voice_id: MULTILINGUAL_VOICE_IDS.daniel,
    name: "Daniel",
    language: "multilingual",
    supported_languages: ["all"],
    accent: "British",
    gender: "male",
    use_case: "Professional, Enterprise",
    tier: "premium",
    note: "Authoritative — suitable for enterprise Bangla agents",
  },
];

/** Curated static list for settings UIs (e.g. voice testing). Multilingual first, then English. Runtime clones: `getAllVoices()`. */
export const ELEVENLABS_CURATED_VOICES: VoiceOption[] = [
  ...MULTILINGUAL_VOICES,
  ...ENGLISH_VOICES,
];

// ============================================================
// Custom / Cloned Bangla voices (add your clones here)
// ============================================================

/**
 * Runtime registry for custom cloned voices (Bangla or other languages).
 * Populated by addCustomVoice() — persisted in Supabase platform_settings.
 */
const CUSTOM_VOICES: VoiceOption[] = [];

export function addCustomVoice(voice: VoiceOption): void {
  const existing = CUSTOM_VOICES.findIndex((v) => v.voice_id === voice.voice_id);
  if (existing !== -1) {
    CUSTOM_VOICES[existing] = voice;
  } else {
    CUSTOM_VOICES.push({ ...voice, custom: true });
  }
}

export function getCustomVoices(): VoiceOption[] {
  return [...CUSTOM_VOICES];
}

// ============================================================
// Combined registry
// ============================================================

export function getAllVoices(): VoiceOption[] {
  return [...CUSTOM_VOICES, ...MULTILINGUAL_VOICES, ...ENGLISH_VOICES];
}

/**
 * Get voices appropriate for a given language.
 *
 * Logic:
 *   - "en" → English-only voices + multilingual
 *   - "bn" (Bangla) → Multilingual voices FIRST (they handle Bengali natively) + custom Bangla clones
 *   - any other → Multilingual voices + custom voices for that language
 *   - "multilingual" or "auto" → All voices
 */
export function getVoicesForLanguage(langCode: string): VoiceOption[] {
  const lang = langCode?.toLowerCase()?.split("-")[0];

  if (lang === "en") {
    return [
      ...CUSTOM_VOICES.filter((v) => v.language === "en" || v.language === "multilingual" || v.supported_languages.includes("all")),
      ...MULTILINGUAL_VOICES,
      ...ENGLISH_VOICES,
    ];
  }

  if (lang === "bn") {
    // For Bangla: custom Bangla clones first, then multilingual voices
    // English-only voices are NOT shown (they cannot produce Bengali speech)
    return [
      ...CUSTOM_VOICES.filter((v) => v.language === "bn" || v.language === "multilingual" || v.supported_languages.includes("all")),
      ...MULTILINGUAL_VOICES,
    ];
  }

  if (!lang || lang === "multilingual" || lang === "auto") {
    return getAllVoices();
  }

  // Any other language — multilingual voices + matching custom voices
  return [
    ...CUSTOM_VOICES.filter((v) => v.language === lang || v.language === "multilingual" || v.supported_languages.includes("all")),
    ...MULTILINGUAL_VOICES,
  ];
}

/**
 * Get the recommended default voice ID for a language.
 * Returns the top recommendation from the language registry.
 */
export function getDefaultVoiceForLanguage(langCode: string): string {
  const lang = langCode?.toLowerCase()?.split("-")[0];

  if (lang === "bn") {
    // Jessica is the best multilingual voice for Bangla
    return MULTILINGUAL_VOICE_IDS.jessica;
  }
  if (lang === "en") {
    // Rachel — classic, highly-rated English voice
    return "pNInz6obpgDQGcFmaJgB";
  }
  // For any other language, use Jessica (best multilingual)
  return MULTILINGUAL_VOICE_IDS.jessica;
}

// ============================================================
// Model registry
// ============================================================

export const ELEVENLABS_MODELS = [
  {
    id: "eleven_turbo_v2_5",
    name: "Turbo v2.5",
    badge: "Recommended",
    description: "Lowest latency · 32 languages · Bangla supported",
    latencyMs: 200,
    multilingual: true,
    supportsBangla: true,
  },
  {
    id: "eleven_flash_v2_5",
    name: "Flash v2.5",
    badge: "Fastest",
    description: "Ultra-low latency · multilingual · slight quality tradeoff",
    latencyMs: 120,
    multilingual: true,
    supportsBangla: true,
  },
  {
    id: "eleven_multilingual_v2",
    name: "Multilingual v2",
    badge: "Best Quality",
    description: "Highest quality · 29 languages · Bangla supported · higher latency",
    latencyMs: 400,
    multilingual: true,
    supportsBangla: true,
  },
  {
    id: "eleven_turbo_v2",
    name: "Turbo v2",
    badge: "English Only",
    description: "English only — do NOT use for Bangla",
    latencyMs: 250,
    multilingual: false,
    supportsBangla: false,
  },
] as const;

export type ElevenLabsModelId = (typeof ELEVENLABS_MODELS)[number]["id"];

/**
 * Get the recommended model for a given language.
 * English-only models are filtered out for non-English languages.
 */
export function getRecommendedModelForLanguage(langCode: string): ElevenLabsModelId {
  const lang = langCode?.toLowerCase()?.split("-")[0];
  // For Bangla and other non-English languages, always use turbo_v2_5
  // eleven_turbo_v2 (v2, not v2_5) is English-only
  if (lang !== "en") return "eleven_turbo_v2_5";
  return "eleven_turbo_v2_5"; // default for all
}

/**
 * Get models available for a language (filter out incompatible ones).
 */
export function getModelsForLanguage(langCode: string): typeof ELEVENLABS_MODELS[number][] {
  const lang = langCode?.toLowerCase()?.split("-")[0];
  if (lang === "en") return [...ELEVENLABS_MODELS];
  // Non-English: exclude english-only models
  return ELEVENLABS_MODELS.filter((m) => m.multilingual);
}

// ============================================================
// STT models
// ============================================================

export const ELEVENLABS_STT_MODELS = [
  {
    id: "scribe_v1",
    name: "Scribe v1",
    description: "99 languages · streaming · Bangla (bn) supported",
    supportsStreaming: true,
    supportsBangla: true,
  },
] as const;

// ============================================================
// Utility helpers
// ============================================================

/**
 * Look up a voice by its ID (searches all registries).
 */
export function getVoiceById(voiceId: string): VoiceOption | undefined {
  return getAllVoices().find((v) => v.voice_id === voiceId);
}

/**
 * Get a display label for a voice ID.
 */
export function getVoiceDisplayName(voiceId: string): string {
  const voice = getVoiceById(voiceId);
  if (!voice) return voiceId.slice(0, 8) + "…";
  const parts = [voice.name];
  if (voice.accent) parts.push(`(${voice.accent})`);
  if (voice.language === "multilingual") parts.push("· Multilingual");
  return parts.join(" ");
}

/**
 * Check if a voice supports a given language.
 */
export function voiceSupportsLanguage(voiceId: string, langCode: string): boolean {
  const voice = getVoiceById(voiceId);
  if (!voice) return false;
  if (voice.supported_languages.includes("all")) return true;
  const lang = langCode?.toLowerCase()?.split("-")[0] as SupportedLanguageCode;
  return voice.supported_languages.includes(lang) || voice.language === lang;
}

/**
 * Validate that a voice+model combination is valid for a language.
 * Returns a warning message if incompatible, null if OK.
 */
export function validateVoiceModelLanguage(
  voiceId: string,
  modelId: string,
  langCode: string
): string | null {
  const lang = langCode?.toLowerCase()?.split("-")[0];

  // eleven_turbo_v2 is English-only — warn for non-English
  if (modelId === "eleven_turbo_v2" && lang !== "en") {
    return `⚠ eleven_turbo_v2 only supports English. Switch to eleven_turbo_v2_5 for ${lang?.toUpperCase() || "this language"}.`;
  }

  // English-only voices (no supported_languages: "all") — warn for Bangla
  const voice = getVoiceById(voiceId);
  if (voice && lang === "bn") {
    const supported = voice.supported_languages.includes("all") || voice.language === "multilingual";
    if (!supported) {
      return `⚠ ${voice.name} is an English-only voice. For Bangla, use a Multilingual voice (e.g. Jessica or Chris).`;
    }
  }

  return null;
}
