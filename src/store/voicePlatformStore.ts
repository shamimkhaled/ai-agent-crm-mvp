import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ProviderKind = "twilio_voice" | "twilio_whatsapp" | "exotel" | "plivo" | "telnyx";

export type Omnichannel = "phone" | "whatsapp" | "telegram" | "web_widget" | "chat";

export type TelephonyConnectionStatus = "idle" | "testing" | "connected" | "error";

export interface TelephonyProviderState {
  kind: ProviderKind;
  displayName: string;
  enabled: boolean;
  accountSid: string;
  apiKey: string;
  apiSecret: string;
  authToken: string;
  fromNumber: string;
  voiceWebhookUrl: string;
  statusCallbackUrl: string;
  whatsappWebhookUrl: string;
  mediaStreamUrl: string;
  phoneNumbers: { id: string; e164: string; label: string; voiceAgentId: string }[];
  /** Last live / synthetic connection check */
  connectionStatus?: TelephonyConnectionStatus;
  lastTestAt?: string;
  lastTestLatencyMs?: number;
  lastTestMessage?: string;
}

export interface WebhookLogEntry {
  id: string;
  at: string;
  provider: ProviderKind;
  method: string;
  path: string;
  status: number;
  latencyMs: number;
  payloadPreview: string;
}

export interface CallEvent {
  id: string;
  at: string;
  channel: Omnichannel;
  from: string;
  provider: ProviderKind;
  state: "ringing" | "answered" | "ended";
  assignedAgentId: string;
}

export interface WhatsAppInboundEvent {
  id: string;
  at: string;
  from: string;
  bodyPreview: string;
  provider: ProviderKind;
}

export type PersonalityPreset = "professional" | "friendly" | "sales" | "support";

export interface VoiceAgent {
  id: string;
  name: string;
  avatarUrl: string;
  voiceId: string;
  language: "bn" | "en" | "auto";
  personalityPreset: PersonalityPreset;
  personalityPrompt: string;
  systemInstructions: string;
  department: string;
  /** WhatsApp sender / line this agent answers (e.g. whatsapp:+1…) */
  whatsappSender: string;
  /** Primary voice E.164 for display / routing hints */
  primaryPhone: string;
  knowledgeBaseLabels: string[];
  crmConnectorLabels: string[];
  escalationRules: string;
  confidenceThreshold: number;
  active: boolean;
  workflowRole: "support" | "dealer" | "order" | "billing" | "sales";
  businessHoursStart: string;
  businessHoursEnd: string;
  timezone: string;
  fallbackHumanLabel: string;
}

export interface RoutingSettings {
  defaultAgentId: string;
  byPhoneNumber: Record<string, string>;
  byDepartment: Record<string, string>;
  byLanguage: Record<string, string>;
  businessHoursAgentId: string;
  afterHoursAgentId: string;
  fallbackAgentId: string;
  handoverDepartment: string;
  handoverQueue: string;
}

export interface MediaStreamSettings {
  websocketStreamUrl: string;
  realtimeAudioEnabled: boolean;
  sttProvider: "google" | "deepgram" | "assemblyai" | "azure";
  ttsProvider: "elevenlabs" | "google" | "azure" | "cartesia" | "openai";
  voiceName: string;
  languageCode: string;
  bargeInEnabled: boolean;
}

export interface CallHistoryRow {
  id: string;
  startedAt: string;
  endedAt?: string;
  channel: Omnichannel;
  caller: string;
  durationSec: number;
  agentName: string;
  escalation: boolean;
  avgConfidence: number;
  provider: ProviderKind;
}

export interface PipelineLogEntry {
  id: string;
  at: string;
  callId: string;
  step: string;
  detail: string;
  durationMs?: number;
}

export interface EscalationEvent {
  id: string;
  at: string;
  reason: string;
  callId: string;
}

const MAX_LOGS = 200;

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

