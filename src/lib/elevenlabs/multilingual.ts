/**
 * ElevenLabs Multilingual Support — Central Language Registry
 *
 * Supports English + Bangla (Bengali) as primary languages.
 * Designed to be extensible: add new languages by adding an entry to LANGUAGE_REGISTRY.
 *
 * HOW ElevenLabs handles multilingual:
 *   STT (Scribe v1): 99 languages, set `language_code` per session or use auto-detect.
 *   TTS (eleven_turbo_v2_5): Detects language automatically from input text.
 *              Use multilingual voices (Jessica, Chris, etc.) for best results.
 *              Bengali text → Bengali speech automatically.
 *
 * Key insight for Bangla:
 *   - Gemini outputs বাংলা text when prompted in Bangla
 *   - ElevenLabs TTS reads that text and produces Bangla speech naturally
 *   - No separate "set language" API call needed for TTS
 *   - STT: set language_code = "bn" for best Bengali accuracy
 */

// ============================================================
// Core type definitions
// ============================================================

export type SupportedLanguageCode = "en" | "bn" | "hi" | "ar" | "es" | "fr" | "de" | "pt" | "zh" | "ja" | "ko" | "ur" | "id";

export interface LanguageSTTConfig {
  /** ElevenLabs Scribe v1 language code */
  elevenLabsCode: string;
  /** Whether to use auto-detect mode (omit language_code in payload) */
  autoDetect: boolean;
  /** Deepgram language code (fallback STT) */
  deepgramCode: string;
  /** Twilio Gather <speech> language attribute */
  twilioSpeechLang: string;
}

export interface LanguageTTSConfig {
  /**
   * Recommended ElevenLabs model.
   * eleven_turbo_v2_5 handles English + Bangla natively.
   * eleven_multilingual_v2 gives higher quality at higher latency.
   */
  recommendedModel: "eleven_turbo_v2_5" | "eleven_flash_v2_5" | "eleven_multilingual_v2";
  /**
   * Voice IDs that produce good results for this language.
   * Multilingual voices work for all supported languages.
   * Cloned voices: add custom clone IDs here.
   */
  recommendedVoiceIds: string[];
  /** Twilio <Say> voice for fallback (no ElevenLabs) */
  twilioSayVoice: string;
  /** Twilio <Gather> language for fallback */
  twilioGatherLang: string;
}

export interface LanguageGeminiConfig {
  /**
   * Added to the system prompt when this language is active.
   * Tells Gemini to reply in the correct language.
   */
  systemInstruction: string;
  /**
   * Added per-turn when language is detected from caller's speech.
   * Overrides system-level instruction if caller switches language.
   */
  turnInstruction: string;
}

export interface LanguageStrings {
  /** Agent opening greeting — used in agent_speaks_first */
  greeting: (agentName: string) => string;
  /** Reprompt when STT returns empty */
  didNotHear: string;
  /** Closing message */
  goodbye: string;
  /** "Please hold" / "thinking" message */
  thinking: string;
  /** Escalation handover message */
  escalation: string;
  /** Out-of-hours message */
  afterHours: string;
}

export interface LanguageConfig {
  code: SupportedLanguageCode;
  /** English display name */
  name: string;
  /** Native name in that language */
  nativeName: string;
  /** Full BCP-47 code for Twilio gather / browser SpeechRecognition */
  bcp47: string;
  /** Flag emoji */
  flag: string;
  /** Right-to-left script */
  rtl: boolean;
  /** Unicode block ranges for script detection — used by detectLanguage() */
  unicodeRanges?: Array<[number, number]>;
  /** Minimum ratio of detected chars to consider this language (0.0–1.0) */
  detectionThreshold?: number;
  stt: LanguageSTTConfig;
  tts: LanguageTTSConfig;
  gemini: LanguageGeminiConfig;
  strings: LanguageStrings;
}

// ============================================================
// ElevenLabs multilingual voice IDs (work for all supported languages)
// ============================================================

/** Multilingual voices — use with eleven_turbo_v2_5 or eleven_multilingual_v2 */
export const MULTILINGUAL_VOICE_IDS = {
  jessica:  "cgSgspJ2msm6clMCkdW9",  // Female, warm, versatile
  chris:    "iP95p4xoKVk53GoZ742B",  // Male, professional
  matilda:  "XrExE9yKIg1WjnnlVkGX",  // Female, friendly
  daniel:   "onwK4e9ZLuTAKqWW03F9",  // Male, authoritative (British)
  lily:     "pFZP5JQG7iQjIQuC4Bku",  // Female, soft, calm
  callum:   "N2lVS1w4EtoT3dr4eOWO",  // Male, conversational
} as const;

