/** Escape text inside TwiML `<Say>` / attributes. */
export function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Twilio Polly / Say has practical length limits; keep replies short for voice. */
export function truncateForVoice(text: string, max = 450): string {
  const t = text.trim().replace(/\s+/g, " ");
  if (t.length <= max) return t;
  return t.slice(0, max - 3) + "...";
}