const defaultProviders = (): TelephonyProviderState[] => [
  {
    kind: "twilio_voice",
    displayName: "Twilio Voice",
    enabled: true,
    accountSid: "",
    apiKey: "",
    apiSecret: "",
    authToken: "",
    fromNumber: "",
    voiceWebhookUrl: "",
    statusCallbackUrl: "",
    whatsappWebhookUrl: "",
    mediaStreamUrl: "wss://api.example.com/voice/stream",
    phoneNumbers: [],
  },
  {
    kind: "twilio_whatsapp",
    displayName: "Twilio WhatsApp",
    enabled: false,
    accountSid: "",
    apiKey: "",
    apiSecret: "",
    authToken: "",
    fromNumber: "",
    voiceWebhookUrl: "",
    statusCallbackUrl: "",
    whatsappWebhookUrl: "",
    mediaStreamUrl: "",
    phoneNumbers: [],
  },
  {
    kind: "exotel",
    displayName: "Exotel",
    enabled: false,
    accountSid: "",
    apiKey: "",
    apiSecret: "",
    authToken: "",
    fromNumber: "",
    voiceWebhookUrl: "",
    statusCallbackUrl: "",
    whatsappWebhookUrl: "",
    mediaStreamUrl: "",
    phoneNumbers: [],
  },
  {
    kind: "plivo",
    displayName: "Plivo",
    enabled: false,
    accountSid: "",
    apiKey: "",
    apiSecret: "",
    authToken: "",
    fromNumber: "",
    voiceWebhookUrl: "",
    statusCallbackUrl: "",
    whatsappWebhookUrl: "",
    mediaStreamUrl: "",
    phoneNumbers: [],
  },
  {
    kind: "telnyx",
    displayName: "Telnyx",
    enabled: false,
    accountSid: "",
    apiKey: "",
    apiSecret: "",
    authToken: "",
    fromNumber: "",
    voiceWebhookUrl: "",
    statusCallbackUrl: "",
    whatsappWebhookUrl: "",
    mediaStreamUrl: "",
    phoneNumbers: [],
  },
];

const DEFAULT_VOICE_AGENT_FIELDS: VoiceAgent = {
  id: "",
  name: "",
  avatarUrl: "",
  voiceId: "multilingual-female-1",
  language: "auto",
  personalityPreset: "support",
  personalityPrompt: "",
  systemInstructions: "",
  department: "",
  whatsappSender: "",
  primaryPhone: "",
  knowledgeBaseLabels: [],
  crmConnectorLabels: [],
  escalationRules: "",
  confidenceThreshold: 60,
  active: true,
  workflowRole: "support",
  businessHoursStart: "09:00",
  businessHoursEnd: "18:00",
  timezone: "Asia/Dhaka",
  fallbackHumanLabel: "",
};

export function mergeVoiceAgent(partial: Partial<VoiceAgent> & { id: string }): VoiceAgent {
  return { ...DEFAULT_VOICE_AGENT_FIELDS, ...partial, id: partial.id };
}

const seedAgents = (): VoiceAgent[] => [
  {
    id: "agent-support-1",
    name: "Customer Support AI",
    avatarUrl: "",
    voiceId: "multilingual-female-1",
    language: "auto",
    personalityPreset: "support",
    personalityPrompt: "Warm, concise, and empathetic.",
    systemInstructions: "You resolve product and service issues using CRM context.",
    department: "Support",
    whatsappSender: "",
    primaryPhone: "",
    knowledgeBaseLabels: ["Policies", "FAQs"],
    crmConnectorLabels: ["HubSpot", "Custom REST"],
    escalationRules: "If confidence < threshold or user requests human, escalate.",
    confidenceThreshold: 62,
    active: true,
    workflowRole: "support",
    businessHoursStart: "09:00",
    businessHoursEnd: "18:00",
    timezone: "Asia/Dhaka",
    fallbackHumanLabel: "Support L2 — Rahim",
  },
  {
    id: "agent-dealer-1",
    name: "Dealer Desk AI",
    avatarUrl: "",
    voiceId: "bengali-male-1",
    language: "bn",
    personalityPreset: "professional",
    personalityPrompt: "Professional distributor partner tone.",
    systemInstructions: "Assist dealers with stock, credit limits, and territory rules.",
    department: "Dealer Success",
    whatsappSender: "",
    primaryPhone: "",
    knowledgeBaseLabels: ["Dealer Playbook"],
    crmConnectorLabels: ["Odoo ERP", "SQL Database"],
    escalationRules: "Billing disputes route to billing agent.",
    confidenceThreshold: 58,
    active: true,
    workflowRole: "dealer",
    businessHoursStart: "08:00",
    businessHoursEnd: "20:00",
    timezone: "Asia/Dhaka",
    fallbackHumanLabel: "Dealer Manager — Karim",
  },
];

