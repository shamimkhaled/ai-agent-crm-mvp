/** Curated TTS / voice profiles for the MVP UI (maps to your media pipeline voice names). */
export const VOICE_OPTIONS = [
  { id: "multilingual-female-1", label: "Multilingual — female (balanced)" },
  { id: "multilingual-male-1", label: "Multilingual — male (balanced)" },
  { id: "bengali-female-1", label: "Bangla — female (clear)" },
  { id: "bengali-male-1", label: "Bangla — male (professional)" },
  { id: "english-female-1", label: "English — female (neutral)" },
  { id: "english-male-1", label: "English — male (neutral)" },
  { id: "zephyr-warm", label: "Warm assistant (Google-style)" },
  { id: "custom", label: "Custom voice ID…" },
] as const;

export const FIELD_REFERENCE: { setting: string; options: string; description: string }[] = [
  {
    setting: "Agent name",
    options: "Text",
    description: "Unique display name for routing, CRM sync, and reporting.",
  },
  {
    setting: "Agent avatar",
    options: "Image URL",
    description: "Optional profile image shown in console and future agent widgets.",
  },
  {
    setting: "Voice selection",
    options: "Preset or custom ID",
    description: "Maps to your TTS provider; use Test voice for a quick browser preview.",
  },
  {
    setting: "Language",
    options: "Bangla / English / Auto",
    description: "Primary language bias for STT/TTS and prompt routing.",
  },
  {
    setting: "Personality",
    options: "Professional, Friendly, Sales, Support",
    description: "Shaping snippet merged into the system stack with your notes.",
  },
  {
    setting: "Gemini prompt / system instruction",
    options: "Long text",
    description: "Core behavior, tools, brand rules, and CRM usage instructions.",
  },
  {
    setting: "Knowledge base selection",
    options: "Comma-separated labels",
    description: "Logical tags that link to internal docs or vector stores in production.",
  },
  {
    setting: "CRM / ERP access",
    options: "Comma-separated labels",
    description: "Which connectors (HubSpot, Odoo, REST, …) this agent may reference.",
  },
  {
    setting: "Escalation rules",
    options: "Free text",
    description: "When to transfer, to which queue, and mandatory handoff phrases.",
  },
  {
    setting: "Confidence threshold",
    options: "30–95%",
    description: "Minimum model confidence before answering or offering escalation.",
  },
  {
    setting: "Active hours",
    options: "Start / end + timezone",
    description: "Operational window; pair with routing after-hours agents.",
  },
  {
    setting: "Fallback human agent",
    options: "Label",
    description: "Queue or person name shown to supervisors on escalation.",
  },
];