// ============================================================
// Language Registry
// Add new languages by appending entries here.
// ============================================================

export const LANGUAGE_REGISTRY: Record<SupportedLanguageCode, LanguageConfig> = {

  // ── ENGLISH ────────────────────────────────────────────────────────────────
  en: {
    code: "en",
    name: "English",
    nativeName: "English",
    bcp47: "en-US",
    flag: "🇺🇸",
    rtl: false,
    stt: {
      elevenLabsCode: "en",
      autoDetect: false,
      deepgramCode: "en-US",
      twilioSpeechLang: "en-US",
    },
    tts: {
      recommendedModel: "eleven_turbo_v2_5",
      recommendedVoiceIds: [
        "pNInz6obpgDQGcFmaJgB",  // Rachel — female, US
        "ErXwobaYiN019PkySvjV",  // Antoni — male, US
        MULTILINGUAL_VOICE_IDS.jessica,
        MULTILINGUAL_VOICE_IDS.chris,
        "EXAVITQu4vr4xnSDxMaL",  // Bella
        "21m00Tcm4TlvDq8ikWAM",  // Adam
      ],
      twilioSayVoice: "Polly.Matthew",
      twilioGatherLang: "en-US",
    },
    gemini: {
      systemInstruction: `
LANGUAGE: English
Respond ONLY in clear, spoken English.
Keep answers conversational — 2-3 sentences max per turn.
Avoid jargon unless the caller uses it first.`,
      turnInstruction: "Reply in English.",
    },
    strings: {
      greeting: (name) => `Hello! I'm ${name}. How can I help you today?`,
      didNotHear: "I'm sorry, I didn't catch that. Could you please repeat?",
      goodbye: "Thank you for calling. Goodbye!",
      thinking: "One moment please, let me check that for you.",
      escalation: "I'm connecting you with a team member who can help further. Please hold.",
      afterHours: "Thank you for calling. Our team is currently offline. Please call back during business hours.",
    },
  },

  // ── BANGLA / BENGALI ───────────────────────────────────────────────────────
  bn: {
    code: "bn",
    name: "Bengali",
    nativeName: "বাংলা",
    bcp47: "bn-BD",
    flag: "🇧🇩",
    rtl: false,
    // Bengali Unicode block: U+0980–U+09FF
    unicodeRanges: [[0x0980, 0x09FF]],
    detectionThreshold: 0.20, // 20%+ Bengali chars → classify as Bengali
    stt: {
      elevenLabsCode: "bn",   // ElevenLabs Scribe v1 code for Bengali
      autoDetect: false,
      deepgramCode: "bn",
      twilioSpeechLang: "bn-BD",
    },
    tts: {
      // eleven_turbo_v2_5 handles Bangla text → Bangla speech natively
      recommendedModel: "eleven_turbo_v2_5",
      recommendedVoiceIds: [
        MULTILINGUAL_VOICE_IDS.jessica,  // Best multilingual female for Bangla
        MULTILINGUAL_VOICE_IDS.chris,    // Best multilingual male for Bangla
        MULTILINGUAL_VOICE_IDS.matilda,  // Warm female
        MULTILINGUAL_VOICE_IDS.callum,   // Conversational male
      ],
      // Twilio fallback — no native Bangla Polly voice, use Aditi (Hindi, closest)
      twilioSayVoice: "Polly.Aditi",
      twilioGatherLang: "bn-BD",
    },
    gemini: {
      systemInstruction: `
ভাষা: বাংলা (Bengali)
কলার বাংলায় কথা বলছেন — বাংলায় উত্তর দিন।
সহজ, কথ্য বাংলা ব্যবহার করুন — সাহিত্যিক বা আনুষ্ঠানিক নয়।
প্রয়োজনে ইংরেজি শব্দ মিশিয়ে ব্যবহার করতে পারেন (code-mixing স্বাভাবিক)।
প্রতিটি উত্তর সর্বোচ্চ ২-৩ বাক্য — ফোন কলে সংক্ষিপ্ত থাকুন।

LANGUAGE: Bengali/Bangla
The caller is speaking in Bangla (Bengali).
Respond in natural, spoken Bangla.
Code-mixing with English is natural — use English words where Bangla speakers normally would.
Keep responses brief — 2-3 sentences max for phone calls.`,
      turnInstruction: "কলার বাংলায় কথা বলছেন — বাংলায় উত্তর দিন। (Caller switched to Bangla — reply in Bangla.)",
    },
    strings: {
      greeting: (name) => `হ্যালো! আমি ${name}। আপনাকে কীভাবে সাহায্য করতে পারি?`,
      didNotHear: "দুঃখিত, আমি বুঝতে পারিনি। আবার বলুন?",
      goodbye: "ধন্যবাদ কল করার জন্য। আবার কথা হবে!",
      thinking: "একটু অপেক্ষা করুন, আমি দেখছি।",
      escalation: "আমি আপনাকে আমাদের টিমের সাথে সংযুক্ত করছি। একটু অপেক্ষা করুন।",
      afterHours: "ধন্যবাদ কল করার জন্য। আমাদের টিম এখন অফলাইন। ব্যবসার সময়ে পুনরায় কল করুন।",
    },
  },

  // ── HINDI ──────────────────────────────────────────────────────────────────
  hi: {
    code: "hi",
    name: "Hindi",
    nativeName: "हिन्दी",
    bcp47: "hi-IN",
    flag: "🇮🇳",
    rtl: false,
    // Devanagari Unicode block: U+0900–U+097F
    unicodeRanges: [[0x0900, 0x097F]],
    detectionThreshold: 0.20,
    stt: {
      elevenLabsCode: "hi",
      autoDetect: false,
      deepgramCode: "hi",
      twilioSpeechLang: "hi-IN",
    },
    tts: {
      recommendedModel: "eleven_turbo_v2_5",
      recommendedVoiceIds: [
        MULTILINGUAL_VOICE_IDS.jessica,
        MULTILINGUAL_VOICE_IDS.matilda,
        MULTILINGUAL_VOICE_IDS.chris,
      ],
      twilioSayVoice: "Polly.Aditi",
      twilioGatherLang: "hi-IN",
    },
    gemini: {
      systemInstruction: `
भाषा: हिन्दी
कॉलर हिंदी में बात कर रहे हैं — हिंदी में जवाब दें।
सरल, बोलचाल की हिंदी उपयोग करें। जरूरत पड़ने पर अंग्रेजी शब्द मिला सकते हैं।
हर जवाब 2-3 वाक्यों में रखें।

LANGUAGE: Hindi
The caller is speaking in Hindi. Respond in conversational Hindi.`,
      turnInstruction: "Reply in Hindi (हिंदी में जवाब दें).",
    },
    strings: {
      greeting: (name) => `नमस्ते! मैं ${name} हूँ। आज मैं आपकी कैसे मदद कर सकता हूँ?`,
      didNotHear: "माफ़ कीजिए, मैं समझ नहीं पाया। क्या आप फिर से बता सकते हैं?",
      goodbye: "धन्यवाद कॉल करने के लिए। शुभकामनाएं!",
      thinking: "एक पल रुकिए, मैं देख रहा हूँ।",
      escalation: "मैं आपको हमारी टीम से जोड़ रहा हूँ। कृपया रुकें।",
      afterHours: "कॉल करने के लिए धन्यवाद। हमारी टीम अभी उपलब्ध नहीं है। कृपया व्यावसायिक समय में कॉल करें।",
    },
  },

  // ── ARABIC ─────────────────────────────────────────────────────────────────
  ar: {
    code: "ar",
    name: "Arabic",
    nativeName: "العربية",
    bcp47: "ar-SA",
    flag: "🇸🇦",
    rtl: true,
    // Arabic Unicode block: U+0600–U+06FF
    unicodeRanges: [[0x0600, 0x06FF]],
    detectionThreshold: 0.20,
    stt: {
      elevenLabsCode: "ar",
      autoDetect: false,
      deepgramCode: "ar",
      twilioSpeechLang: "ar-SA",
    },
    tts: {
      recommendedModel: "eleven_turbo_v2_5",
      recommendedVoiceIds: [
        MULTILINGUAL_VOICE_IDS.jessica,
        MULTILINGUAL_VOICE_IDS.daniel,
        MULTILINGUAL_VOICE_IDS.chris,
      ],
      twilioSayVoice: "Polly.Zeina",
      twilioGatherLang: "ar-SA",
    },
    gemini: {
      systemInstruction: `
اللغة: العربية
المتصل يتحدث بالعربية — رد بالعربية الفصحى أو العامية المناسبة.
اجعل الإجابات قصيرة — جملتان إلى ثلاث جمل للمكالمات الهاتفية.`,
      turnInstruction: "Reply in Arabic (الرد بالعربية).",
    },
    strings: {
      greeting: (name) => `مرحباً! أنا ${name}. كيف يمكنني مساعدتك اليوم؟`,
      didNotHear: "عذراً، لم أفهم. هل يمكنك الإعادة؟",
      goodbye: "شكراً على اتصالك. إلى اللقاء!",
      thinking: "لحظة من فضلك، أتحقق من ذلك.",
      escalation: "سأوصلك بأحد أعضاء فريقنا. يُرجى الانتظار.",
      afterHours: "شكراً على اتصالك. فريقنا غير متاح حالياً. الرجاء الاتصال خلال ساعات العمل.",
    },
  },

  // ── SPANISH ────────────────────────────────────────────────────────────────
  es: {
    code: "es",
    name: "Spanish",
    nativeName: "Español",
    bcp47: "es-ES",
    flag: "🇪🇸",
    rtl: false,
    stt: {
      elevenLabsCode: "es",
      autoDetect: false,
      deepgramCode: "es",
      twilioSpeechLang: "es-ES",
    },
    tts: {
      recommendedModel: "eleven_turbo_v2_5",
      recommendedVoiceIds: [
        MULTILINGUAL_VOICE_IDS.jessica,
        MULTILINGUAL_VOICE_IDS.matilda,
        MULTILINGUAL_VOICE_IDS.chris,
      ],
      twilioSayVoice: "Polly.Conchita",
      twilioGatherLang: "es-ES",
    },
    gemini: {
      systemInstruction: `
IDIOMA: Español
El caller habla en español — responde en español conversacional.
Mantén las respuestas breves — 2-3 oraciones para llamadas telefónicas.`,
      turnInstruction: "Reply in Spanish (responde en español).",
    },
    strings: {
      greeting: (name) => `¡Hola! Soy ${name}. ¿En qué puedo ayudarte hoy?`,
      didNotHear: "Lo siento, no te escuché bien. ¿Puedes repetirlo?",
      goodbye: "¡Gracias por llamar! ¡Hasta luego!",
      thinking: "Un momento, estoy verificando eso.",
      escalation: "Te voy a conectar con un miembro de nuestro equipo. Por favor espera.",
      afterHours: "Gracias por llamar. Nuestro equipo no está disponible ahora. Por favor llama en horario de atención.",
    },
  },

  // ── FRENCH ─────────────────────────────────────────────────────────────────
  fr: {
    code: "fr",
    name: "French",
    nativeName: "Français",
    bcp47: "fr-FR",
    flag: "🇫🇷",
    rtl: false,
    stt: {
      elevenLabsCode: "fr",
      autoDetect: false,
      deepgramCode: "fr",
      twilioSpeechLang: "fr-FR",
    },
    tts: {
      recommendedModel: "eleven_turbo_v2_5",
      recommendedVoiceIds: [MULTILINGUAL_VOICE_IDS.jessica, MULTILINGUAL_VOICE_IDS.matilda],
      twilioSayVoice: "Polly.Celine",
      twilioGatherLang: "fr-FR",
    },
    gemini: {
      systemInstruction: `
LANGUE: Français
L'appelant parle français — réponds en français conversationnel.
Limite chaque réponse à 2-3 phrases pour les appels téléphoniques.`,
      turnInstruction: "Reply in French (réponds en français).",
    },
    strings: {
      greeting: (name) => `Bonjour ! Je suis ${name}. Comment puis-je vous aider ?`,
      didNotHear: "Je suis désolé, je n'ai pas compris. Pouvez-vous répéter ?",
      goodbye: "Merci d'avoir appelé. Au revoir !",
      thinking: "Un instant s'il vous plaît, je vérifie ça.",
      escalation: "Je vous mets en contact avec un membre de notre équipe. Veuillez patienter.",
      afterHours: "Merci d'avoir appelé. Notre équipe est indisponible. Veuillez rappeler pendant les heures d'ouverture.",
    },
  },

  // ── GERMAN ─────────────────────────────────────────────────────────────────
  de: {
    code: "de",
    name: "German",
    nativeName: "Deutsch",
    bcp47: "de-DE",
    flag: "🇩🇪",
    rtl: false,
    stt: {
      elevenLabsCode: "de",
      autoDetect: false,
      deepgramCode: "de",
      twilioSpeechLang: "de-DE",
    },
    tts: {
      recommendedModel: "eleven_turbo_v2_5",
      recommendedVoiceIds: [MULTILINGUAL_VOICE_IDS.daniel, MULTILINGUAL_VOICE_IDS.jessica],
      twilioSayVoice: "Polly.Marlene",
      twilioGatherLang: "de-DE",
    },
    gemini: {
      systemInstruction: `
SPRACHE: Deutsch
Der Anrufer spricht Deutsch — antworte auf Deutsch.
Halte die Antworten kurz — 2-3 Sätze für Telefonanrufe.`,
      turnInstruction: "Reply in German (antworte auf Deutsch).",
    },
    strings: {
      greeting: (name) => `Hallo! Ich bin ${name}. Wie kann ich Ihnen heute helfen?`,
      didNotHear: "Entschuldigung, ich habe Sie nicht verstanden. Können Sie das wiederholen?",
      goodbye: "Vielen Dank für Ihren Anruf. Auf Wiedersehen!",
      thinking: "Einen Moment bitte, ich schaue das nach.",
      escalation: "Ich verbinde Sie mit einem Teammitglied. Bitte warten Sie.",
      afterHours: "Danke für Ihren Anruf. Unser Team ist derzeit nicht verfügbar. Bitte rufen Sie während der Geschäftszeiten an.",
    },
  },

  // ── PORTUGUESE ─────────────────────────────────────────────────────────────
  pt: {
    code: "pt",
    name: "Portuguese",
    nativeName: "Português",
    bcp47: "pt-BR",
    flag: "🇧🇷",
    rtl: false,
    stt: {
      elevenLabsCode: "pt",
      autoDetect: false,
      deepgramCode: "pt-BR",
      twilioSpeechLang: "pt-BR",
    },
    tts: {
      recommendedModel: "eleven_turbo_v2_5",
      recommendedVoiceIds: [MULTILINGUAL_VOICE_IDS.jessica, MULTILINGUAL_VOICE_IDS.matilda],
      twilioSayVoice: "Polly.Vitoria",
      twilioGatherLang: "pt-BR",
    },
    gemini: {
      systemInstruction: `
IDIOMA: Português
O chamador fala português — responda em português conversacional.
Mantenha as respostas curtas — 2-3 frases para ligações telefônicas.`,
      turnInstruction: "Reply in Portuguese (responda em português).",
    },
    strings: {
      greeting: (name) => `Olá! Eu sou ${name}. Como posso ajudar você hoje?`,
      didNotHear: "Desculpe, não entendi. Pode repetir?",
      goodbye: "Obrigado por ligar. Até logo!",
      thinking: "Um momento, vou verificar isso.",
      escalation: "Vou te conectar com um membro da equipe. Por favor aguarde.",
      afterHours: "Obrigado por ligar. Nossa equipe está indisponível. Por favor ligue durante o horário comercial.",
    },
  },

  // ── CHINESE ────────────────────────────────────────────────────────────────
  zh: {
    code: "zh",
    name: "Chinese",
    nativeName: "中文",
    bcp47: "zh-CN",
    flag: "🇨🇳",
    rtl: false,
    // CJK Unified Ideographs block
    unicodeRanges: [[0x4E00, 0x9FFF], [0x3400, 0x4DBF]],
    detectionThreshold: 0.15,
    stt: {
      elevenLabsCode: "zh",
      autoDetect: false,
      deepgramCode: "zh-CN",
      twilioSpeechLang: "zh-CN",
    },
    tts: {
      recommendedModel: "eleven_turbo_v2_5",
      recommendedVoiceIds: [MULTILINGUAL_VOICE_IDS.jessica, MULTILINGUAL_VOICE_IDS.lily],
      twilioSayVoice: "Polly.Zhiyu",
      twilioGatherLang: "zh-CN",
    },
    gemini: {
      systemInstruction: `
语言：中文
来电者用中文交流，请用简洁的中文回复。
每次回复控制在2-3句话以内。`,
      turnInstruction: "Reply in Chinese (用中文回复).",
    },
    strings: {
      greeting: (name) => `您好！我是${name}。请问有什么可以帮助您的？`,
      didNotHear: "对不起，我没有听清楚。您能再说一遍吗？",
      goodbye: "感谢您的来电。再见！",
      thinking: "请稍等，我来查一下。",
      escalation: "我将为您转接团队成员，请稍候。",
      afterHours: "感谢来电。我们的团队目前不在线，请在工作时间再次拨打。",
    },
  },

  // ── JAPANESE ───────────────────────────────────────────────────────────────
  ja: {
    code: "ja",
    name: "Japanese",
    nativeName: "日本語",
    bcp47: "ja-JP",
    flag: "🇯🇵",
    rtl: false,
    unicodeRanges: [[0x3040, 0x309F], [0x30A0, 0x30FF]],
    detectionThreshold: 0.10,
    stt: {
      elevenLabsCode: "ja",
      autoDetect: false,
      deepgramCode: "ja",
      twilioSpeechLang: "ja-JP",
    },
    tts: {
      recommendedModel: "eleven_turbo_v2_5",
      recommendedVoiceIds: [MULTILINGUAL_VOICE_IDS.jessica, MULTILINGUAL_VOICE_IDS.lily],
      twilioSayVoice: "Polly.Mizuki",
      twilioGatherLang: "ja-JP",
    },
    gemini: {
      systemInstruction: `
言語：日本語
電話の相手は日本語を話しています。自然な日本語で返答してください。
1回の返答は2〜3文以内にしてください。`,
      turnInstruction: "Reply in Japanese (日本語で返答してください).",
    },
    strings: {
      greeting: (name) => `こんにちは！私は${name}です。本日はどのようなご用件でしょうか？`,
      didNotHear: "申し訳ありません、よく聞こえませんでした。もう一度おっしゃっていただけますか？",
      goodbye: "お電話ありがとうございました。失礼いたします！",
      thinking: "少々お待ちください、確認いたします。",
      escalation: "担当者におつなぎいたします。しばらくお待ちください。",
      afterHours: "お電話ありがとうございます。現在対応時間外です。営業時間内にお電話ください。",
    },
  },

  // ── KOREAN ─────────────────────────────────────────────────────────────────
  ko: {
    code: "ko",
    name: "Korean",
    nativeName: "한국어",
    bcp47: "ko-KR",
    flag: "🇰🇷",
    rtl: false,
    unicodeRanges: [[0xAC00, 0xD7AF], [0x1100, 0x11FF]],
    detectionThreshold: 0.10,
    stt: {
      elevenLabsCode: "ko",
      autoDetect: false,
      deepgramCode: "ko",
      twilioSpeechLang: "ko-KR",
    },
    tts: {
      recommendedModel: "eleven_turbo_v2_5",
      recommendedVoiceIds: [MULTILINGUAL_VOICE_IDS.jessica, MULTILINGUAL_VOICE_IDS.lily],
      twilioSayVoice: "Polly.Seoyeon",
      twilioGatherLang: "ko-KR",
    },
    gemini: {
      systemInstruction: `
언어: 한국어
전화 통화 중입니다. 자연스러운 한국어로 답변해 주세요.
각 답변은 2-3문장으로 간결하게 유지해 주세요.`,
      turnInstruction: "Reply in Korean (한국어로 답변해 주세요).",
    },
    strings: {
      greeting: (name) => `안녕하세요! 저는 ${name}입니다. 오늘 어떻게 도와드릴까요?`,
      didNotHear: "죄송합니다, 잘 들리지 않았습니다. 다시 한번 말씀해 주시겠어요?",
      goodbye: "전화해 주셔서 감사합니다. 안녕히 계세요!",
      thinking: "잠시만 기다려 주세요, 확인해 드리겠습니다.",
      escalation: "담당자와 연결해 드리겠습니다. 잠시만 기다려 주세요.",
      afterHours: "전화해 주셔서 감사합니다. 현재 운영 시간이 아닙니다. 업무 시간에 다시 전화해 주세요.",
    },
  },

  // ── URDU ───────────────────────────────────────────────────────────────────
  ur: {
    code: "ur",
    name: "Urdu",
    nativeName: "اردو",
    bcp47: "ur-PK",
    flag: "🇵🇰",
    rtl: true,
    // Arabic/Urdu share Unicode range
    unicodeRanges: [[0x0600, 0x06FF], [0x0750, 0x077F]],
    detectionThreshold: 0.20,
    stt: {
      elevenLabsCode: "ur",
      autoDetect: false,
      deepgramCode: "ur",
      twilioSpeechLang: "ur-PK",
    },
    tts: {
      recommendedModel: "eleven_turbo_v2_5",
      recommendedVoiceIds: [MULTILINGUAL_VOICE_IDS.jessica, MULTILINGUAL_VOICE_IDS.chris],
      twilioSayVoice: "Polly.Aditi",
      twilioGatherLang: "ur-PK",
    },
    gemini: {
      systemInstruction: `
زبان: اردو
کالر اردو میں بات کر رہا ہے — اردو میں جواب دیں۔
ہر جواب 2-3 جملوں میں مختصر رکھیں۔`,
      turnInstruction: "Reply in Urdu (اردو میں جواب دیں).",
    },
    strings: {
      greeting: (name) => `السلام علیکم! میں ${name} ہوں۔ آج میں آپ کی کیسے مدد کر سکتا ہوں؟`,
      didNotHear: "معاف کریں، میں سمجھ نہیں پایا۔ کیا آپ دوبارہ بتا سکتے ہیں؟",
      goodbye: "کال کرنے کا شکریہ۔ اللہ حافظ!",
      thinking: "ایک لمحہ، میں دیکھتا ہوں۔",
      escalation: "میں آپ کو ہماری ٹیم سے ملاتا ہوں۔ براہ کرم انتظار کریں۔",
      afterHours: "کال کرنے کا شکریہ۔ ہماری ٹیم ابھی دستیاب نہیں۔ کاروباری اوقات میں دوبارہ کال کریں۔",
    },
  },

  // ── INDONESIAN ─────────────────────────────────────────────────────────────
  id: {
    code: "id",
    name: "Indonesian",
    nativeName: "Bahasa Indonesia",
    bcp47: "id-ID",
    flag: "🇮🇩",
    rtl: false,
    stt: {
      elevenLabsCode: "id",
      autoDetect: false,
      deepgramCode: "id",
      twilioSpeechLang: "id-ID",
    },
    tts: {
      recommendedModel: "eleven_turbo_v2_5",
      recommendedVoiceIds: [MULTILINGUAL_VOICE_IDS.jessica, MULTILINGUAL_VOICE_IDS.matilda],
      twilioSayVoice: "Polly.Aditi",
      twilioGatherLang: "id-ID",
    },
    gemini: {
      systemInstruction: `
BAHASA: Indonesia
Penelepon berbicara dalam Bahasa Indonesia — balas dalam Bahasa Indonesia yang natural.
Batasi setiap jawaban 2-3 kalimat untuk panggilan telepon.`,
      turnInstruction: "Reply in Indonesian (balas dalam Bahasa Indonesia).",
    },
    strings: {
      greeting: (name) => `Halo! Saya ${name}. Ada yang bisa saya bantu hari ini?`,
      didNotHear: "Maaf, saya tidak mendengar dengan jelas. Bisakah Anda mengulanginya?",
      goodbye: "Terima kasih sudah menghubungi kami. Sampai jumpa!",
      thinking: "Sebentar ya, saya cek dulu.",
      escalation: "Saya akan menghubungkan Anda dengan tim kami. Mohon tunggu sebentar.",
      afterHours: "Terima kasih sudah menelepon. Tim kami sedang tidak tersedia. Silakan hubungi kembali pada jam kerja.",
    },
  },
};