const seedHistory = (): CallHistoryRow[] => [
  {
    id: "ch-1",
    startedAt: new Date(Date.now() - 3600_000).toISOString(),
    endedAt: new Date(Date.now() - 3500_000).toISOString(),
    channel: "phone",
    caller: "+8801700000000",
    durationSec: 184,
    agentName: "Customer Support AI",
    escalation: false,
    avgConfidence: 88,
    provider: "twilio_voice",
  },
  {
    id: "ch-2",
    startedAt: new Date(Date.now() - 7200_000).toISOString(),
    channel: "whatsapp",
    caller: "+8801911111111",
    durationSec: 0,
    agentName: "Dealer Desk AI",
    escalation: true,
    avgConfidence: 44,
    provider: "twilio_whatsapp",
  },
];

interface VoicePlatformState {
  providers: TelephonyProviderState[];
  webhookLogs: WebhookLogEntry[];
  callEvents: CallEvent[];
  whatsappEvents: WhatsAppInboundEvent[];
  agents: VoiceAgent[];
  routing: RoutingSettings;
  media: MediaStreamSettings;
  callHistory: CallHistoryRow[];
  pipelineLogs: PipelineLogEntry[];
  escalations: EscalationEvent[];
  geminiApiKeyLocal: string;

  setProviderField: (kind: ProviderKind, patch: Partial<TelephonyProviderState>) => void;
  recordTelephonyTest: (
    kind: ProviderKind,
    result: { ok: boolean; latencyMs: number; message: string }
  ) => void;
  toggleProvider: (kind: ProviderKind, enabled: boolean) => void;
  addPhoneNumber: (kind: ProviderKind, e164: string, label: string, voiceAgentId: string) => void;
  removePhoneNumber: (kind: ProviderKind, id: string) => void;
  updatePhoneAgent: (kind: ProviderKind, id: string, voiceAgentId: string) => void;

  appendWebhookLog: (entry: Omit<WebhookLogEntry, "id" | "at"> & Partial<Pick<WebhookLogEntry, "id" | "at">>) => void;
  pushCallEvent: (ev: Omit<CallEvent, "id" | "at">) => void;
  pushWhatsAppEvent: (ev: Omit<WhatsAppInboundEvent, "id" | "at">) => void;
  pushPipelineLog: (entry: Omit<PipelineLogEntry, "id" | "at">) => void;
  pushEscalation: (entry: Omit<EscalationEvent, "id" | "at">) => void;

  upsertAgent: (agent: VoiceAgent) => void;
  removeAgent: (id: string) => void;

  setRouting: (patch: Partial<RoutingSettings>) => void;
  setMedia: (patch: Partial<MediaStreamSettings>) => void;
  setGeminiApiKeyLocal: (key: string) => void;

  recordCallHistory: (row: CallHistoryRow) => void;
  clearWebhookLogs: () => void;
}

function trimLogs<T extends { id: string }>(arr: T[]): T[] {
  if (arr.length <= MAX_LOGS) return arr;
  return arr.slice(arr.length - MAX_LOGS);
}

