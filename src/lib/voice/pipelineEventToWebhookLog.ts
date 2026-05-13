import type { ProviderKind, WebhookLogEntry } from "@/store/voicePlatformStore";

/** Row shape from `public.voice_pipeline_events` (browser or server). */
export type VoicePipelineEventRow = {
  id: string;
  call_id: string;
  step: string;
  detail: string | null;
  duration_ms: number | null;
  created_at: string;
};

function pathForStep(step: string): string {
  switch (step) {
    case "GATHER_EMPTY":
    case "GEMINI":
    case "GEMINI_START":
    case "USER_SPEECH":
    case "HANGUP_INTENT":
    case "STT":
    case "INTENT":
    case "CRM_QUERY":
    case "TTS":
    case "RESPONSE_SENT":
    case "HUMAN_TAKEOVER_BLOCK":
    case "HUMAN_TAKEOVER_REQUEST":
      return "/api/webhooks/voice/gather";
    case "STATUS":
      return "/api/webhooks/voice/status";
    case "IVR_DTMF_DIGIT":
      return "/api/webhooks/voice/ivr";
    case "INBOUND":
    case "CALL_RECEIVED":
    case "IVR_DTMF_MENU":
    default:
      return "/api/webhooks/voice/inbound";
  }
}

/**
 * Maps a persisted pipeline row to a webhook-style line for the Settings → Webhooks log.
 * Twilio only hits `/inbound`, `/gather`, `/ivr`, `/status`; internal steps (GEMINI, USER_SPEECH)
 * still appear under the route that handled that phase of the call.
 */
export function pipelineEventRowToWebhookLog(
  row: VoicePipelineEventRow,
  provider: ProviderKind = "twilio_voice"
): Omit<WebhookLogEntry, "id" | "at"> & { id: string; at: string } {
  const path = pathForStep(row.step);
  const preview = {
    CallSid: row.call_id,
    step: row.step,
    detail: (row.detail || "").slice(0, 120),
  };
  return {
    id: `vp-${row.id}`,
    at: row.created_at,
    provider,
    method: "POST",
    path,
    status: 200,
    latencyMs: row.duration_ms ?? 0,
    payloadPreview: JSON.stringify(preview).slice(0, 200),
  };
}