// ============================================================
// Language Detection
// ============================================================

/**
 * Detect the primary language from a text string.
 * Uses Unicode character analysis to identify scripts.
 *
 * Priority order:
 * 1. Bangla (checked first — most relevant for this platform)
 * 2. Arabic / Urdu
 * 3. Chinese / Japanese / Korean
 * 4. Hindi (Devanagari)
 * 5. Default: English
 *
 * @param text - The transcript text to analyze
 * @param hint - Optional hint from agent config (avoids false positives for loanwords)
 * @returns Detected language code
 */
export function detectLanguageFromText(
  text: string,
  hint?: SupportedLanguageCode
): SupportedLanguageCode {
  if (!text.trim()) return hint ?? "en";

  // Normalize: remove spaces and punctuation for ratio calculation
  const chars = Array.from(text.replace(/\s+/g, ""));
  if (chars.length < 3) return hint ?? "en";

  // Check each language with unicodeRanges defined
  const detectionOrder: SupportedLanguageCode[] = [
    "bn", "ar", "zh", "ja", "ko", "hi", "ur", "id"
  ];

  for (const code of detectionOrder) {
    const config = LANGUAGE_REGISTRY[code];
    if (!config.unicodeRanges || !config.detectionThreshold) continue;

    const matchCount = chars.filter((ch) =>
      config.unicodeRanges!.some(([start, end]) => {
        const cp = ch.codePointAt(0) ?? 0;
        return cp >= start && cp <= end;
      })
    ).length;

    const ratio = matchCount / chars.length;
    if (ratio >= config.detectionThreshold) {
      return code;
    }
  }

  // Default to English
  return "en";
}

