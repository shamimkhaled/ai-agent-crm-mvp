/** Lightweight intent + confidence for voice dashboard (MVP; replace with model later). */
export function inferVoiceIntentAndConfidence(speech: string): {
  intent: string;
  confidence: number;
  escalation: boolean;
} {
  const s = speech.toLowerCase();
  let intent = "General";
  let confidence = 82;
  let escalation = false;

  if (/অর্ডার|order|শিপ|delivery|ট্র্যাক/i.test(speech)) {
    intent = "Order / delivery";
    confidence = 88;
  }
  if (/অভিযোগ|complaint|refund|চার্জব্যাক|problem|issue|help|সাহায্য/i.test(speech)) {
    intent = "Support / complaint";
    confidence = Math.min(confidence, 68);
    escalation = confidence < 72;
  }
  if (/human|agent|মানুষ|কাস্টমার কেয়ার|representative|manager/i.test(speech)) {
    intent = "Human handover request";
    confidence = 55;
    escalation = true;
  }
  if (/payment|pay|টাকা|বিল|invoice|due/i.test(speech)) {
    intent = "Billing";
    confidence = 80;
  }

  return { intent, confidence: Math.max(40, Math.min(99, confidence)), escalation };
}

export function guessDealerHint(fromE164: string): string | null {
  const d = fromE164.replace(/\D/g, "");
  if (d.endsWith("1212") || d.includes("17000000000")) return "1212";
  if (d.endsWith("3340")) return "3340";
  return null;
}

export function displayNameForCaller(fromE164: string): string {
  const dealer = guessDealerHint(fromE164);
  if (dealer) return `Dealer ${dealer}`;
  return "Customer";
}
