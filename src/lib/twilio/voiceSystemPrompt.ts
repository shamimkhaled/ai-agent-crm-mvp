/** Shared system stack for phone Gather → Gemini (keep in sync with `/api/chat` tone). */
export function buildVoiceInboundSystemPrompt(
  crmContext?: string,
  ivrLanguage?: "en" | "bn"
): string {
  const base = `You are a helpful AI CRM voice assistant for a business in Bangladesh (e.g. garments, ISP, distributor).
You are on a live phone call. Reply in short, speakable sentences (avoid bullet lists and markdown).
Mix Bangla and English naturally when helpful.
If you lack data, say you will note it and a human can follow up — do not invent order or payment facts.`;

  const ivr =
    ivrLanguage === "bn"
      ? "\nThe caller selected **Bangla** in the phone menu — prefer বাংলা unless they clearly switch to English."
      : ivrLanguage === "en"
        ? "\nThe caller selected **English** in the phone menu — prefer clear English."
        : "";

  let body = base + ivr;
  if (crmContext?.trim()) {
    body += `

--- CRM / product context (may be empty) ---
${crmContext.trim()}`;
  }
  return body;
}