/**
 * Detect if a text contains mixed Bangla+English (code-switching).
 * Common in Bangladesh — both languages in same utterance.
 */
export function detectCodeSwitching(text: string): {
  isMixed: boolean;
  primaryLanguage: SupportedLanguageCode;
  banglaRatio: number;
  englishRatio: number;
} {
  const chars = Array.from(text.replace(/\s+/g, ""));
  if (chars.length === 0) return { isMixed: false, primaryLanguage: "en", banglaRatio: 0, englishRatio: 0 };

  const banglaRange = LANGUAGE_REGISTRY.bn.unicodeRanges!;
  const bengaliChars = chars.filter((ch) =>
    banglaRange.some(([s, e]) => {
      const cp = ch.codePointAt(0) ?? 0;
      return cp >= s && cp <= e;
    })
  ).length;

  const englishChars = chars.filter((ch) => /[a-zA-Z]/.test(ch)).length;

  const banglaRatio = bengaliChars / chars.length;
  const englishRatio = englishChars / chars.length;
  const isMixed = banglaRatio > 0.05 && englishRatio > 0.05;
  const primaryLanguage: SupportedLanguageCode = banglaRatio > englishRatio ? "bn" : "en";

  return { isMixed, primaryLanguage, banglaRatio, englishRatio };
}

