import type { ProviderKind } from "@/store/voicePlatformStore";

/** UI selector for the single telephony form (voice trunk). WhatsApp stays on /settings/whatsapp. */
export type UnifiedTelephonyId = "twilio" | "exotel" | "plivo" | "telnyx";

export const UNIFIED_TELEPHONY_OPTIONS: {
  id: UnifiedTelephonyId;
  label: string;
  blurb: string;
  storeKind: ProviderKind;
}[] = [
  {
    id: "twilio",
    label: "Twilio",
    blurb: "Voice, SMS, WhatsApp Business API — largest ecosystem.",
    storeKind: "twilio_voice",
  },
  {
    id: "exotel",
    label: "Exotel",
    blurb: "India / APAC cloud telephony — great for local numbers.",
    storeKind: "exotel",
  },
  {
    id: "plivo",
    label: "Plivo",
    blurb: "Global voice & SMS with simple REST APIs.",
    storeKind: "plivo",
  },
  {
    id: "telnyx",
    label: "Telnyx",
    blurb: "Carrier-grade APIs, programmable voice & messaging.",
    storeKind: "telnyx",
  },
];

export function storeKindFromUnified(id: UnifiedTelephonyId): ProviderKind {
  return UNIFIED_TELEPHONY_OPTIONS.find((o) => o.id === id)!.storeKind;
}

export function unifiedIdFromStoreKind(kind: ProviderKind): UnifiedTelephonyId | null {
  const row = UNIFIED_TELEPHONY_OPTIONS.find((o) => o.storeKind === kind);
  return row?.id ?? null;
}
