"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import {
  getVoicesForLanguage,
  getDefaultVoiceForLanguage,
  getModelsForLanguage,
  validateVoiceModelLanguage,
  MULTILINGUAL_VOICES,
  type VoiceOption,
} from "@/lib/elevenlabs/voices";
import { getSupportedLanguages } from "@/lib/elevenlabs/multilingual";
import {
  Bot, Plus, Mic, MicOff, Send, Trash2, Settings, Globe, Zap,
  ChevronRight, Link as LinkIcon, Unlink, RefreshCw, Volume2,
  FileText, Upload, X, Loader2, PhoneCall, Database, BookOpen,
  Sparkles, Play, Square, Activity, Clock, MessageSquare,
  Wand2, ChevronDown, CheckCircle2, AlertTriangle, VolumeX,
  Radio, Shield, LayoutTemplate, Brain, Headphones, Phone,
  PhoneOff, PhoneMissed, PhoneIncoming, User,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface Agent {
  id: string;
  name: string;
  department: string;
  model_provider: string;
  model_id: string;
  voice_model: string;
  voice_provider: string;
  voice_id: string | null;
  voice_speed: number;
  voice_temperature: number;
  transcriber: string;
  language: string;
  tts_voice: string;
  system_prompt: string | null;
  persona_prompt: string | null;
  first_message: string | null;
  agent_speaks_first: boolean;
  status: "active" | "inactive";
  template_id: string | null;
  connector_ids: string[];
  kb_document_ids: string[];
  escalation_enabled: boolean;
  confidence_threshold: number;
  max_turns: number;
  created_at: string;
  updated_at: string;
}

interface Connector {
  id: string;
  connector_name: string;
  connector_type: string;
  base_url: string;
  status: string;
}

interface KbDocument {
  id: string;
  title: string;
  mime_type: string;
  status: string;
  created_at: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "agent";
  text: string;
  latencyMs?: number;
  timestamp: Date;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const TABS = ["Model", "Voice", "Knowledge", "Testing", "Advanced"] as const;
type Tab = (typeof TABS)[number];

const MODEL_PROVIDERS = [
  { value: "gemini",  label: "Google Gemini",  icon: "✦" },
  { value: "openai",  label: "OpenAI",         icon: "⬡" },
  { value: "claude",  label: "Anthropic Claude",icon: "◈" },
  { value: "groq",    label: "Groq (Fast)",    icon: "⚡" },
];

const GEMINI_MODELS   = ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash", "gemini-1.5-pro"];
const OPENAI_MODELS   = ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"];
const CLAUDE_MODELS   = ["claude-3-5-sonnet-20241022", "claude-3-5-haiku-20241022", "claude-3-opus-20240229"];
const GROQ_MODELS     = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768"];

const VOICE_PROVIDERS = [
  { value: "browser",     label: "Browser TTS (Free)" },
  { value: "elevenlabs",  label: "ElevenLabs" },
  { value: "deepgram",    label: "Deepgram Aura" },
  { value: "openai_tts",  label: "OpenAI TTS" },
  { value: "amazon_polly",label: "Amazon Polly" },
];

// ElevenLabs voices are loaded dynamically via getVoicesForLanguage(lang) — see voicesForProvider()
const DEEPGRAM_VOICES = [
  { value: "asteria-en", label: "Asteria (English, Female)" },
  { value: "orion-en",   label: "Orion (English, Male)" },
  { value: "luna-en",    label: "Luna (English, Female)" },
  { value: "arcas-en",   label: "Arcas (English, Male)" },
];
const OPENAI_TTS_VOICES = [
  { value: "alloy",   label: "Alloy (Neutral)" },
  { value: "echo",    label: "Echo (Male)" },
  { value: "fable",   label: "Fable (British)" },
  { value: "onyx",    label: "Onyx (Deep Male)" },
  { value: "nova",    label: "Nova (Female)" },
  { value: "shimmer", label: "Shimmer (Soft Female)" },
];

const TRANSCRIBERS = [
  { value: "elevenlabs_scribe", label: "ElevenLabs Scribe v1 (99 langs · Bangla ✓)" },
  { value: "deepgram",          label: "Deepgram Nova-2" },
  { value: "gemini_multimodal", label: "Gemini Multimodal" },
  { value: "whisper",           label: "OpenAI Whisper" },
  { value: "browser",           label: "Browser SpeechRecognition (Free)" },
];

// Populated from the multilingual registry — add new languages to multilingual.ts only
const LANGUAGES = getSupportedLanguages().map((l) => ({
  value: l.code,
  label: `${l.flag} ${l.name}${l.nativeName !== l.name ? ` (${l.nativeName})` : ""}`,
}));

const TEMPLATES = [
  {
    id: "blank",
    name: "Blank Template",
    icon: "○",
    description: "Start from scratch with full control",
    systemPrompt: "",
    firstMessage: "",
    department: "General",
  },
  {
    id: "customer_support",
    name: "Customer Support",
    icon: "🎧",
    description: "Handles customer inquiries, orders, and escalations",
    department: "Support",
    firstMessage: "Hello! I'm here to help you today. How can I assist you?",
    systemPrompt: `You are a professional customer support agent. Your goals:
- Listen carefully to customer concerns and validate their feelings
- Provide accurate, helpful information about products and services
- Escalate to human agents when needed
- Keep responses concise and friendly
- Always confirm understanding before ending the conversation`,
  },
  {
    id: "sales",
    name: "Sales Agent",
    icon: "💼",
    description: "Qualifies leads and drives product adoption",
    department: "Sales",
    firstMessage: "Hi! I'm your sales assistant. I'm here to help find the right solution for you. What are you looking for today?",
    systemPrompt: `You are a consultative sales agent. Your goals:
- Understand the prospect's needs and pain points
- Present relevant product benefits (not just features)
- Handle objections with empathy and evidence
- Guide toward a decision without being pushy
- Qualify leads by asking smart discovery questions`,
  },
  {
    id: "appointment",
    name: "Appointment Booking",
    icon: "📅",
    description: "Schedules appointments and manages calendars",
    department: "Operations",
    firstMessage: "Hello! I can help you schedule an appointment. When would you like to come in?",
    systemPrompt: `You are an appointment scheduling assistant. Your goals:
- Collect caller's preferred date and time
- Confirm availability and book the appointment
- Collect contact details (name, phone, email)
- Send confirmation and remind about preparation
- Handle rescheduling or cancellation requests politely`,
  },
  {
    id: "order_tracking",
    name: "Order Tracking",
    icon: "📦",
    description: "Handles order status, delivery updates, and returns",
    department: "Logistics",
    firstMessage: "Hello! I can help you track your order or assist with delivery questions. What's your order number?",
    systemPrompt: `You are an order management assistant. Your goals:
- Look up order status using the customer's order number
- Provide accurate delivery estimates and tracking info
- Handle return and refund requests
- Escalate complex logistics issues to human agents
- Always verify customer identity before sharing order details`,
  },
];

const PROMPT_STARTERS = [
  "You are {name}, a professional AI voice assistant for {company}...",
  "Act as an expert {role} with 10+ years of experience in {domain}...",
  "You are a helpful, empathetic customer service agent named {name}...",
  "You represent {company}'s support team. Your job is to...",
];

// ─────────────────────────────────────────────────────────────────────────────
// Waveform component
// ─────────────────────────────────────────────────────────────────────────────
function Waveform({ active, color = "cyan" }: { active: boolean; color?: "cyan" | "violet" | "amber" }) {
  const bars = Array.from({ length: 24 });
  const colorMap = {
    cyan:   "bg-[hsl(var(--cyan))]",
    violet: "bg-[hsl(var(--violet))]",
    amber:  "bg-[hsl(var(--amber))]",
  };
  return (
    <div className="flex items-center gap-[2px] h-8">
      {bars.map((_, i) => (
        <motion.div
          key={i}
          className={cn("w-[3px] rounded-full", colorMap[color])}
          animate={active
            ? { height: [4, Math.random() * 20 + 4, 4], opacity: [0.4, 1, 0.4] }
            : { height: 4, opacity: 0.2 }
          }
          transition={{
            duration: active ? 0.4 + Math.random() * 0.4 : 0.2,
            repeat: Infinity,
            delay: i * 0.05,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Agent card (left panel)
// ─────────────────────────────────────────────────────────────────────────────
function AgentCard({
  agent,
  selected,
  onClick,
}: { agent: Agent; selected: boolean; onClick: () => void }) {
  return (
    <motion.button
      layout
      onClick={onClick}
      className={cn(
        "w-full text-left p-3 rounded-xl border transition-all duration-200 group",
        selected
          ? "bg-[hsl(var(--cyan)/0.08)] border-[hsl(var(--cyan)/0.35)] shadow-[0_0_0_1px_hsl(var(--cyan)/0.2)]"
          : "bg-[hsl(var(--surface-1))] border-[hsl(var(--border))] hover:border-[hsl(var(--cyan)/0.2)] hover:bg-[hsl(var(--surface-2))]"
      )}
    >
      <div className="flex items-start gap-2.5">
        <div className={cn(
          "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5",
          agent.status === "active"
            ? "bg-[hsl(var(--cyan)/0.12)] text-[hsl(var(--cyan))]"
            : "bg-[hsl(var(--muted))] text-muted-foreground"
        )}>
          <Bot size={15} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className={cn(
              "text-sm font-semibold truncate",
              selected ? "text-[hsl(var(--cyan))]" : "text-foreground group-hover:text-[hsl(var(--cyan))]"
            )}>
              {agent.name}
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-[10px] text-muted-foreground">{agent.department}</span>
            <span className="text-[10px] text-muted-foreground/50">·</span>
            <span className="text-[10px] text-muted-foreground">{agent.language?.toUpperCase()}</span>
          </div>
          <div className="flex items-center gap-1.5 mt-1.5">
            <Badge className={cn(
              "text-[9px] px-1.5 py-0 border",
              agent.status === "active"
                ? "bg-[hsl(var(--emerald)/0.1)] text-[hsl(var(--emerald))] border-[hsl(var(--emerald)/0.3)]"
                : "bg-[hsl(var(--muted))] text-muted-foreground border-transparent"
            )}>
              {agent.status === "active" ? "● Live" : "○ Off"}
            </Badge>
            <span className="text-[10px] text-muted-foreground">
              {agent.model_provider ?? "gemini"}
            </span>
          </div>
        </div>
        {selected && (
          <ChevronRight size={14} className="text-[hsl(var(--cyan))] shrink-0 mt-1" />
        )}
      </div>
    </motion.button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Template selector modal
// ─────────────────────────────────────────────────────────────────────────────
function TemplateModal({
  open,
  onSelect,
  onClose,
}: {
  open: boolean;
  onSelect: (t: (typeof TEMPLATES)[number]) => void;
  onClose: () => void;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl mx-4 bg-[hsl(var(--surface-1))] border border-[hsl(var(--border))] rounded-2xl overflow-hidden shadow-2xl"
          >
            <div className="flex items-center justify-between p-5 border-b border-[hsl(var(--border))]">
              <div>
                <h2 className="text-lg font-bold" style={{ fontFamily: "Syne, sans-serif" }}>
                  Choose a Template
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Start with a pre-built template or build from scratch
                </p>
              </div>
              <Button variant="ghost" size="icon" onClick={onClose}>
                <X size={16} />
              </Button>
            </div>
            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => onSelect(t)}
                  className="text-left p-4 rounded-xl border border-[hsl(var(--border))] hover:border-[hsl(var(--cyan)/0.35)] hover:bg-[hsl(var(--cyan)/0.05)] transition-all group"
                >
                  <div className="text-2xl mb-2">{t.icon}</div>
                  <div className="text-sm font-semibold text-foreground group-hover:text-[hsl(var(--cyan))] transition-colors">
                    {t.name}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">{t.description}</div>
                </button>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────
export default function AgentsPage() {
  const { toast } = useToast();
  const supabase = createClient();

  // ── Data state ──────────────────────────────────────────────────────────────
  const [agents, setAgents]         = useState<Agent[]>([]);
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [kbDocs, setKbDocs]         = useState<KbDocument[]>([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState("");

  // ── Selected agent state ────────────────────────────────────────────────────
  const [selectedId, setSelectedId]   = useState<string | null>(null);
  const [editDraft, setEditDraft]     = useState<Partial<Agent>>({});
  const [saving, setSaving]           = useState(false);
  const [activeTab, setActiveTab]     = useState<Tab>("Model");

  // ── UI state ────────────────────────────────────────────────────────────────
  const [showTemplates, setShowTemplates] = useState(false);
  const [creating, setCreating]           = useState(false);
  const [deleting, setDeleting]           = useState(false);

  // ── Prompt generation state ─────────────────────────────────────────────────
  const [generatingPrompt, setGeneratingPrompt]     = useState(false);
  const [generatingMessages, setGeneratingMessages] = useState(false);
  const [generatedPrompt, setGeneratedPrompt]       = useState<string | null>(null);
  const [firstMessageOptions, setFirstMessageOptions] = useState<string[]>([]);
  const [showPromptPreview, setShowPromptPreview]   = useState(false);

  // ── Voice testing state ─────────────────────────────────────────────────────
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput]       = useState("");
  const [chatSending, setChatSending]   = useState(false);
  const [isListening, setIsListening]   = useState(false);
  const [isSpeaking, setIsSpeaking]     = useState(false);
  const [avgLatency, setAvgLatency]     = useState<number | null>(null);
  const [testSessionActive, setTestSessionActive] = useState(false);
  const [micError, setMicError]         = useState<string | null>(null);
  const chatEndRef     = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const synthRef       = useRef<SpeechSynthesisUtterance | null>(null);
  const latencySamples = useRef<number[]>([]);
  // Holds the current ElevenLabs <audio> element so we can stop it on demand
  const elevenLabsAudioRef = useRef<HTMLAudioElement | null>(null);

  // ── KB upload state ─────────────────────────────────────────────────────────
  const [uploading, setUploading]   = useState(false);
  const [kbSearch, setKbSearch]     = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Tracks whether the user has unsaved edits — prevents realtime refreshes from
  // overwriting the draft while the user is mid-edit.
  const [isDirty, setIsDirty] = useState(false);

  // Used to distinguish "user switched to a different agent" from
  // "same agent object refreshed by Supabase realtime".
  const prevSelectedIdRef = useRef<string | null>(null);

  // ── Outbound call state ──────────────────────────────────────────────────────
  type TestMode = "browser" | "realcall";
  type OutboundStatus = "idle" | "initiating" | "ringing" | "in-progress" | "completed" | "failed" | "busy" | "no-answer" | "canceled";

  const [testMode, setTestMode]                   = useState<TestMode>("browser");
  const [outboundPhone, setOutboundPhone]         = useState("");
  const [outboundCallSid, setOutboundCallSid]     = useState<string | null>(null);
  const [outboundStatus, setOutboundStatus]       = useState<OutboundStatus>("idle");
  const [outboundAgentName, setOutboundAgentName] = useState("");
  const [outboundError, setOutboundError]         = useState<string | null>(null);
  const [outboundErrorHint, setOutboundErrorHint] = useState<string | null>(null);
  const [outboundElapsed, setOutboundElapsed]     = useState(0);
  const [outboundTranscript, setOutboundTranscript] = useState<Array<{role: string; text: string; ts: number}>>([]);
  const outboundTimerRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const outboundRealtimeRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const outboundTranscriptEndRef = useRef<HTMLDivElement>(null);

  // ─────────────────────────────────────────────────────────────────────────────
  // Data fetching
  // ─────────────────────────────────────────────────────────────────────────────
  const fetchAgents = useCallback(async () => {
    const r = await fetch("/api/agents");
    if (!r.ok) return;
    const j = await r.json() as { agents: Agent[] };
    setAgents(j.agents ?? []);
  }, []);

  const fetchConnectors = useCallback(async () => {
    const r = await fetch("/api/connectors");
    if (!r.ok) return;
    const j = await r.json() as { connectors?: Connector[] };
    setConnectors(j.connectors ?? []);
  }, []);

  const fetchKbDocs = useCallback(async () => {
    const { data } = await supabase
      .from("kb_documents")
      .select("id, title, mime_type, status, created_at")
      .order("created_at", { ascending: false });
    setKbDocs((data ?? []) as KbDocument[]);
  }, [supabase]);

  useEffect(() => {
    Promise.all([fetchAgents(), fetchConnectors(), fetchKbDocs()])
      .finally(() => setLoading(false));
  }, [fetchAgents, fetchConnectors, fetchKbDocs]);

  // ── Realtime subscription ───────────────────────────────────────────────────
  useEffect(() => {
    const ch = supabase
      .channel(`agents_rt_${Date.now()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "ai_agents" }, () => {
        fetchAgents();
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [supabase, fetchAgents]);

  // ── Derived: selected agent ─────────────────────────────────────────────────
  const selectedAgent = agents.find((a) => a.id === selectedId) ?? null;

  useEffect(() => {
    // Only reset the draft when the user switches to a different agent.
    // If the same agent's data refreshes via Supabase realtime (same ID, new
    // object reference), keep the current unsaved edits intact.
    if (selectedId === prevSelectedIdRef.current) return;
    prevSelectedIdRef.current = selectedId;

    if (selectedAgent) {
      setEditDraft(selectedAgent);
      setIsDirty(false);
      setChatMessages([]);
      setTestSessionActive(false);
      setGeneratedPrompt(null);
      setShowPromptPreview(false);
      setFirstMessageOptions([]);
    } else {
      setEditDraft({});
      setIsDirty(false);
    }
  }, [selectedAgent, selectedId]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Draft helpers
  // ─────────────────────────────────────────────────────────────────────────────
  const patch = (updates: Partial<Agent>) => {
    setIsDirty(true);
    setEditDraft((prev) => ({ ...prev, ...updates }));
  };

  function modelsForProvider(provider: string): string[] {
    if (provider === "openai")  return OPENAI_MODELS;
    if (provider === "claude")  return CLAUDE_MODELS;
    if (provider === "groq")    return GROQ_MODELS;
    return GEMINI_MODELS;
  }

  function voicesForProvider(provider: string) {
    if (provider === "elevenlabs") {
      // Language-aware: filter voices by agent's configured language
      const agentLang = editDraft?.language ?? "en";
      return getVoicesForLanguage(agentLang);
    }
    if (provider === "deepgram")    return DEEPGRAM_VOICES;
    if (provider === "openai_tts")  return OPENAI_TTS_VOICES;
    return [] as VoiceOption[];
  }

  /** Validation warning for voice+model+language incompatibility */
  function getVoiceWarning(): string | null {
    if (editDraft?.voice_provider !== "elevenlabs") return null;
    if (!editDraft?.voice_id || !editDraft?.language) return null;
    // Pick a model to validate against (use elevenlabs model or default)
    const modelId = (editDraft as { elevenlabs_model?: string }).elevenlabs_model ?? "eleven_turbo_v2_5";
    return validateVoiceModelLanguage(editDraft.voice_id, modelId, editDraft.language);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Generate system prompt via Gemini (Starter button)
  // ─────────────────────────────────────────────────────────────────────────────
  const handleGeneratePrompt = async () => {
    setGeneratingPrompt(true);
    setShowPromptPreview(false);
    setGeneratedPrompt(null);
    try {
      const res = await fetch("/api/agents/generate-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seed: editDraft.system_prompt ?? "",
          agentName: editDraft.name ?? "AI Assistant",
          department: editDraft.department ?? "Support",
          language: editDraft.language ?? "en",
          voiceProvider: editDraft.voice_provider ?? "browser",
          mode: "prompt",
        }),
      });
      const data = await res.json() as { systemPrompt?: string; error?: string };
      if (!res.ok || !data.systemPrompt) throw new Error(data.error ?? "Generation failed");
      setGeneratedPrompt(data.systemPrompt);
      setShowPromptPreview(true);
    } catch (err) {
      toast({ title: "Generation failed", description: String(err), variant: "destructive" });
    } finally {
      setGeneratingPrompt(false);
    }
  };

  const applyGeneratedPrompt = () => {
    if (generatedPrompt) {
      patch({ system_prompt: generatedPrompt });
      setShowPromptPreview(false);
      setGeneratedPrompt(null);
      toast({ title: "Prompt applied", description: "Review and save when ready." });
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Generate first message options via Gemini
  // ─────────────────────────────────────────────────────────────────────────────
  const handleGenerateFirstMessages = async () => {
    setGeneratingMessages(true);
    try {
      const res = await fetch("/api/agents/generate-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seed: editDraft.system_prompt ?? "",
          agentName: editDraft.name ?? "AI Assistant",
          department: editDraft.department ?? "Support",
          language: editDraft.language ?? "en",
          voiceProvider: editDraft.voice_provider ?? "browser",
          mode: "first_messages",
        }),
      });
      const data = await res.json() as { firstMessages?: string[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Generation failed");
      setFirstMessageOptions(data.firstMessages ?? []);
    } catch (err) {
      toast({ title: "Generation failed", description: String(err), variant: "destructive" });
    } finally {
      setGeneratingMessages(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Save agent
  // ─────────────────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!selectedId || !editDraft) return;
    setSaving(true);
    try {
      // Send only the fields that are part of the update schema — strip read-only fields
      const { id: _id, created_at: _ca, updated_at: _ua, ...saveable } = editDraft as Agent & {
        id?: string; created_at?: string; updated_at?: string;
      };
      void _id; void _ca; void _ua;

      const r = await fetch(`/api/agents/${selectedId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(saveable),
      });
      if (!r.ok) {
        const body = await r.json() as { error?: string; details?: unknown };
        throw new Error(body.error ?? "Save failed");
      }
      setIsDirty(false);
      await fetchAgents();
      toast({ title: "Agent saved", description: "Configuration updated successfully." });
    } catch (err) {
      toast({ title: "Save failed", description: String(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Create agent
  // ─────────────────────────────────────────────────────────────────────────────
  const handleCreateFromTemplate = async (template: (typeof TEMPLATES)[number]) => {
    setShowTemplates(false);
    setCreating(true);
    try {
      const r = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name:           `My ${template.name}`,
          department:     template.department,
          template_id:    template.id,
          system_prompt:  template.systemPrompt,
          first_message:  template.firstMessage,
          agent_speaks_first: !!template.firstMessage,
          model_provider: "gemini",
          model_id:       "gemini-2.5-flash",
          voice_provider: "browser",
          language:       "en",
          status:         "active",
        }),
      });
      if (!r.ok) throw new Error((await r.json() as { error?: string }).error ?? "Create failed");
      const j = await r.json() as { agent: Agent };
      await fetchAgents();
      setSelectedId(j.agent.id);
      setActiveTab("Model");
      toast({ title: "Agent created", description: `"${j.agent.name}" is ready to configure.` });
    } catch (err) {
      toast({ title: "Create failed", description: String(err), variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Delete agent
  // ─────────────────────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!selectedId) return;
    if (!confirm("Delete this agent permanently?")) return;
    setDeleting(true);
    try {
      await fetch(`/api/agents/${selectedId}`, { method: "DELETE" });
      setSelectedId(null);
      setEditDraft({});
      await fetchAgents();
      toast({ title: "Agent deleted" });
    } finally {
      setDeleting(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // KB / Connector linking
  // ─────────────────────────────────────────────────────────────────────────────
  const linkConnector = (connId: string) => {
    const cur = editDraft.connector_ids ?? [];
    if (!cur.includes(connId)) patch({ connector_ids: [...cur, connId] });
  };
  const unlinkConnector = (connId: string) =>
    patch({ connector_ids: (editDraft.connector_ids ?? []).filter((id) => id !== connId) });

  const linkKb = (docId: string) => {
    const cur = editDraft.kb_document_ids ?? [];
    if (!cur.includes(docId)) patch({ kb_document_ids: [...cur, docId] });
  };
  const unlinkKb = (docId: string) =>
    patch({ kb_document_ids: (editDraft.kb_document_ids ?? []).filter((id) => id !== docId) });

  // ─────────────────────────────────────────────────────────────────────────────
  // Voice testing
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Speak text via ElevenLabs TTS preview endpoint.
   * Falls back to browser TTS if the API call fails.
   */
  const speakWithElevenLabs = useCallback(async (text: string) => {
    if (!text.trim()) return;

    // Stop any in-progress audio first
    elevenLabsAudioRef.current?.pause();
    elevenLabsAudioRef.current = null;
    window.speechSynthesis.cancel();

    const voiceId = editDraft.voice_id ?? "cgSgspJ2msm6clMCkdW9"; // default: Jessica
    const model   = "eleven_turbo_v2_5";

    const useBrowserFallback = (reason?: string) => {
      if (reason) console.warn("[TTS] ElevenLabs unavailable:", reason, "— using browser TTS");
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang  = editDraft.language ?? "en";
      utter.rate  = editDraft.voice_speed ?? 1.0;
      utter.onend = () => setIsSpeaking(false);
      synthRef.current = utter;
      window.speechSynthesis.speak(utter);
    };

    setIsSpeaking(true);
    try {
      const res = await fetch("/api/voice/tts-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voiceId, text: text.slice(0, 2000), model }),
      });

      const contentType = res.headers.get("content-type") ?? "";

      // Server returned JSON — check if it's an error with fallback flag
      if (contentType.includes("application/json")) {
        const json = await res.json() as { fallback?: boolean; error?: string; detail?: string };
        if (json.fallback) {
          useBrowserFallback(json.error);
          return;
        }
        useBrowserFallback(json.error ?? "Unexpected JSON from TTS endpoint");
        return;
      }

      // Happy path — audio/mpeg blob
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const audio = new Audio(url);
      elevenLabsAudioRef.current = audio;

      audio.onended = () => {
        setIsSpeaking(false);
        URL.revokeObjectURL(url);
        elevenLabsAudioRef.current = null;
      };
      audio.onerror = () => {
        setIsSpeaking(false);
        URL.revokeObjectURL(url);
        elevenLabsAudioRef.current = null;
      };

      await audio.play();
    } catch (e) {
      useBrowserFallback(String(e));
    }
  }, [editDraft.voice_id, editDraft.language, editDraft.voice_speed]);

  const sendChatMessage = useCallback(async (text: string) => {
    if (!text.trim() || !selectedId || chatSending) return;
    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      text: text.trim(),
      timestamp: new Date(),
    };
    setChatMessages((prev) => [...prev, userMsg]);
    setChatInput("");
    setChatSending(true);

    try {
      const history = chatMessages.slice(-10).map((m) => ({
        role: m.role === "user" ? "user" : "model" as "user" | "model",
        parts: [{ text: m.text }],
      }));

      const r = await fetch(`/api/agents/${selectedId}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text.trim(), history }),
      });
      const j = await r.json() as { reply?: string; latencyMs?: number; error?: string };
      if (!r.ok) throw new Error(j.error ?? "Test failed");

      const agentMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: "agent",
        text: j.reply ?? "",
        latencyMs: j.latencyMs,
        timestamp: new Date(),
      };
      setChatMessages((prev) => [...prev, agentMsg]);

      if (j.latencyMs) {
        latencySamples.current = [...latencySamples.current.slice(-9), j.latencyMs];
        const avg = latencySamples.current.reduce((a, b) => a + b, 0) / latencySamples.current.length;
        setAvgLatency(Math.round(avg));
      }

      // ── TTS playback based on configured voice provider ─────────────────
      if (j.reply) {
        if (editDraft.voice_provider === "elevenlabs") {
          // ElevenLabs TTS — plays through the preview API
          await speakWithElevenLabs(j.reply);
        } else if (editDraft.voice_provider === "browser" || !editDraft.voice_provider) {
          // Browser built-in TTS
          setIsSpeaking(true);
          const utter = new SpeechSynthesisUtterance(j.reply);
          utter.lang  = editDraft.language ?? "en";
          utter.rate  = editDraft.voice_speed ?? 1.0;
          utter.onend = () => setIsSpeaking(false);
          synthRef.current = utter;
          window.speechSynthesis.speak(utter);
        }
        // Other providers (deepgram, openai_tts, amazon_polly) — no preview in test mode
      }
    } catch (err) {
      toast({ title: "Test error", description: String(err), variant: "destructive" });
    } finally {
      setChatSending(false);
    }
  }, [selectedId, chatSending, chatMessages, editDraft, toast, speakWithElevenLabs]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const startListening = useCallback(() => {
    setMicError(null);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR: any = w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;

    if (!SR) {
      setMicError("Browser does not support SpeechRecognition. Use Chrome.");
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rec: any = new SR();
    rec.lang           = editDraft.language ?? "en";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      const transcript = e.results[0]?.[0]?.transcript ?? "";
      if (transcript) sendChatMessage(transcript);
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onerror = (e: any) => {
      setMicError(`Mic error: ${e.error}`);
      setIsListening(false);
    };
    rec.onend = () => setIsListening(false);
    recognitionRef.current = rec;
    rec.start();
    setIsListening(true);
  }, [editDraft.language, sendChatMessage]);

  const stopListening = () => {
    recognitionRef.current?.stop();
    setIsListening(false);
  };

  const stopSpeaking = () => {
    // Stop ElevenLabs audio
    if (elevenLabsAudioRef.current) {
      elevenLabsAudioRef.current.pause();
      elevenLabsAudioRef.current = null;
    }
    // Stop browser TTS
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  };

  const startTestSession = async () => {
    setTestSessionActive(true);
    if (editDraft.agent_speaks_first && editDraft.first_message?.trim()) {
      const agentGreeting: ChatMessage = {
        id: Date.now().toString(),
        role: "agent",
        text: editDraft.first_message,
        timestamp: new Date(),
      };
      setChatMessages([agentGreeting]);

      if (editDraft.voice_provider === "elevenlabs") {
        await speakWithElevenLabs(editDraft.first_message);
      } else {
        setIsSpeaking(true);
        const utter = new SpeechSynthesisUtterance(editDraft.first_message);
        utter.lang  = editDraft.language ?? "en";
        utter.onend = () => setIsSpeaking(false);
        synthRef.current = utter;
        window.speechSynthesis.speak(utter);
      }
    } else {
      setChatMessages([]);
    }
  };

  const endTestSession = () => {
    stopListening();
    stopSpeaking();
    setTestSessionActive(false);
    setChatMessages([]);
    latencySamples.current = [];
    setAvgLatency(null);
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Outbound call helpers
  // ─────────────────────────────────────────────────────────────────────────────

  /** Auto-format Bangladesh phone numbers to E.164 */
  function formatPhoneBD(raw: string): string {
    const stripped = raw.replace(/\s|-/g, "");
    if (/^01[3-9]\d{8}$/.test(stripped)) return `+880${stripped}`;
    if (/^8801[3-9]\d{8}$/.test(stripped)) return `+${stripped}`;
    return stripped;
  }

  const startOutboundCall = async () => {
    if (!selectedId || !outboundPhone.trim()) return;
    setOutboundError(null);
    setOutboundErrorHint(null);
    setOutboundStatus("initiating");
    setOutboundTranscript([]);
    setOutboundElapsed(0);

    try {
      const res = await fetch("/api/calls/outbound", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: selectedId,
          to: formatPhoneBD(outboundPhone),
        }),
      });
      const json = await res.json() as {
        ok?: boolean; callSid?: string; agentName?: string; error?: string; hint?: string;
      };

      if (!res.ok || !json.ok) {
        setOutboundErrorHint(json.hint ?? null);
        throw new Error(json.error ?? "Call initiation failed");
      }

      setOutboundError(null);
      setOutboundErrorHint(null);
      setOutboundCallSid(json.callSid ?? null);
      setOutboundStatus("ringing");
      setOutboundAgentName(json.agentName ?? editDraft.name ?? "AI Agent");

      // ── Subscribe to Supabase realtime for this call ──────────────────────
      if (json.callSid) {
        const ch = supabase
          .channel(`outbound_${json.callSid}`)
          .on(
            "postgres_changes",
            {
              event: "UPDATE",
              schema: "public",
              table: "call_sessions",
              filter: `call_sid=eq.${json.callSid}`,
            },
            (payload) => {
              const row = payload.new as {
                call_status: string;
                meta?: { conversation?: Array<{role: string; text: string; ts: number}> };
              };
              const status = row.call_status as OutboundStatus;
              setOutboundStatus(status);
              if (row.meta?.conversation) {
                setOutboundTranscript([...row.meta.conversation]);
                setTimeout(() => {
                  outboundTranscriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
                }, 50);
              }
              // Start elapsed timer when connected
              if (status === "in-progress" && !outboundTimerRef.current) {
                outboundTimerRef.current = setInterval(() => {
                  setOutboundElapsed((s) => s + 1);
                }, 1000);
              }
              // Stop timer on call end
              if (["completed", "failed", "busy", "no-answer", "canceled"].includes(status)) {
                if (outboundTimerRef.current) {
                  clearInterval(outboundTimerRef.current);
                  outboundTimerRef.current = null;
                }
              }
            }
          )
          .subscribe();
        outboundRealtimeRef.current = ch;
      }

      toast({ title: "📞 Call initiated", description: `Ringing ${outboundPhone}…` });
    } catch (err) {
      setOutboundStatus("idle");
      setOutboundError(String(err));
      toast({ title: "Call failed", description: String(err), variant: "destructive" });
    }
  };

  const hangupOutboundCall = async () => {
    if (!outboundCallSid) return;
    try {
      await fetch("/api/calls/outbound/hangup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callSid: outboundCallSid }),
      });
    } catch {
      // Ignore — status callback will update DB anyway
    }
    if (outboundTimerRef.current) {
      clearInterval(outboundTimerRef.current);
      outboundTimerRef.current = null;
    }
    if (outboundRealtimeRef.current) {
      supabase.removeChannel(outboundRealtimeRef.current);
      outboundRealtimeRef.current = null;
    }
    setOutboundStatus("completed");
    toast({ title: "Call ended" });
  };

  const resetOutboundCall = () => {
    if (outboundTimerRef.current) { clearInterval(outboundTimerRef.current); outboundTimerRef.current = null; }
    if (outboundRealtimeRef.current) { supabase.removeChannel(outboundRealtimeRef.current); outboundRealtimeRef.current = null; }
    setOutboundCallSid(null);
    setOutboundStatus("idle");
    setOutboundTranscript([]);
    setOutboundElapsed(0);
    setOutboundError(null);
    setOutboundErrorHint(null);
  };

  function formatDuration(secs: number): string {
    const m = Math.floor(secs / 60).toString().padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // KB upload
  // ─────────────────────────────────────────────────────────────────────────────
  const handleFileUpload = async (file: File) => {
    setUploading(true);
    try {
      const ext   = file.name.split(".").pop() ?? "txt";
      const path  = `kb/${Date.now()}_${file.name}`;
      const mime  = file.type || "text/plain";

      const { error: upErr } = await supabase.storage.from("knowledge-base").upload(path, file, { contentType: mime });
      if (upErr) throw new Error(upErr.message);

      const { data: docRow, error: docErr } = await supabase
        .from("kb_documents")
        .insert({ storage_path: path, title: file.name, mime_type: mime, status: "pending" })
        .select("id")
        .single();
      if (docErr) throw new Error(docErr.message);

      const docId = (docRow as { id: string }).id;

      await fetch("/api/knowledge/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document_id: docId }),
      });

      await fetchKbDocs();
      linkKb(docId);
      toast({ title: "Document uploaded", description: `"${file.name}" is being processed.` });
    } catch (err) {
      toast({ title: "Upload failed", description: String(err), variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Filtered agents
  // ─────────────────────────────────────────────────────────────────────────────
  const filteredAgents = agents.filter(
    (a) => a.name.toLowerCase().includes(search.toLowerCase()) ||
           a.department.toLowerCase().includes(search.toLowerCase())
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <>
      <TemplateModal
        open={showTemplates}
        onSelect={handleCreateFromTemplate}
        onClose={() => setShowTemplates(false)}
      />

      <div className="flex h-[calc(100vh-4rem)] overflow-hidden">
        {/* ── LEFT PANEL: Agent List ───────────────────────────────────────── */}
        <div className="w-72 shrink-0 flex flex-col border-r border-[hsl(var(--border))] bg-[hsl(var(--surface-0))]">
          {/* Header */}
          <div className="p-4 border-b border-[hsl(var(--border))]">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h1 className="text-base font-bold" style={{ fontFamily: "Syne, sans-serif" }}>
                  AI Agents
                </h1>
                <p className="text-[11px] text-muted-foreground">
                  {agents.length} agent{agents.length !== 1 ? "s" : ""} configured
                </p>
              </div>
              <Button
                size="sm"
                onClick={() => setShowTemplates(true)}
                disabled={creating}
                className="h-8 px-2.5 bg-[hsl(var(--cyan))] text-[hsl(var(--surface-0))] hover:bg-[hsl(var(--cyan)/0.85)] text-xs"
              >
                {creating ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                <span className="ml-1">New</span>
              </Button>
            </div>
            <Input
              placeholder="Search agents..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 text-xs bg-[hsl(var(--surface-1))] border-[hsl(var(--border))] placeholder:text-muted-foreground/50"
            />
          </div>

          {/* Agent list */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 size={20} className="animate-spin text-muted-foreground" />
              </div>
            ) : filteredAgents.length === 0 ? (
              <div className="text-center py-12 px-4">
                <Bot size={32} className="mx-auto text-muted-foreground/30 mb-3" />
                <p className="text-xs text-muted-foreground">
                  {search ? "No agents match your search" : "No agents yet. Create one to get started."}
                </p>
              </div>
            ) : (
              filteredAgents.map((agent) => (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  selected={selectedId === agent.id}
                  onClick={() => {
                    setSelectedId(agent.id);
                    setActiveTab("Model");
                    endTestSession();
                  }}
                />
              ))
            )}
          </div>
        </div>

        {/* ── RIGHT PANEL: Editor ──────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {!selectedAgent ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="w-20 h-20 rounded-2xl bg-[hsl(var(--cyan)/0.08)] border border-[hsl(var(--cyan)/0.2)] flex items-center justify-center mx-auto mb-4">
                  <Bot size={36} className="text-[hsl(var(--cyan)/0.5)]" />
                </div>
                <h2 className="text-lg font-semibold mb-1" style={{ fontFamily: "Syne, sans-serif" }}>
                  Select an Agent
                </h2>
                <p className="text-sm text-muted-foreground mb-4">
                  Choose an agent from the list or create a new one
                </p>
                <Button
                  onClick={() => setShowTemplates(true)}
                  className="bg-[hsl(var(--cyan))] text-[hsl(var(--surface-0))] hover:bg-[hsl(var(--cyan)/0.85)]"
                >
                  <Plus size={14} className="mr-1" /> Create New Agent
                </Button>
              </div>
            </div>
          ) : (
            <>
              {/* Agent header */}
              <div className="flex items-center gap-3 px-6 py-3.5 border-b border-[hsl(var(--border))] bg-[hsl(var(--surface-0))]">
                <div className="w-9 h-9 rounded-xl bg-[hsl(var(--cyan)/0.1)] border border-[hsl(var(--cyan)/0.2)] flex items-center justify-center">
                  <Bot size={17} className="text-[hsl(var(--cyan))]" />
                </div>
                <div className="flex-1 min-w-0">
                  <Input
                    value={editDraft.name ?? ""}
                    onChange={(e) => patch({ name: e.target.value })}
                    className="h-7 text-sm font-semibold bg-transparent border-transparent hover:border-[hsl(var(--border))] focus:border-[hsl(var(--cyan)/0.5)] px-1 w-full max-w-xs"
                  />
                  <div className="flex items-center gap-2 mt-0.5 px-1">
                    <Badge className={cn(
                      "text-[9px] px-1.5 py-0 border",
                      editDraft.status === "active"
                        ? "bg-[hsl(var(--emerald)/0.1)] text-[hsl(var(--emerald))] border-[hsl(var(--emerald)/0.3)]"
                        : "bg-[hsl(var(--muted))] text-muted-foreground border-transparent"
                    )}>
                      {editDraft.status === "active" ? "● Active" : "○ Inactive"}
                    </Badge>
                    <span className="text-[11px] text-muted-foreground">{editDraft.model_provider} · {editDraft.model_id}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleDelete}
                    disabled={deleting}
                    className="h-8 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                  >
                    {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSave}
                    disabled={saving}
                    className={cn(
                      "h-8 px-3 text-xs transition-all",
                      isDirty
                        ? "bg-[hsl(var(--cyan))] text-[hsl(var(--surface-0))] hover:bg-[hsl(var(--cyan)/0.85)] ring-2 ring-[hsl(var(--cyan)/0.35)]"
                        : "bg-[hsl(var(--cyan)/0.6)] text-[hsl(var(--surface-0))] hover:bg-[hsl(var(--cyan)/0.75)]"
                    )}
                  >
                    {saving ? (
                      <Loader2 size={13} className="animate-spin mr-1" />
                    ) : isDirty ? (
                      <span className="mr-1 text-[10px]">●</span>
                    ) : null}
                    Save changes
                  </Button>
                </div>
              </div>

              {/* Tabs */}
              <div className="flex items-center gap-1 px-6 py-2 border-b border-[hsl(var(--border))] bg-[hsl(var(--surface-0))]">
                {TABS.map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                      activeTab === tab
                        ? "bg-[hsl(var(--cyan)/0.12)] text-[hsl(var(--cyan))]"
                        : "text-muted-foreground hover:text-foreground hover:bg-[hsl(var(--surface-2))]"
                    )}
                  >
                    {tab === "Model"     && <Brain size={12} />}
                    {tab === "Voice"     && <Headphones size={12} />}
                    {tab === "Knowledge" && <BookOpen size={12} />}
                    {tab === "Testing"   && <Radio size={12} />}
                    {tab === "Advanced"  && <Settings size={12} />}
                    {tab}
                  </button>
                ))}
              </div>

              {/* Tab content */}
              <div className="flex-1 overflow-y-auto">
                {/* ── MODEL TAB ──────────────────────────────────────────── */}
                {activeTab === "Model" && (
                  <div className="p-6 max-w-2xl mx-auto space-y-6">
                    {/* Provider */}
                    <section>
                      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                        Language Model
                      </h3>
                      <div className="grid grid-cols-2 gap-3 mb-4">
                        {MODEL_PROVIDERS.map((p) => (
                          <button
                            key={p.value}
                            onClick={() => {
                              const models = modelsForProvider(p.value);
                              patch({ model_provider: p.value, model_id: models[0] });
                            }}
                            className={cn(
                              "flex items-center gap-2.5 p-3 rounded-xl border text-left transition-all",
                              editDraft.model_provider === p.value
                                ? "bg-[hsl(var(--cyan)/0.08)] border-[hsl(var(--cyan)/0.35)] text-[hsl(var(--cyan))]"
                                : "bg-[hsl(var(--surface-1))] border-[hsl(var(--border))] text-foreground hover:border-[hsl(var(--cyan)/0.2)]"
                            )}
                          >
                            <span className="text-lg">{p.icon}</span>
                            <span className="text-xs font-medium">{p.label}</span>
                          </button>
                        ))}
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground mb-1.5 block">Model variant</Label>
                        <Select
                          value={editDraft.model_id ?? ""}
                          onValueChange={(v) => patch({ model_id: v })}
                        >
                          <SelectTrigger className="h-9 text-sm bg-[hsl(var(--surface-1))] border-[hsl(var(--border))]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {modelsForProvider(editDraft.model_provider ?? "gemini").map((m) => (
                              <SelectItem key={m} value={m}>{m}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </section>

                    <div className="border-t border-[hsl(var(--border))]" />

                    {/* Agent speaks first */}
                    <section>
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            First Message
                          </h3>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Configure what the agent says when a call connects
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">Agent speaks first</span>
                          <Switch
                            checked={editDraft.agent_speaks_first ?? true}
                            onCheckedChange={(v) => patch({ agent_speaks_first: v })}
                          />
                        </div>
                      </div>

                      {editDraft.agent_speaks_first && (
                        <div className="space-y-3">
                          {/* Custom input */}
                          <div>
                            <Label className="text-xs text-muted-foreground mb-1.5 block">
                              Opening message
                            </Label>
                            <Input
                              value={editDraft.first_message ?? ""}
                              onChange={(e) => patch({ first_message: e.target.value })}
                              placeholder={`Hello! I'm ${editDraft.name ?? "your AI assistant"}. How can I help you today?`}
                              className="h-9 text-sm bg-[hsl(var(--surface-1))] border-[hsl(var(--border))]"
                            />
                          </div>

                          {/* Static quick-pick options */}
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-[11px] text-muted-foreground font-medium">
                                Quick select an option
                              </span>
                              <button
                                onClick={() => void handleGenerateFirstMessages()}
                                disabled={generatingMessages}
                                className="flex items-center gap-1 text-[11px] text-[hsl(var(--violet))] hover:text-[hsl(var(--violet)/0.8)] transition-colors disabled:opacity-50"
                              >
                                {generatingMessages
                                  ? <Loader2 size={10} className="animate-spin" />
                                  : <Sparkles size={10} />}
                                {generatingMessages ? "Generating…" : "AI Generate more"}
                              </button>
                            </div>

                            <div className="space-y-1.5">
                              {/* Default options always visible */}
                              {[
                                `Hello! I'm ${editDraft.name ?? "your assistant"}. How can I help you today?`,
                                `Thank you for calling. You're speaking with ${editDraft.name ?? "your AI assistant"}. What can I do for you?`,
                                `Hi there! I'm ${editDraft.name ?? "your assistant"} — ready to help. What brings you in today?`,
                                `Good day! ${editDraft.name ?? "AI Assistant"} here. How may I assist you?`,
                              ].map((opt, i) => (
                                <button
                                  key={`static-${i}`}
                                  onClick={() => patch({ first_message: opt })}
                                  className={cn(
                                    "w-full text-left text-xs px-3 py-2.5 rounded-xl border transition-all leading-relaxed",
                                    editDraft.first_message === opt
                                      ? "bg-[hsl(var(--cyan)/0.1)] border-[hsl(var(--cyan)/0.4)] text-[hsl(var(--cyan))]"
                                      : "bg-[hsl(var(--surface-1))] border-[hsl(var(--border))] text-muted-foreground hover:text-foreground hover:border-[hsl(var(--cyan)/0.2)] hover:bg-[hsl(var(--surface-2))]"
                                  )}
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <span>{opt}</span>
                                    {editDraft.first_message === opt && (
                                      <CheckCircle2 size={13} className="shrink-0 mt-0.5 text-[hsl(var(--cyan))]" />
                                    )}
                                  </div>
                                </button>
                              ))}

                              {/* AI-generated options (shown after generation) */}
                              {firstMessageOptions.length > 0 && (
                                <>
                                  <div className="flex items-center gap-2 pt-1">
                                    <div className="flex-1 border-t border-[hsl(var(--border))]" />
                                    <span className="text-[10px] text-[hsl(var(--violet))] font-medium flex items-center gap-1">
                                      <Sparkles size={9} /> AI Generated
                                    </span>
                                    <div className="flex-1 border-t border-[hsl(var(--border))]" />
                                  </div>
                                  {firstMessageOptions.map((opt, i) => (
                                    <button
                                      key={`ai-${i}`}
                                      onClick={() => patch({ first_message: opt })}
                                      className={cn(
                                        "w-full text-left text-xs px-3 py-2.5 rounded-xl border transition-all leading-relaxed",
                                        editDraft.first_message === opt
                                          ? "bg-[hsl(var(--violet)/0.1)] border-[hsl(var(--violet)/0.4)] text-[hsl(var(--violet))]"
                                          : "bg-[hsl(var(--surface-1))] border-[hsl(var(--violet)/0.15)] text-muted-foreground hover:text-foreground hover:border-[hsl(var(--violet)/0.3)] hover:bg-[hsl(var(--violet)/0.04)]"
                                      )}
                                    >
                                      <div className="flex items-start justify-between gap-2">
                                        <span>{opt}</span>
                                        {editDraft.first_message === opt && (
                                          <CheckCircle2 size={13} className="shrink-0 mt-0.5 text-[hsl(var(--violet))]" />
                                        )}
                                      </div>
                                    </button>
                                  ))}
                                </>
                              )}

                              {generatingMessages && (
                                <div className="flex items-center justify-center gap-2 py-4 rounded-xl border border-dashed border-[hsl(var(--violet)/0.3)] bg-[hsl(var(--violet)/0.04)]">
                                  <Loader2 size={13} className="animate-spin text-[hsl(var(--violet))]" />
                                  <span className="text-xs text-[hsl(var(--violet))]">
                                    Generating AI options…
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </section>

                    <div className="border-t border-[hsl(var(--border))]" />

                    {/* System prompt */}
                    <section>
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            System Prompt
                          </h3>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Define the agent&apos;s behavior, persona, and goals
                          </p>
                        </div>
                        {/* Starter button — generates complete prompt via Gemini */}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void handleGeneratePrompt()}
                          disabled={generatingPrompt}
                          className="h-7 text-xs text-[hsl(var(--violet))] hover:bg-[hsl(var(--violet)/0.1)] border border-[hsl(var(--violet)/0.2)]"
                        >
                          {generatingPrompt
                            ? <Loader2 size={12} className="mr-1 animate-spin" />
                            : <Wand2 size={12} className="mr-1" />}
                          {generatingPrompt ? "Generating…" : "Starter"}
                        </Button>
                      </div>

                      <Textarea
                        value={editDraft.system_prompt ?? ""}
                        onChange={(e) => {
                          patch({ system_prompt: e.target.value });
                          // Dismiss preview if user edits manually
                          if (showPromptPreview) setShowPromptPreview(false);
                        }}
                        placeholder={`You are ${editDraft.name ?? "an AI assistant"}, a professional voice agent for ${editDraft.department ?? "customer support"}…\n\nDescribe the agent's goals, tone, and behavior here, or click "Starter" to generate a complete prompt automatically.`}
                        className="min-h-[180px] text-sm font-mono bg-[hsl(var(--surface-1))] border-[hsl(var(--border))] resize-y"
                      />

                      <div className="flex items-center justify-between mt-1.5">
                        <p className="text-[10px] text-muted-foreground">
                          {(editDraft.system_prompt ?? "").length} chars
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          ≈ {Math.ceil((editDraft.system_prompt ?? "").split(/\s+/).filter(Boolean).length / 0.75)} tokens
                        </p>
                      </div>

                      {/* Generated prompt preview panel */}
                      <AnimatePresence>
                        {showPromptPreview && generatedPrompt && (
                          <motion.div
                            initial={{ opacity: 0, y: -8, height: 0 }}
                            animate={{ opacity: 1, y: 0, height: "auto" }}
                            exit={{ opacity: 0, y: -8, height: 0 }}
                            transition={{ duration: 0.2, ease: "easeOut" }}
                            className="mt-3 rounded-xl border border-[hsl(var(--violet)/0.35)] bg-[hsl(var(--violet)/0.04)] overflow-hidden"
                          >
                            {/* Preview header */}
                            <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-[hsl(var(--violet)/0.2)]">
                              <div className="flex items-center gap-2">
                                <Sparkles size={13} className="text-[hsl(var(--violet))]" />
                                <span className="text-xs font-semibold text-[hsl(var(--violet))]">
                                  AI-Generated Prompt
                                </span>
                                <span className="text-[10px] text-muted-foreground">
                                  — review before applying
                                </span>
                              </div>
                              <button
                                onClick={() => setShowPromptPreview(false)}
                                className="text-muted-foreground hover:text-foreground transition-colors"
                              >
                                <X size={13} />
                              </button>
                            </div>

                            {/* Generated text */}
                            <div className="px-3.5 py-3 max-h-56 overflow-y-auto">
                              <p className="text-xs font-mono text-foreground leading-relaxed whitespace-pre-wrap">
                                {generatedPrompt}
                              </p>
                            </div>

                            {/* Actions */}
                            <div className="flex items-center gap-2 px-3.5 py-2.5 border-t border-[hsl(var(--violet)/0.2)] bg-[hsl(var(--violet)/0.06)]">
                              <Button
                                size="sm"
                                onClick={applyGeneratedPrompt}
                                className="h-7 px-3 text-xs bg-[hsl(var(--violet))] text-white hover:bg-[hsl(var(--violet)/0.85)]"
                              >
                                <CheckCircle2 size={11} className="mr-1" />
                                Apply this prompt
                              </Button>
                              <button
                                onClick={() => void handleGeneratePrompt()}
                                disabled={generatingPrompt}
                                className="h-7 px-3 text-xs text-[hsl(var(--violet))] hover:text-[hsl(var(--violet)/0.8)] border border-[hsl(var(--violet)/0.3)] rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1"
                              >
                                <RefreshCw size={10} className={generatingPrompt ? "animate-spin" : ""} />
                                Regenerate
                              </button>
                              <button
                                onClick={() => setShowPromptPreview(false)}
                                className="h-7 px-3 text-xs text-muted-foreground hover:text-foreground transition-colors"
                              >
                                Discard
                              </button>
                              <span className="ml-auto text-[10px] text-muted-foreground">
                                {generatedPrompt.length} chars
                              </span>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {/* Hint text when textarea is empty */}
                      {!editDraft.system_prompt?.trim() && !generatingPrompt && !showPromptPreview && (
                        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          <Wand2 size={11} className="text-[hsl(var(--violet)/0.6)]" />
                          <span>
                            Click <span className="text-[hsl(var(--violet))]">Starter</span> to generate a complete prompt automatically, or type your own above.
                          </span>
                        </div>
                      )}
                    </section>
                  </div>
                )}

                {/* ── VOICE TAB ──────────────────────────────────────────── */}
                {activeTab === "Voice" && (
                  <div className="p-6 max-w-2xl mx-auto space-y-6">
                    {/* Voice provider */}
                    <section>
                      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                        Voice Provider (TTS)
                      </h3>
                      <div className="space-y-2">
                        {VOICE_PROVIDERS.map((vp) => (
                          <button
                            key={vp.value}
                            onClick={() => patch({ voice_provider: vp.value, voice_id: null })}
                            className={cn(
                              "w-full flex items-center justify-between px-4 py-3 rounded-xl border text-left transition-all",
                              editDraft.voice_provider === vp.value
                                ? "bg-[hsl(var(--cyan)/0.08)] border-[hsl(var(--cyan)/0.35)] text-[hsl(var(--cyan))]"
                                : "bg-[hsl(var(--surface-1))] border-[hsl(var(--border))] text-muted-foreground hover:text-foreground hover:border-[hsl(var(--cyan)/0.2)]"
                            )}
                          >
                            <div className="flex items-center gap-3">
                              <Volume2 size={14} />
                              <span className="text-sm font-medium">{vp.label}</span>
                            </div>
                            {vp.value === "browser" && (
                              <Badge className="text-[9px] bg-[hsl(var(--emerald)/0.1)] text-[hsl(var(--emerald))] border-[hsl(var(--emerald)/0.3)]">
                                Free
                              </Badge>
                            )}
                            {editDraft.voice_provider === vp.value && (
                              <CheckCircle2 size={14} className="text-[hsl(var(--cyan))]" />
                            )}
                          </button>
                        ))}
                      </div>
                    </section>

                    {/* Voice selection */}
                    {voicesForProvider(editDraft.voice_provider ?? "browser").length > 0 && (
                      <>
                        <div className="border-t border-[hsl(var(--border))]" />
                        <section>
                          <div className="flex items-center justify-between mb-3">
                            <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                              Voice
                            </Label>
                            {editDraft.voice_provider === "elevenlabs" && editDraft.language && (
                              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                <Globe size={10} />
                                Filtered for {LANGUAGES.find((l) => l.value === editDraft.language)?.label ?? editDraft.language}
                              </span>
                            )}
                          </div>

                          {/* Bangla-specific guidance */}
                          {editDraft.voice_provider === "elevenlabs" && editDraft.language === "bn" && (
                            <div className="mb-3 px-3 py-2.5 rounded-lg bg-[hsl(var(--cyan)/0.05)] border border-[hsl(var(--cyan)/0.2)] text-[11px] text-[hsl(var(--cyan))]">
                              <span className="font-semibold">বাংলা (Bengali) tips:</span> Use a{" "}
                              <span className="font-semibold">Multilingual</span> voice with{" "}
                              <span className="font-semibold">eleven_turbo_v2_5</span>. Jessica and Chris produce the best Bangla speech.
                              English-only voices are hidden.
                            </div>
                          )}

                          {/* Voice model picker (ElevenLabs only) */}
                          {editDraft.voice_provider === "elevenlabs" && (
                            <div className="mb-3">
                              <Label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5 block">
                                TTS Model
                              </Label>
                              <div className="grid grid-cols-1 gap-1.5">
                                {getModelsForLanguage(editDraft.language ?? "en").map((m) => (
                                  <button
                                    key={m.id}
                                    onClick={() => patch({ voice_id: editDraft.voice_id } as Partial<Agent>)}
                                    className={cn(
                                      "flex items-center justify-between px-3 py-2 rounded-lg border text-left transition-all text-xs",
                                      m.id === "eleven_turbo_v2_5"
                                        ? "bg-[hsl(var(--cyan)/0.08)] border-[hsl(var(--cyan)/0.3)] text-[hsl(var(--cyan))]"
                                        : "bg-[hsl(var(--surface-1))] border-[hsl(var(--border))] text-muted-foreground hover:border-[hsl(var(--cyan)/0.2)]"
                                    )}
                                  >
                                    <span className="font-medium">{m.name}</span>
                                    <div className="flex items-center gap-1.5">
                                      {"supportsBangla" in m && m.supportsBangla && editDraft.language === "bn" && (
                                        <Badge className="text-[8px] px-1 bg-[hsl(var(--emerald)/0.1)] text-[hsl(var(--emerald))] border-[hsl(var(--emerald)/0.3)]">
                                          বাংলা ✓
                                        </Badge>
                                      )}
                                      <Badge className="text-[8px] px-1 bg-[hsl(var(--surface-2))] text-muted-foreground border-[hsl(var(--border))]">
                                        {m.badge}
                                      </Badge>
                                    </div>
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Voice list */}
                          <div className="grid grid-cols-1 gap-2">
                            {(voicesForProvider(editDraft.voice_provider ?? "") as VoiceOption[]).map((v) => (
                              <button
                                key={v.voice_id}
                                onClick={() => patch({ voice_id: v.voice_id })}
                                className={cn(
                                  "flex items-center justify-between px-4 py-2.5 rounded-xl border text-left transition-all",
                                  editDraft.voice_id === v.voice_id
                                    ? "bg-[hsl(var(--violet)/0.1)] border-[hsl(var(--violet)/0.35)] text-[hsl(var(--violet))]"
                                    : "bg-[hsl(var(--surface-1))] border-[hsl(var(--border))] text-muted-foreground hover:text-foreground hover:border-[hsl(var(--violet)/0.2)]"
                                )}
                              >
                                <div className="flex flex-col gap-0.5">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium">{v.name}</span>
                                    {v.gender === "female" ? (
                                      <Badge className="text-[8px] px-1 py-0 h-3.5 bg-pink-500/10 text-pink-400 border-pink-500/20">F</Badge>
                                    ) : (
                                      <Badge className="text-[8px] px-1 py-0 h-3.5 bg-blue-500/10 text-blue-400 border-blue-500/20">M</Badge>
                                    )}
                                    {v.language === "multilingual" && (
                                      <Badge className="text-[8px] px-1.5 py-0 h-3.5 bg-[hsl(var(--cyan)/0.1)] text-[hsl(var(--cyan))] border-[hsl(var(--cyan)/0.25)]">
                                        Multilingual
                                      </Badge>
                                    )}
                                    {v.tier === "premium" && (
                                      <Badge className="text-[8px] px-1.5 py-0 h-3.5 bg-[hsl(var(--amber)/0.1)] text-amber-400 border-amber-500/20">
                                        ⭐
                                      </Badge>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-[10px] text-muted-foreground">{v.use_case}</span>
                                    {v.note && (
                                      <span className="text-[10px] text-[hsl(var(--cyan)/0.7)]">{v.note}</span>
                                    )}
                                  </div>
                                </div>
                                {editDraft.voice_id === v.voice_id && (
                                  <CheckCircle2 size={13} className="text-[hsl(var(--violet))] shrink-0" />
                                )}
                              </button>
                            ))}
                          </div>

                          {/* Voice incompatibility warning */}
                          {getVoiceWarning() && (
                            <div className="mt-2 flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-500/5 border border-amber-500/20 text-[11px] text-amber-400">
                              <AlertTriangle size={11} className="mt-0.5 shrink-0" />
                              <span>{getVoiceWarning()}</span>
                            </div>
                          )}
                        </section>
                      </>
                    )}

                    <div className="border-t border-[hsl(var(--border))]" />

                    {/* Speed */}
                    <section className="space-y-4">
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                            Speed
                          </Label>
                          <span className="text-xs font-mono text-[hsl(var(--cyan))]">
                            {editDraft.voice_speed ?? 1.0}×
                          </span>
                        </div>
                        <Slider
                          min={0.5} max={2.0} step={0.1}
                          value={[editDraft.voice_speed ?? 1.0]}
                          onValueChange={([v]) => patch({ voice_speed: v })}
                          className="[&_.slider-thumb]:bg-[hsl(var(--cyan))]"
                        />
                        <div className="flex justify-between mt-1">
                          <span className="text-[10px] text-muted-foreground">Slow</span>
                          <span className="text-[10px] text-muted-foreground">Normal</span>
                          <span className="text-[10px] text-muted-foreground">Fast</span>
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                            Temperature
                          </Label>
                          <span className="text-xs font-mono text-[hsl(var(--violet))]">
                            {editDraft.voice_temperature ?? 0.8}
                          </span>
                        </div>
                        <Slider
                          min={0} max={1} step={0.05}
                          value={[editDraft.voice_temperature ?? 0.8]}
                          onValueChange={([v]) => patch({ voice_temperature: v })}
                        />
                        <div className="flex justify-between mt-1">
                          <span className="text-[10px] text-muted-foreground">Precise</span>
                          <span className="text-[10px] text-muted-foreground">Creative</span>
                        </div>
                      </div>
                    </section>

                    <div className="border-t border-[hsl(var(--border))]" />

                    {/* Transcriber */}
                    <section>
                      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                        Transcriber (STT)
                      </h3>
                      <Select
                        value={editDraft.transcriber ?? "deepgram"}
                        onValueChange={(v) => patch({ transcriber: v })}
                      >
                        <SelectTrigger className="h-9 text-sm bg-[hsl(var(--surface-1))] border-[hsl(var(--border))]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TRANSCRIBERS.map((t) => (
                            <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <div className="mt-3">
                        <Label className="text-xs text-muted-foreground mb-1.5 block">Language</Label>
                        <Select
                          value={editDraft.language ?? "en"}
                          onValueChange={(v) => patch({ language: v })}
                        >
                          <SelectTrigger className="h-9 text-sm bg-[hsl(var(--surface-1))] border-[hsl(var(--border))]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {LANGUAGES.map((l) => (
                              <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </section>
                  </div>
                )}

                {/* ── KNOWLEDGE TAB ──────────────────────────────────────── */}
                {activeTab === "Knowledge" && (
                  <div className="p-6 max-w-2xl mx-auto space-y-6">
                    {/* Linked connectors */}
                    <section>
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            CRM / ERP Connectors
                          </h3>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Link live data sources this agent can query
                          </p>
                        </div>
                        <Badge className="text-[10px] bg-[hsl(var(--cyan)/0.1)] text-[hsl(var(--cyan))] border-[hsl(var(--cyan)/0.3)]">
                          {(editDraft.connector_ids ?? []).length} linked
                        </Badge>
                      </div>

                      {/* Linked connectors */}
                      {(editDraft.connector_ids ?? []).length > 0 && (
                        <div className="space-y-1.5 mb-3">
                          {(editDraft.connector_ids ?? []).map((cid) => {
                            const conn = connectors.find((c) => c.id === cid);
                            if (!conn) return null;
                            return (
                              <div key={cid} className="flex items-center justify-between px-3 py-2 rounded-lg bg-[hsl(var(--emerald)/0.06)] border border-[hsl(var(--emerald)/0.2)]">
                                <div className="flex items-center gap-2">
                                  <Database size={12} className="text-[hsl(var(--emerald))]" />
                                  <span className="text-xs font-medium">{conn.connector_name}</span>
                                  <Badge className="text-[9px] bg-[hsl(var(--surface-2))] text-muted-foreground border-transparent">
                                    {conn.connector_type}
                                  </Badge>
                                </div>
                                <button
                                  onClick={() => unlinkConnector(cid)}
                                  className="text-muted-foreground hover:text-destructive transition-colors"
                                >
                                  <X size={13} />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Available connectors */}
                      <div className="border border-[hsl(var(--border))] rounded-xl overflow-hidden">
                        <div className="px-3 py-2 bg-[hsl(var(--surface-1))] border-b border-[hsl(var(--border))]">
                          <span className="text-[11px] text-muted-foreground font-medium">Available connectors</span>
                        </div>
                        {connectors.filter((c) => !(editDraft.connector_ids ?? []).includes(c.id)).length === 0 ? (
                          <div className="px-4 py-6 text-center">
                            <p className="text-xs text-muted-foreground">
                              All connectors linked, or none created yet.{" "}
                              <a href="/connectors" className="text-[hsl(var(--cyan))] hover:underline">
                                Add a connector →
                              </a>
                            </p>
                          </div>
                        ) : (
                          <div className="divide-y divide-[hsl(var(--border))]">
                            {connectors
                              .filter((c) => !(editDraft.connector_ids ?? []).includes(c.id))
                              .map((conn) => (
                                <div key={conn.id} className="flex items-center justify-between px-3 py-2.5 hover:bg-[hsl(var(--surface-2))] transition-colors">
                                  <div className="flex items-center gap-2">
                                    <Database size={12} className="text-muted-foreground" />
                                    <span className="text-xs">{conn.connector_name}</span>
                                    <Badge className="text-[9px] bg-[hsl(var(--surface-2))] text-muted-foreground border-transparent">
                                      {conn.connector_type}
                                    </Badge>
                                  </div>
                                  <button
                                    onClick={() => linkConnector(conn.id)}
                                    className="flex items-center gap-1 text-xs text-[hsl(var(--cyan))] hover:underline"
                                  >
                                    <LinkIcon size={11} /> Link
                                  </button>
                                </div>
                              ))}
                          </div>
                        )}
                      </div>
                    </section>

                    <div className="border-t border-[hsl(var(--border))]" />

                    {/* Knowledge base documents */}
                    <section>
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            Knowledge Base Documents
                          </h3>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Documents this agent searches for answers
                          </p>
                        </div>
                        <Badge className="text-[10px] bg-[hsl(var(--violet)/0.1)] text-[hsl(var(--violet))] border-[hsl(var(--violet)/0.3)]">
                          {(editDraft.kb_document_ids ?? []).length} docs
                        </Badge>
                      </div>

                      {/* Linked docs */}
                      {(editDraft.kb_document_ids ?? []).length > 0 && (
                        <div className="space-y-1.5 mb-3">
                          {(editDraft.kb_document_ids ?? []).map((did) => {
                            const doc = kbDocs.find((d) => d.id === did);
                            if (!doc) return null;
                            return (
                              <div key={did} className="flex items-center justify-between px-3 py-2 rounded-lg bg-[hsl(var(--violet)/0.06)] border border-[hsl(var(--violet)/0.2)]">
                                <div className="flex items-center gap-2">
                                  <FileText size={12} className="text-[hsl(var(--violet))]" />
                                  <span className="text-xs font-medium truncate max-w-[200px]">{doc.title}</span>
                                  <Badge className={cn(
                                    "text-[9px] border-transparent",
                                    doc.status === "ready"
                                      ? "bg-[hsl(var(--emerald)/0.1)] text-[hsl(var(--emerald))]"
                                      : "bg-[hsl(var(--amber)/0.1)] text-[hsl(var(--amber))]"
                                  )}>
                                    {doc.status}
                                  </Badge>
                                </div>
                                <button
                                  onClick={() => unlinkKb(did)}
                                  className="text-muted-foreground hover:text-destructive transition-colors"
                                >
                                  <X size={13} />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Upload new */}
                      <div
                        className="border-2 border-dashed border-[hsl(var(--border))] rounded-xl p-5 text-center cursor-pointer hover:border-[hsl(var(--violet)/0.4)] hover:bg-[hsl(var(--violet)/0.03)] transition-all mb-3"
                        onClick={() => fileInputRef.current?.click()}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          const f = e.dataTransfer.files[0];
                          if (f) handleFileUpload(f);
                        }}
                      >
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept=".txt,.md,.json,.csv,.html,.pdf"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handleFileUpload(f);
                          }}
                        />
                        {uploading ? (
                          <div className="flex items-center justify-center gap-2 py-1">
                            <Loader2 size={16} className="animate-spin text-[hsl(var(--violet))]" />
                            <span className="text-sm text-[hsl(var(--violet))]">Uploading & processing...</span>
                          </div>
                        ) : (
                          <>
                            <Upload size={20} className="mx-auto text-muted-foreground mb-2" />
                            <p className="text-xs font-medium text-foreground">
                              Drop file or click to upload
                            </p>
                            <p className="text-[11px] text-muted-foreground mt-1">
                              PDF, TXT, MD, JSON, CSV, HTML supported
                            </p>
                          </>
                        )}
                      </div>

                      {/* Available docs */}
                      <div>
                        <Input
                          placeholder="Search documents..."
                          value={kbSearch}
                          onChange={(e) => setKbSearch(e.target.value)}
                          className="h-8 text-xs mb-2 bg-[hsl(var(--surface-1))] border-[hsl(var(--border))]"
                        />
                        <div className="border border-[hsl(var(--border))] rounded-xl overflow-hidden">
                          <div className="px-3 py-2 bg-[hsl(var(--surface-1))] border-b border-[hsl(var(--border))]">
                            <span className="text-[11px] text-muted-foreground font-medium">
                              All documents ({kbDocs.length})
                            </span>
                          </div>
                          <div className="max-h-48 overflow-y-auto divide-y divide-[hsl(var(--border))]">
                            {kbDocs
                              .filter((d) =>
                                d.title.toLowerCase().includes(kbSearch.toLowerCase()) &&
                                !(editDraft.kb_document_ids ?? []).includes(d.id)
                              )
                              .map((doc) => (
                                <div key={doc.id} className="flex items-center justify-between px-3 py-2 hover:bg-[hsl(var(--surface-2))] transition-colors">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <FileText size={12} className="text-muted-foreground shrink-0" />
                                    <span className="text-xs truncate">{doc.title}</span>
                                  </div>
                                  <button
                                    onClick={() => linkKb(doc.id)}
                                    className="flex items-center gap-1 text-xs text-[hsl(var(--cyan))] hover:underline shrink-0"
                                  >
                                    <LinkIcon size={11} /> Add
                                  </button>
                                </div>
                              ))}
                            {kbDocs.filter((d) =>
                              !(editDraft.kb_document_ids ?? []).includes(d.id) &&
                              d.title.toLowerCase().includes(kbSearch.toLowerCase())
                            ).length === 0 && (
                              <div className="px-4 py-6 text-center">
                                <p className="text-xs text-muted-foreground">
                                  {kbDocs.length === 0
                                    ? "No documents yet. Upload one above."
                                    : "All documents linked."}
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </section>
                  </div>
                )}

                {/* ── TESTING TAB ────────────────────────────────────────── */}
                {activeTab === "Testing" && (
                  <div className="h-full flex flex-col">

                    {/* ── Mode switcher ─────────────────────────────────────── */}
                    <div className="flex items-center gap-1 px-6 py-3 border-b border-[hsl(var(--border))] bg-[hsl(var(--surface-0))]">
                      <button
                        onClick={() => setTestMode("browser")}
                        className={cn(
                          "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                          testMode === "browser"
                            ? "bg-[hsl(var(--cyan)/0.12)] text-[hsl(var(--cyan))] border border-[hsl(var(--cyan)/0.3)]"
                            : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        <MessageSquare size={12} /> Browser Test
                      </button>
                      <button
                        onClick={() => { setTestMode("realcall"); if (testSessionActive) endTestSession(); }}
                        className={cn(
                          "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                          testMode === "realcall"
                            ? "bg-[hsl(var(--emerald)/0.12)] text-[hsl(var(--emerald))] border border-[hsl(var(--emerald)/0.3)]"
                            : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        <Phone size={12} /> Real Phone Call
                      </button>

                      {/* Right side: latency / model info (browser mode only) */}
                      {testMode === "browser" && (
                        <div className="ml-auto flex items-center gap-3">
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock size={11} />
                            <span className={cn(
                              "font-mono font-semibold",
                              avgLatency === null ? "text-muted-foreground" :
                              avgLatency < 1000 ? "text-[hsl(var(--emerald))]" :
                              avgLatency < 2000 ? "text-[hsl(var(--amber))]" : "text-destructive"
                            )}>
                              {avgLatency !== null ? `${avgLatency}ms` : "—"}
                            </span>
                          </span>
                          <span className="font-mono text-[10px] text-[hsl(var(--cyan))]">{editDraft.model_id ?? "gemini-2.5-flash"}</span>
                          {isSpeaking && (
                            <button onClick={stopSpeaking} className="flex items-center gap-1 text-xs text-[hsl(var(--amber))] hover:underline">
                              <VolumeX size={11} /> Stop
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* ════════════════════════════════════════════════════════ */}
                    {/* BROWSER TEST MODE                                        */}
                    {/* ════════════════════════════════════════════════════════ */}
                    {testMode === "browser" && (
                      <>
                        {/* ElevenLabs warning */}
                        {editDraft.voice_provider === "elevenlabs" && (
                          <div className="mx-6 mt-2 space-y-1.5">
                            <div className="px-3 py-2 rounded-lg bg-amber-500/5 border border-amber-500/20 text-[11px] text-amber-400 flex items-start gap-2">
                              <AlertTriangle size={11} className="mt-0.5 shrink-0" />
                              <span>
                                <strong>ElevenLabs Free Tier blocked</strong> — Upgrade at{" "}
                                <a href="https://elevenlabs.io/pricing" target="_blank" rel="noreferrer" className="underline">elevenlabs.io/pricing</a>
                                {" "}or disable VPN. Browser TTS active as fallback.
                              </span>
                            </div>
                          </div>
                        )}

                        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3" style={{ minHeight: 0 }}>
                          {!testSessionActive ? (
                            <div className="flex flex-col items-center justify-center h-full pb-8">
                              <div className="relative mb-6">
                                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[hsl(var(--cyan)/0.2)] to-[hsl(var(--violet)/0.2)] border border-[hsl(var(--cyan)/0.25)] flex items-center justify-center">
                                  <Bot size={36} className="text-[hsl(var(--cyan))]" />
                                </div>
                                <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-[hsl(var(--surface-1))] border border-[hsl(var(--border))] flex items-center justify-center">
                                  <span className="text-[8px]">🎙</span>
                                </div>
                              </div>
                              <h3 className="text-base font-semibold mb-1" style={{ fontFamily: "Syne, sans-serif" }}>{editDraft.name ?? "AI Agent"}</h3>
                              <p className="text-xs text-muted-foreground mb-5 text-center max-w-xs">
                                Chat with your agent in the browser. Uses microphone + TTS.
                              </p>
                              <Button onClick={startTestSession} className="bg-[hsl(var(--cyan))] text-[hsl(var(--surface-0))] hover:bg-[hsl(var(--cyan)/0.85)] px-6">
                                <Play size={14} className="mr-1.5" /> Start Session
                              </Button>
                              {editDraft.agent_speaks_first && editDraft.first_message && (
                                <div className="mt-4 text-xs text-muted-foreground text-center">
                                  Greeting: <span className="italic">&ldquo;{editDraft.first_message}&rdquo;</span>
                                </div>
                              )}
                            </div>
                          ) : (
                            <>
                              <div className="flex items-center justify-center gap-4 py-3 rounded-xl bg-[hsl(var(--surface-1))] border border-[hsl(var(--border))]">
                                <div className="flex items-center gap-2"><span className="text-xs text-muted-foreground">You</span><Waveform active={isListening} color="cyan" /></div>
                                <div className="w-px h-6 bg-[hsl(var(--border))]" />
                                <div className="flex items-center gap-2"><Waveform active={isSpeaking} color="violet" /><span className="text-xs text-muted-foreground">Agent</span></div>
                              </div>
                              {chatMessages.map((msg) => (
                                <motion.div key={msg.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
                                  <div className={cn("max-w-[80%] px-3.5 py-2.5 rounded-2xl text-sm", msg.role === "user" ? "bg-[hsl(var(--cyan)/0.12)] border border-[hsl(var(--cyan)/0.2)] rounded-tr-sm" : "bg-[hsl(var(--surface-2))] border border-[hsl(var(--border))] rounded-tl-sm")}>
                                    <p className="leading-relaxed">{msg.text}</p>
                                    <div className="flex items-center gap-2 mt-1">
                                      <span className="text-[10px] text-muted-foreground">{msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
                                      {msg.latencyMs && <span className="text-[10px] text-[hsl(var(--emerald))]">{msg.latencyMs}ms</span>}
                                    </div>
                                  </div>
                                </motion.div>
                              ))}
                              {chatSending && (
                                <div className="flex justify-start">
                                  <div className="px-3.5 py-2.5 rounded-2xl rounded-tl-sm bg-[hsl(var(--surface-2))] border border-[hsl(var(--border))]">
                                    <div className="flex gap-1 items-center h-4">
                                      {[0,1,2].map((i) => <motion.div key={i} className="w-1.5 h-1.5 rounded-full bg-muted-foreground" animate={{ opacity:[0.3,1,0.3], y:[0,-3,0] }} transition={{ duration:0.8, repeat:Infinity, delay:i*0.2 }} />)}
                                    </div>
                                  </div>
                                </div>
                              )}
                              <div ref={chatEndRef} />
                            </>
                          )}
                        </div>

                        {testSessionActive && (
                          <div className="border-t border-[hsl(var(--border))] px-6 py-3 bg-[hsl(var(--surface-0))]">
                            {micError && <div className="flex items-center gap-2 text-xs text-[hsl(var(--amber))] mb-2"><AlertTriangle size={12} /> {micError}</div>}
                            <div className="flex items-center gap-2">
                              <button onMouseDown={startListening} onMouseUp={stopListening} onTouchStart={startListening} onTouchEnd={stopListening} disabled={chatSending}
                                className={cn("w-10 h-10 rounded-full flex items-center justify-center transition-all shrink-0", isListening ? "bg-[hsl(var(--rose))] text-white animate-pulse shadow-[0_0_16px_hsl(var(--rose)/0.5)]" : "bg-[hsl(var(--surface-2))] text-muted-foreground hover:bg-[hsl(var(--surface-3))] border border-[hsl(var(--border))]")}>
                                {isListening ? <Mic size={16} /> : <MicOff size={16} />}
                              </button>
                              <Input value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChatMessage(chatInput); } }} placeholder="Type or hold mic to speak..." disabled={chatSending || isListening} className="flex-1 h-10 bg-[hsl(var(--surface-1))] border-[hsl(var(--border))] text-sm" />
                              <button onClick={() => sendChatMessage(chatInput)} disabled={!chatInput.trim() || chatSending} className={cn("w-10 h-10 rounded-full flex items-center justify-center transition-all shrink-0", chatInput.trim() && !chatSending ? "bg-[hsl(var(--cyan))] text-[hsl(var(--surface-0))]" : "bg-[hsl(var(--surface-2))] text-muted-foreground border border-[hsl(var(--border))]")}>
                                {chatSending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                              </button>
                              <button onClick={endTestSession} className="w-10 h-10 rounded-full flex items-center justify-center bg-destructive/10 text-destructive hover:bg-destructive/20 border border-destructive/20 shrink-0">
                                <Square size={14} />
                              </button>
                            </div>
                            <p className="text-[10px] text-muted-foreground text-center mt-2">Hold mic · Enter to send · □ end</p>
                          </div>
                        )}
                      </>
                    )}

                    {/* ════════════════════════════════════════════════════════ */}
                    {/* REAL PHONE CALL MODE                                     */}
                    {/* ════════════════════════════════════════════════════════ */}
                    {testMode === "realcall" && (
                      <div className="flex-1 overflow-y-auto">
                        {outboundStatus === "idle" ? (
                          /* ── Dial form ─────────────────────────────────────── */
                          <div className="p-6 max-w-md mx-auto">
                            {/* Agent card */}
                            <div className="mb-6 flex items-center gap-3 px-4 py-3 rounded-xl bg-[hsl(var(--surface-1))] border border-[hsl(var(--border))]">
                              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[hsl(var(--emerald)/0.2)] to-[hsl(var(--cyan)/0.2)] border border-[hsl(var(--cyan)/0.2)] flex items-center justify-center shrink-0">
                                <Bot size={18} className="text-[hsl(var(--cyan))]" />
                              </div>
                              <div>
                                <p className="text-sm font-semibold">{editDraft.name ?? "AI Agent"}</p>
                                <p className="text-[11px] text-muted-foreground">{editDraft.language === "bn" ? "বাংলা" : "English"} · {editDraft.model_id ?? "gemini-2.5-flash"}</p>
                              </div>
                              <Badge className={cn("ml-auto text-[10px]", editDraft.status === "active" ? "bg-[hsl(var(--emerald)/0.1)] text-[hsl(var(--emerald))] border-[hsl(var(--emerald)/0.3)]" : "bg-muted text-muted-foreground")}>
                                {editDraft.status === "active" ? "● Active" : "○ Inactive"}
                              </Badge>
                            </div>

                            <div className="space-y-4">
                              <div>
                                <Label className="text-xs text-muted-foreground uppercase tracking-wider mb-2 block">
                                  Customer Phone Number
                                </Label>
                                <div className="relative">
                                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-mono">🇧🇩</span>
                                  <Input
                                    value={outboundPhone}
                                    onChange={(e) => setOutboundPhone(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === "Enter") startOutboundCall(); }}
                                    placeholder="01XXXXXXXXX or +8801XXXXXXXXX"
                                    className="pl-10 font-mono text-sm bg-[hsl(var(--surface-1))] border-[hsl(var(--border))]"
                                  />
                                </div>
                                <p className="text-[10px] text-muted-foreground mt-1">
                                  Accepts 01XXXXXXXXX (auto-formats to +880) or full E.164 format
                                </p>
                              </div>

                              {outboundError && (
                                <div className="space-y-2">
                                  <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-destructive/5 border border-destructive/20 text-xs text-destructive">
                                    <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                                    <span>{outboundError}</span>
                                  </div>
                                  {outboundErrorHint && (
                                    <div className="px-3 py-2 rounded-lg bg-[hsl(var(--surface-2))] border border-[hsl(var(--border))] text-[11px] text-muted-foreground leading-relaxed">
                                      {outboundErrorHint}
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* Warning if agent inactive */}
                              {editDraft.status !== "active" && (
                                <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-500/5 border border-amber-500/20 text-[11px] text-amber-400">
                                  <AlertTriangle size={11} className="mt-0.5 shrink-0" />
                                  Agent is inactive. Enable it in Settings before calling.
                                </div>
                              )}

                              <Button
                                onClick={startOutboundCall}
                                disabled={!outboundPhone.trim() || editDraft.status !== "active"}
                                className="w-full bg-[hsl(var(--emerald))] text-white hover:bg-[hsl(var(--emerald)/0.85)] h-11 text-sm font-semibold"
                              >
                                <><Phone size={16} className="mr-2" /> Make Outbound Call</>
                              </Button>

                              {/* Requirements checklist */}
                              <div className="pt-2 border-t border-[hsl(var(--border))] space-y-1.5">
                                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-2">Requirements</p>
                                {[
                                  { label: "TWILIO_WEBHOOK_BASE_URL set", ok: true },
                                  { label: "Agent is Active", ok: editDraft.status === "active" },
                                  { label: "Twilio phone number configured", ok: true },
                                  { label: "ngrok tunnel running (local dev)", ok: true },
                                ].map((item) => (
                                  <div key={item.label} className="flex items-center gap-2 text-[11px]">
                                    {item.ok ? (
                                      <CheckCircle2 size={11} className="text-[hsl(var(--emerald))]" />
                                    ) : (
                                      <AlertTriangle size={11} className="text-amber-400" />
                                    )}
                                    <span className={item.ok ? "text-muted-foreground" : "text-amber-400"}>{item.label}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        ) : (
                          /* ── Active/completed call panel ──────────────────── */
                          <div className="p-6 space-y-4">
                            {/* Call status card */}
                            <div className={cn(
                              "rounded-2xl border p-5 transition-all",
                              outboundStatus === "ringing"     && "bg-[hsl(var(--amber)/0.05)] border-[hsl(var(--amber)/0.3)]",
                              outboundStatus === "in-progress" && "bg-[hsl(var(--emerald)/0.05)] border-[hsl(var(--emerald)/0.3)]",
                              outboundStatus === "completed"   && "bg-[hsl(var(--surface-1))] border-[hsl(var(--border))]",
                              outboundStatus === "failed"      && "bg-destructive/5 border-destructive/30",
                              outboundStatus === "busy"        && "bg-destructive/5 border-destructive/20",
                              outboundStatus === "no-answer"   && "bg-[hsl(var(--amber)/0.05)] border-[hsl(var(--amber)/0.2)]",
                            )}>
                              <div className="flex items-center justify-between mb-4">
                                {/* Status badge + icon */}
                                <div className="flex items-center gap-3">
                                  <div className={cn(
                                    "w-12 h-12 rounded-2xl flex items-center justify-center",
                                    outboundStatus === "ringing"     && "bg-[hsl(var(--amber)/0.15)]",
                                    outboundStatus === "in-progress" && "bg-[hsl(var(--emerald)/0.15)]",
                                    outboundStatus === "completed"   && "bg-[hsl(var(--surface-2))]",
                                    outboundStatus === "failed"      && "bg-destructive/10",
                                    outboundStatus === "busy"        && "bg-destructive/10",
                                    outboundStatus === "no-answer"   && "bg-[hsl(var(--amber)/0.1)]",
                                  )}>
                                    {outboundStatus === "ringing"     && <Phone size={22} className="text-amber-400 animate-bounce" />}
                                    {outboundStatus === "in-progress" && <PhoneIncoming size={22} className="text-[hsl(var(--emerald))]" />}
                                    {outboundStatus === "completed"   && <PhoneOff size={22} className="text-muted-foreground" />}
                                    {(outboundStatus === "failed" || outboundStatus === "canceled") && <PhoneMissed size={22} className="text-destructive" />}
                                    {(outboundStatus === "busy" || outboundStatus === "no-answer") && <PhoneMissed size={22} className="text-amber-400" />}
                                  </div>
                                  <div>
                                    <p className="text-sm font-semibold">
                                      {outboundStatus === "ringing"     && "📞 Ringing…"}
                                      {outboundStatus === "in-progress" && "🟢 Call Connected"}
                                      {outboundStatus === "completed"   && "✅ Call Ended"}
                                      {outboundStatus === "failed"      && "❌ Call Failed"}
                                      {outboundStatus === "busy"        && "📵 Line Busy"}
                                      {outboundStatus === "no-answer"   && "🔇 No Answer"}
                                      {outboundStatus === "canceled"    && "🚫 Canceled"}
                                    </p>
                                    <p className="text-xs text-muted-foreground font-mono">{outboundPhone}</p>
                                  </div>
                                </div>

                                {/* Duration + hangup */}
                                <div className="flex items-center gap-3">
                                  {outboundStatus === "in-progress" && (
                                    <div className="text-center">
                                      <p className="text-xl font-mono font-bold text-[hsl(var(--emerald))]">{formatDuration(outboundElapsed)}</p>
                                      <p className="text-[10px] text-muted-foreground">duration</p>
                                    </div>
                                  )}
                                  {["ringing", "in-progress"].includes(outboundStatus) && (
                                    <button
                                      onClick={hangupOutboundCall}
                                      className="w-12 h-12 rounded-2xl bg-destructive/10 text-destructive hover:bg-destructive/20 border border-destructive/20 flex items-center justify-center transition-all"
                                      title="Hang up"
                                    >
                                      <PhoneOff size={20} />
                                    </button>
                                  )}
                                </div>
                              </div>

                              {/* Agent + caller info */}
                              <div className="grid grid-cols-2 gap-3">
                                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-black/10 dark:bg-white/5">
                                  <Bot size={14} className="text-[hsl(var(--cyan))] shrink-0" />
                                  <div>
                                    <p className="text-[10px] text-muted-foreground">AI Agent</p>
                                    <p className="text-xs font-medium">{outboundAgentName || editDraft.name}</p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-black/10 dark:bg-white/5">
                                  <User size={14} className="text-[hsl(var(--violet))] shrink-0" />
                                  <div>
                                    <p className="text-[10px] text-muted-foreground">Customer</p>
                                    <p className="text-xs font-medium font-mono">{outboundPhone}</p>
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Live transcript */}
                            {outboundTranscript.length > 0 && (
                              <div>
                                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-2 flex items-center gap-1">
                                  <Activity size={10} /> Live Transcript
                                </p>
                                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                                  {outboundTranscript.map((turn, i) => (
                                    <motion.div
                                      key={i}
                                      initial={{ opacity: 0, y: 6 }}
                                      animate={{ opacity: 1, y: 0 }}
                                      className={cn("flex", turn.role === "user" ? "justify-end" : "justify-start")}
                                    >
                                      <div className={cn(
                                        "max-w-[85%] px-3 py-2 rounded-xl text-sm",
                                        turn.role === "user"
                                          ? "bg-[hsl(var(--violet)/0.1)] border border-[hsl(var(--violet)/0.2)] rounded-tr-sm"
                                          : "bg-[hsl(var(--surface-2))] border border-[hsl(var(--border))] rounded-tl-sm"
                                      )}>
                                        <p className="text-[10px] text-muted-foreground mb-0.5 font-medium">
                                          {turn.role === "user" ? "👤 Customer" : `🤖 ${outboundAgentName || "Agent"}`}
                                        </p>
                                        <p className="leading-relaxed">{turn.text}</p>
                                      </div>
                                    </motion.div>
                                  ))}
                                  <div ref={outboundTranscriptEndRef} />
                                </div>
                              </div>
                            )}

                            {/* Waiting for transcript */}
                            {outboundStatus === "in-progress" && outboundTranscript.length === 0 && (
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Loader2 size={12} className="animate-spin" />
                                Waiting for conversation to begin…
                              </div>
                            )}

                            {/* New call button */}
                            {["completed", "failed", "busy", "no-answer", "canceled"].includes(outboundStatus) && (
                              <Button
                                onClick={resetOutboundCall}
                                variant="outline"
                                className="w-full border-[hsl(var(--border))] text-sm"
                              >
                                <RefreshCw size={14} className="mr-2" /> Make Another Call
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* ── ADVANCED TAB ───────────────────────────────────────── */}
                {activeTab === "Advanced" && (
                  <div className="p-6 max-w-2xl mx-auto space-y-6">
                    {/* Status */}
                    <section>
                      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                        Agent Status
                      </h3>
                      <div className="flex gap-2">
                        {(["active", "inactive"] as const).map((s) => (
                          <button
                            key={s}
                            onClick={() => patch({ status: s })}
                            className={cn(
                              "flex-1 py-2.5 rounded-xl border text-sm font-medium transition-all capitalize",
                              editDraft.status === s
                                ? s === "active"
                                  ? "bg-[hsl(var(--emerald)/0.1)] border-[hsl(var(--emerald)/0.3)] text-[hsl(var(--emerald))]"
                                  : "bg-[hsl(var(--muted))] border-[hsl(var(--border))] text-muted-foreground"
                                : "bg-[hsl(var(--surface-1))] border-[hsl(var(--border))] text-muted-foreground hover:text-foreground"
                            )}
                          >
                            {s === "active" ? "● Active" : "○ Inactive"}
                          </button>
                        ))}
                      </div>
                    </section>

                    <div className="border-t border-[hsl(var(--border))]" />

                    {/* Department */}
                    <section>
                      <Label className="text-xs text-muted-foreground uppercase tracking-wider mb-2 block">
                        Department / Category
                      </Label>
                      <Input
                        value={editDraft.department ?? ""}
                        onChange={(e) => patch({ department: e.target.value })}
                        placeholder="e.g. Support, Sales, Operations"
                        className="h-9 text-sm bg-[hsl(var(--surface-1))] border-[hsl(var(--border))]"
                      />
                    </section>

                    <div className="border-t border-[hsl(var(--border))]" />

                    {/* Escalation */}
                    <section>
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            Human Escalation
                          </h3>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Automatically transfer to a human agent when confidence drops
                          </p>
                        </div>
                        <Switch
                          checked={editDraft.escalation_enabled ?? false}
                          onCheckedChange={(v) => patch({ escalation_enabled: v })}
                        />
                      </div>

                      {editDraft.escalation_enabled && (
                        <div className="space-y-4">
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                                Confidence threshold
                              </Label>
                              <span className="text-xs font-mono text-[hsl(var(--amber))]">
                                {editDraft.confidence_threshold ?? 70}%
                              </span>
                            </div>
                            <Slider
                              min={0} max={100} step={5}
                              value={[editDraft.confidence_threshold ?? 70]}
                              onValueChange={([v]) => patch({ confidence_threshold: v })}
                            />
                            <p className="text-[10px] text-muted-foreground mt-1">
                              Escalate when AI confidence drops below this threshold
                            </p>
                          </div>
                        </div>
                      )}
                    </section>

                    <div className="border-t border-[hsl(var(--border))]" />

                    {/* Max turns */}
                    <section>
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <Label className="text-xs text-muted-foreground uppercase tracking-wider block">
                            Max Conversation Turns
                          </Label>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            Maximum back-and-forth exchanges before ending the call
                          </p>
                        </div>
                        <span className="text-xs font-mono text-[hsl(var(--cyan))]">
                          {editDraft.max_turns ?? 10}
                        </span>
                      </div>
                      <Slider
                        min={1} max={50} step={1}
                        value={[editDraft.max_turns ?? 10]}
                        onValueChange={([v]) => patch({ max_turns: v })}
                      />
                    </section>

                    <div className="border-t border-[hsl(var(--border))]" />

                    {/* Persona prompt */}
                    <section>
                      <Label className="text-xs text-muted-foreground uppercase tracking-wider mb-2 block">
                        Persona / Background
                      </Label>
                      <p className="text-xs text-muted-foreground mb-2">
                        Optional deeper context about the agent&apos;s personality and background
                      </p>
                      <Textarea
                        value={editDraft.persona_prompt ?? ""}
                        onChange={(e) => patch({ persona_prompt: e.target.value })}
                        placeholder="The agent speaks in a calm, professional tone. They have expert knowledge about..."
                        className="min-h-[100px] text-sm bg-[hsl(var(--surface-1))] border-[hsl(var(--border))] resize-y"
                      />
                    </section>

                    <div className="border-t border-[hsl(var(--border))]" />

                    {/* Agent info */}
                    <section className="rounded-xl bg-[hsl(var(--surface-1))] border border-[hsl(var(--border))] p-4 space-y-2">
                      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                        Agent Info
                      </h3>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="text-muted-foreground">ID</div>
                        <div className="font-mono text-[10px] text-[hsl(var(--cyan))] truncate">{selectedAgent?.id}</div>
                        <div className="text-muted-foreground">Created</div>
                        <div>{selectedAgent ? new Date(selectedAgent.created_at).toLocaleDateString() : "—"}</div>
                        <div className="text-muted-foreground">Updated</div>
                        <div>{selectedAgent?.updated_at ? new Date(selectedAgent.updated_at).toLocaleDateString() : "—"}</div>
                        <div className="text-muted-foreground">Template</div>
                        <div className="capitalize">{selectedAgent?.template_id ?? "custom"}</div>
                      </div>
                    </section>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