// ============================================================
// Helper accessors
// ============================================================

/**
 * Get the full config for a language code.
 * Falls back to English if code is not in registry.
 */
export function getLanguageConfig(code: string): LanguageConfig {
  const normalized = code?.toLowerCase()?.split("-")[0] as SupportedLanguageCode;
  return LANGUAGE_REGISTRY[normalized] ?? LANGUAGE_REGISTRY.en;
}

/**
 * Get ElevenLabs STT language code for a given language.
 * Returns empty string for auto-detect mode.
 */
export function getElevenLabsSTTCode(langCode: string): string {
  const config = getLanguageConfig(langCode);
  if (config.stt.autoDetect) return "";
  return config.stt.elevenLabsCode;
}

/**
 * Get the recommended ElevenLabs TTS model for a language.
 * Always eleven_turbo_v2_5 for multilingual (handles text-based language detection).
 */
export function getElevenLabsTTSModel(langCode: string): string {
  const config = getLanguageConfig(langCode);
  return config.tts.recommendedModel;
}

/**
 * Get recommended voice IDs for a language.
 */
export function getRecommendedVoicesForLanguage(langCode: string): string[] {
  const config = getLanguageConfig(langCode);
  return config.tts.recommendedVoiceIds;
}

/**
 * Build the Gemini language instruction for a given language.
 * Used to inject into system prompt.
 */
