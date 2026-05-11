export const VOICE_PIPELINE_STEPS = [
  "Incoming Call",
  "Provider Webhook",
  "AI Agent",
  "STT",
  "Intent Detection",
  "CRM / ERP",
  "Gemini",
  "TTS",
  "Reply to Caller",
] as const;

export type VoicePipelineStepIndex = number;

export const VOICE_PIPELINE_LAST = VOICE_PIPELINE_STEPS.length - 1;