export const useVoicePlatformStore = create<VoicePlatformState>()(
  persist(
    (set, get) => ({
      providers: defaultProviders(),
      webhookLogs: [],
      callEvents: [],
      whatsappEvents: [],
      agents: seedAgents(),
      routing: {
        defaultAgentId: "agent-support-1",
        byPhoneNumber: { "+8801700000000": "agent-dealer-1" },
        byDepartment: { Support: "agent-support-1", "Dealer Success": "agent-dealer-1" },
        byLanguage: { en: "agent-support-1", bn: "agent-dealer-1", auto: "agent-support-1" },
        businessHoursAgentId: "agent-support-1",
        afterHoursAgentId: "agent-dealer-1",
        fallbackAgentId: "agent-support-1",
        handoverDepartment: "Support L2",
        handoverQueue: "voice-escalations",
      },
      media: {
        websocketStreamUrl: "wss://your-app.com/api/voice/media",
        realtimeAudioEnabled: true,
        sttProvider: "google",
        ttsProvider: "google",
        voiceName: "Zephyr",
        languageCode: "en-BD",
        bargeInEnabled: true,
      },
      callHistory: seedHistory(),
      pipelineLogs: [],
      escalations: [],
      geminiApiKeyLocal: "",

      setProviderField: (kind, patch) =>
        set({
          providers: get().providers.map((p) => (p.kind === kind ? { ...p, ...patch } : p)),
        }),

      recordTelephonyTest: (kind, result) =>
        set({
          providers: get().providers.map((p) =>
            p.kind === kind
              ? {
                  ...p,
                  connectionStatus: result.ok ? "connected" : "error",
                  lastTestAt: new Date().toISOString(),
                  lastTestLatencyMs: result.latencyMs,
                  lastTestMessage: result.message,
                }
              : p
          ),
        }),

      toggleProvider: (kind, enabled) =>
        set({
          providers: get().providers.map((p) => (p.kind === kind ? { ...p, enabled } : p)),
        }),

      addPhoneNumber: (kind, e164, label, voiceAgentId) =>
        set({
          providers: get().providers.map((p) =>
            p.kind === kind
              ? {
                  ...p,
                  phoneNumbers: [
                    ...p.phoneNumbers,
                    { id: uid(), e164, label, voiceAgentId },
                  ],
                }
              : p
          ),
        }),

      removePhoneNumber: (kind, id) =>
        set({
          providers: get().providers.map((p) =>
            p.kind === kind
              ? { ...p, phoneNumbers: p.phoneNumbers.filter((n) => n.id !== id) }
              : p
          ),
        }),

      updatePhoneAgent: (kind, id, voiceAgentId) =>
        set({
          providers: get().providers.map((p) =>
            p.kind === kind
              ? {
                  ...p,
                  phoneNumbers: p.phoneNumbers.map((n) =>
                    n.id === id ? { ...n, voiceAgentId } : n
                  ),
                }
              : p
          ),
        }),

      appendWebhookLog: (entry) => {
        const id = entry.id ?? uid();
        const existing = get().webhookLogs;
        const logs = Array.isArray(existing) ? existing : [];
        if (logs.some((l) => l.id === id)) return;
        const row: WebhookLogEntry = {
          id,
          at: entry.at ?? new Date().toISOString(),
          provider: entry.provider,
          method: entry.method,
          path: entry.path,
          status: entry.status,
          latencyMs: entry.latencyMs,
          payloadPreview: entry.payloadPreview,
        };
        set({ webhookLogs: trimLogs([...logs, row]) });
      },

      pushCallEvent: (ev) => {
        const row: CallEvent = {
          id: uid(),
          at: new Date().toISOString(),
          ...ev,
        };
        set({ callEvents: trimLogs([...get().callEvents, row]) });
      },

      pushWhatsAppEvent: (ev) => {
        const row: WhatsAppInboundEvent = {
          id: uid(),
          at: new Date().toISOString(),
          ...ev,
        };
        set({ whatsappEvents: trimLogs([...get().whatsappEvents, row]) });
      },

      pushPipelineLog: (entry) => {
        const row: PipelineLogEntry = {
          id: uid(),
          at: new Date().toISOString(),
          ...entry,
        };
        set({ pipelineLogs: trimLogs([...get().pipelineLogs, row]) });
      },

      pushEscalation: (entry) => {
        const row: EscalationEvent = {
          id: uid(),
          at: new Date().toISOString(),
          ...entry,
        };
        set({ escalations: trimLogs([...get().escalations, row]) });
      },

      upsertAgent: (agent) =>
        set({
          agents: (() => {
            const merged = mergeVoiceAgent(agent);
            const list = get().agents;
            const i = list.findIndex((a) => a.id === merged.id);
            if (i === -1) return [...list, merged];
            const next = [...list];
            next[i] = merged;
            return next;
          })(),
        }),

      removeAgent: (id) =>
        set({
          agents: get().agents.filter((a) => a.id !== id),
        }),

      setRouting: (patch) => set({ routing: { ...get().routing, ...patch } }),

      setMedia: (patch) => set({ media: { ...get().media, ...patch } }),

      setGeminiApiKeyLocal: (key) => set({ geminiApiKeyLocal: key }),

      recordCallHistory: (row) =>
        set({ callHistory: trimLogs([...get().callHistory, row]) }),

      clearWebhookLogs: () => set({ webhookLogs: [] }),
    }),
    { name: "voice-platform-mvp" }
  )
);