export function buildLanguageInstruction(langCode: string): string {
  const config = getLanguageConfig(langCode);
  return config.gemini.systemInstruction;
}

/**
 * Build a turn-level language override instruction.
 * Used when language is detected mid-conversation.
 */
export function buildTurnLanguageInstruction(detectedLang: string, agentLang: string): string {
  if (detectedLang === agentLang) return "";
  const config = getLanguageConfig(detectedLang);
  return config.gemini.turnInstruction;
}

/**
 * Get localized greeting for agent_speaks_first.
 */
export function getLocalizedGreeting(agentName: string, langCode: string): string {
  const config = getLanguageConfig(langCode);
  return config.strings.greeting(agentName);
}

/**
 * Get Twilio <Say> voice for fallback (no ElevenLabs).
 */
export function getTwilioSayVoice(langCode: string): string {
  const config = getLanguageConfig(langCode);
  return config.tts.twilioSayVoice;
}

/**
 * Get Twilio <Gather> speech language attribute.
 */
export function getTwilioGatherLang(langCode: string): string {
  const config = getLanguageConfig(langCode);
  return config.stt.twilioSpeechLang;
}

/**
 * Get list of all supported languages for UI dropdowns.
 */
export function getSupportedLanguages(): Array<{
  code: SupportedLanguageCode;
  name: string;
  nativeName: string;
  flag: string;
  rtl: boolean;
}> {
  return Object.values(LANGUAGE_REGISTRY).map((c) => ({
    code: c.code,
    name: c.name,
    nativeName: c.nativeName,
    flag: c.flag,
    rtl: c.rtl,
  }));
}

/**
 * Check if ElevenLabs TTS supports a given language.
 * All languages in the registry are supported by eleven_turbo_v2_5.
 */
export function isElevenLabsLanguageSupported(langCode: string): boolean {
  const normalized = langCode?.toLowerCase()?.split("-")[0] as SupportedLanguageCode;
  return normalized in LANGUAGE_REGISTRY;
}
