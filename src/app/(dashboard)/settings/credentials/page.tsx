"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  Key, CheckCircle2, AlertTriangle, RefreshCw, Eye, EyeOff,
  Activity, Database, Zap, Radio, Save, Info, ExternalLink, ArrowRight,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SettingRow {
  key: string;
  isSecret: boolean;
  isSet: boolean;
  source: "db" | "env" | "unset";
  value: string; // masked for secrets, plain for non-secrets
}

interface ServiceDef {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  color: "violet" | "cyan" | "emerald" | "amber";
  keys: { key: string; label: string; placeholder: string; helpUrl?: string }[];
  testEndpoint?: string;
}

interface ServiceStatus {
  status: "ok" | "error" | "unknown";
  latency?: number;
  message?: string;
}

// ─── Service definitions ──────────────────────────────────────────────────────

const SERVICES: ServiceDef[] = [
  {
    id: "gemini",
    label: "Gemini AI",
    description: "AI reasoning, voice responses, and embeddings (text-embedding-004 + gemini-2.5-flash)",
    icon: <Zap size={16} />,
    color: "violet",
    keys: [
      {
        key: "GOOGLE_GEMINI_API_KEY",
        label: "Gemini API Key",
        placeholder: "AIzaSy…",
        helpUrl: "https://aistudio.google.com/app/apikey",
      },
      {
        key: "GEMINI_MODEL",
        label: "Default Chat Model",
        placeholder: "gemini-2.5-flash",
      },
    ],
    testEndpoint: "/api/health/gemini",
  },
  {
    id: "twilio",
    label: "Twilio",
    description: "Inbound/outbound voice calls, TTS, and phone number routing",
    icon: <Radio size={16} />,
    color: "cyan",
    keys: [
      {
        key: "TWILIO_ACCOUNT_SID",
        label: "Account SID",
        placeholder: "AC…",
        helpUrl: "https://console.twilio.com/",
      },
      {
        key: "TWILIO_AUTH_TOKEN",
        label: "Auth Token",
        placeholder: "••••••••••••",
        helpUrl: "https://console.twilio.com/",
      },
      {
        key: "TWILIO_WEBHOOK_BASE_URL",
        label: "Webhook Base URL",
        placeholder: "https://your-domain.com",
      },
    ],
    testEndpoint: "/api/health/twilio",
  },
  {
    id: "supabase",
    label: "Supabase",
    description: "PostgreSQL database, vector store (pgvector), Realtime, and file storage",
    icon: <Database size={16} />,
    color: "emerald",
    keys: [
      {
        key: "NEXT_PUBLIC_SUPABASE_URL",
        label: "Project URL",
        placeholder: "https://xxxx.supabase.co",
        helpUrl: "https://supabase.com/dashboard/project/_/settings/api",
      },
      {
        key: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
        label: "Anon / Public Key",
        placeholder: "eyJ…",
        helpUrl: "https://supabase.com/dashboard/project/_/settings/api",
      },
      {
        key: "SUPABASE_SERVICE_ROLE_KEY",
        label: "Service Role Key",
        placeholder: "eyJ…",
        helpUrl: "https://supabase.com/dashboard/project/_/settings/api",
      },
    ],
    testEndpoint: "/api/health/supabase",
  },
];

// ─── Color helpers ────────────────────────────────────────────────────────────

const colorMap = {
  cyan:    { bg: "hsl(var(--cyan)/0.08)",    text: "hsl(var(--cyan))",    border: "hsl(var(--cyan)/0.2)"    },
  violet:  { bg: "hsl(var(--violet)/0.08)",  text: "hsl(var(--violet))",  border: "hsl(var(--violet)/0.2)"  },
  emerald: { bg: "hsl(var(--emerald)/0.08)", text: "hsl(var(--emerald))", border: "hsl(var(--emerald)/0.2)" },
  amber:   { bg: "hsl(var(--amber)/0.08)",   text: "hsl(var(--amber))",   border: "hsl(var(--amber)/0.2)"   },
};

// ─── Source badge ─────────────────────────────────────────────────────────────

function SourceBadge({ source }: { source: SettingRow["source"] }) {
  if (source === "db")
    return <Badge className="text-[9px] bg-[hsl(var(--violet)/0.15)] text-[hsl(var(--violet))] border-[hsl(var(--violet)/0.3)]">saved in DB</Badge>;
  if (source === "env")
    return <Badge className="text-[9px] bg-[hsl(var(--amber)/0.12)] text-[hsl(var(--amber))] border-[hsl(var(--amber)/0.3)]">from .env</Badge>;
  return <Badge variant="outline" className="text-[9px] text-muted-foreground">not set</Badge>;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function CredentialsPage() {
  const [rows, setRows] = useState<SettingRow[]>([]);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [testing, setTesting] = useState<Record<string, boolean>>({});
  const [statuses, setStatuses] = useState<Record<string, ServiceStatus>>({});
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  // ── Load current settings ──────────────────────────────────────────────────

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/settings/platform", { cache: "no-store" });
      const json = await res.json() as { settings?: SettingRow[] };
      setRows(json.settings ?? []);
    } catch {
      toast({ title: "Failed to load settings", variant: "destructive" });
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => { loadSettings(); }, [loadSettings]);

  // ── Helpers ────────────────────────────────────────────────────────────────

  const getRow = (key: string) => rows.find((r) => r.key === key);

  const getDisplayValue = (key: string) => {
    // If user is editing, show edit value; else show masked/plain from server
    if (key in edits) return edits[key];
    return getRow(key)?.value ?? "";
  };

  const toggleShow = (id: string) => setShowKeys((p) => ({ ...p, [id]: !p[id] }));

  const handleEdit = (key: string, value: string) => {
    setEdits((p) => ({ ...p, [key]: value }));
  };

  // ── Save a service's keys ──────────────────────────────────────────────────

  const handleSave = async (service: ServiceDef) => {
    const toSave: Record<string, string> = {};
    for (const { key } of service.keys) {
      const val = edits[key];
      if (val !== undefined && val.trim() !== "") {
        toSave[key] = val.trim();
      }
    }
    if (Object.keys(toSave).length === 0) {
      toast({ title: "Nothing to save", description: "Enter new values in the fields first." });
      return;
    }

    setSaving((p) => ({ ...p, [service.id]: true }));
    try {
      const res = await fetch("/api/settings/platform", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: toSave }),
      });
      const json = await res.json() as { ok?: boolean; error?: string; saved?: string[] };
      if (json.ok) {
        toast({ title: `${service.label} — saved`, description: `${json.saved?.length ?? 0} key(s) updated. Active immediately.` });
        // Clear edits for saved keys
        setEdits((p) => {
          const next = { ...p };
          for (const k of Object.keys(toSave)) delete next[k];
          return next;
        });
        await loadSettings(); // Refresh displayed values
      } else {
        toast({ title: "Save failed", description: json.error ?? "Unknown error", variant: "destructive" });
      }
    } catch {
      toast({ title: "Network error", variant: "destructive" });
    }
    setSaving((p) => ({ ...p, [service.id]: false }));
  };

  // ── Test a service connection ──────────────────────────────────────────────

  const handleTest = async (service: ServiceDef) => {
    if (!service.testEndpoint) return;
    setTesting((p) => ({ ...p, [service.id]: true }));
    const start = Date.now();
    try {
      const res = await fetch(service.testEndpoint, { cache: "no-store" });
      const latency = Date.now() - start;
      const json = await res.json() as { ok?: boolean; error?: string };
      const s: ServiceStatus = { status: json.ok ? "ok" : "error", latency, message: json.error };
      setStatuses((p) => ({ ...p, [service.id]: s }));
      if (json.ok) {
        toast({ title: `${service.label} — connected ✓`, description: `${latency}ms response time` });
      } else {
        toast({ title: `${service.label} — failed`, description: json.error ?? "Check credentials", variant: "destructive" });
      }
    } catch {
      const latency = Date.now() - start;
      setStatuses((p) => ({ ...p, [service.id]: { status: "error", latency, message: "Network error" } }));
      toast({ title: `${service.label} — unreachable`, variant: "destructive" });
    }
    setTesting((p) => ({ ...p, [service.id]: false }));
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 pb-16 max-w-3xl">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-bold" style={{ fontFamily: "Syne, sans-serif" }}>
          API Credentials
        </h1>
        <div className="text-sm text-muted-foreground mt-1 space-y-1">
          <span>Values saved here are stored securely in your database and take effect immediately — no server restart needed.</span>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[hsl(var(--amber))]">•</span>
            <span>Fields with</span>
            <Badge className="text-[9px] bg-[hsl(var(--violet)/0.15)] text-[hsl(var(--violet))] border-[hsl(var(--violet)/0.3)]">saved in DB</Badge>
            <span>override your <code className="font-mono text-[hsl(var(--cyan))]">.env.local</code>. Fields marked</span>
            <Badge className="text-[9px] bg-[hsl(var(--amber)/0.12)] text-[hsl(var(--amber))] border-[hsl(var(--amber)/0.3)]">from .env</Badge>
            <span>are read from environment variables.</span>
          </div>
        </div>
      </motion.div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <RefreshCw size={13} className="animate-spin" />
          Loading current settings…
        </div>
      )}

      {/* Service cards */}
      <div className="space-y-4">
        {SERVICES.filter((s) => s.keys.length > 0).map((service, i) => {
          const c = colorMap[service.color];
          const status = statuses[service.id];
          const hasDirtyField = service.keys.some(({ key }) => key in edits && edits[key].trim());

          return (
            <motion.div
              key={service.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.07 }}
            >
              <Card className="glass border-border">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                        style={{ background: c.bg, border: `1px solid ${c.border}` }}
                      >
                        <span style={{ color: c.text }}>{service.icon}</span>
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <CardTitle className="text-sm font-semibold" style={{ fontFamily: "Syne, sans-serif" }}>
                            {service.label}
                          </CardTitle>
                          {status?.status === "ok" && <CheckCircle2 size={13} className="text-[hsl(var(--emerald))]" />}
                          {status?.status === "error" && <AlertTriangle size={13} className="text-[hsl(var(--rose))]" />}
                          {status && (
                            <Badge
                              className={cn(
                                "text-[9px] font-mono",
                                status.status === "ok"
                                  ? "bg-[hsl(var(--emerald)/0.1)] text-[hsl(var(--emerald))] border-[hsl(var(--emerald)/0.3)]"
                                  : "bg-[hsl(var(--rose)/0.1)] text-[hsl(var(--rose))] border-[hsl(var(--rose)/0.3)]"
                              )}
                            >
                              {status.status === "ok" ? `${status.latency}ms` : "error"}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{service.description}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {service.testEndpoint && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="border-border text-xs gap-1.5 text-muted-foreground hover:text-foreground"
                          onClick={() => handleTest(service)}
                          disabled={testing[service.id]}
                        >
                          {testing[service.id] ? (
                            <RefreshCw size={11} className="animate-spin" />
                          ) : (
                            <Activity size={11} />
                          )}
                          Test
                        </Button>
                      )}
                      <Button
                        size="sm"
                        className={cn(
                          "text-xs gap-1.5",
                          hasDirtyField
                            ? "bg-[hsl(var(--cyan))] text-black hover:bg-[hsl(var(--cyan)/0.85)]"
                            : "bg-[hsl(var(--surface-2))] text-muted-foreground"
                        )}
                        onClick={() => handleSave(service)}
                        disabled={saving[service.id] || !hasDirtyField}
                      >
                        {saving[service.id] ? (
                          <RefreshCw size={11} className="animate-spin" />
                        ) : (
                          <Save size={11} />
                        )}
                        Save
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                <CardContent>
                  <div className="space-y-4">
                    {service.keys.map(({ key, label, placeholder, helpUrl }) => {
                      const row = getRow(key);
                      const isSecret = row?.isSecret ?? false;
                      const showId = `${service.id}-${key}`;
                      const isVisible = showKeys[showId];
                      const displayVal = getDisplayValue(key);
                      const isDirty = key in edits;

                      return (
                        <div key={key} className="space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <Label className="text-xs font-medium text-muted-foreground">
                              {label}
                            </Label>
                            <div className="flex items-center gap-1.5">
                              {row && <SourceBadge source={row.source} />}
                              <span className="text-[10px] font-mono text-muted-foreground/50">{key}</span>
                              {helpUrl && (
                                <a href={helpUrl} target="_blank" rel="noopener noreferrer" className="text-muted-foreground/40 hover:text-[hsl(var(--cyan))] transition-colors">
                                  <ExternalLink size={10} />
                                </a>
                              )}
                            </div>
                          </div>
                          <div className="relative">
                            <Input
                              type={isSecret && !isVisible ? "password" : "text"}
                              value={displayVal}
                              onChange={(e) => handleEdit(key, e.target.value)}
                              placeholder={placeholder}
                              className={cn(
                                "bg-[hsl(var(--surface-2))] border-border font-mono text-sm pr-10 transition-all",
                                isDirty && "border-[hsl(var(--cyan)/0.5)] ring-1 ring-[hsl(var(--cyan)/0.15)]"
                              )}
                            />
                            {isSecret && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                                onClick={() => toggleShow(showId)}
                                type="button"
                              >
                                {isVisible ? <EyeOff size={13} /> : <Eye size={13} />}
                              </Button>
                            )}
                          </div>
                          {isDirty && (
                            <p className="text-[10px] text-[hsl(var(--cyan))]">
                              ✎ Unsaved change — click Save to apply
                            </p>
                          )}
                          {!isDirty && row?.source === "env" && (
                            <p className="text-[10px] text-muted-foreground/60">
                              Currently reading from environment variable. Type a new value to override.
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* Telephony routing link */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <Card className="border-[hsl(var(--amber)/0.25)] bg-[hsl(var(--amber)/0.04)]">
          <CardContent className="py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              <strong className="text-foreground">Webhook URLs</strong> (Inbound Voice, Gather, Status Callback) are shown on the{" "}
              <strong className="text-foreground">Phone Number Routing</strong> page — not here.
            </p>
            <Button variant="outline" size="sm" className="shrink-0 border-[hsl(var(--amber)/0.4)] text-[hsl(var(--amber))] hover:bg-[hsl(var(--amber)/0.08)]" asChild>
              <Link href="/settings/telephony">
                Go to Routing <ArrowRight size={13} className="ml-1" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </motion.div>

      {/* Info note */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="glass rounded-xl p-4 flex items-start gap-3"
      >
        <Info size={14} className="text-[hsl(var(--cyan))] mt-0.5 shrink-0" />
        <div className="text-xs text-muted-foreground space-y-1">
          <p>
            <strong className="text-foreground">How it works:</strong> Values saved here are stored in the{" "}
            <code className="font-mono text-[hsl(var(--cyan))]">platform_settings</code> table in Supabase and take effect on the next API call — no restart needed.
          </p>
          <p>
            You can still set credentials in <code className="font-mono text-[hsl(var(--cyan))]">.env.local</code> as a fallback. DB values always take precedence.
          </p>
          <p>
            <strong className="text-foreground">First time?</strong> Run{" "}
            <code className="font-mono text-[hsl(var(--violet))]">docs/sql/V4_platform_settings.sql</code>{" "}
            in your Supabase SQL Editor before saving credentials.
          </p>
        </div>
      </motion.div>

      {/* .env template */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="glass rounded-xl p-5"
      >
        <div className="flex items-center gap-2 mb-3">
          <Key size={14} className="text-[hsl(var(--cyan))]" />
          <h3 className="text-sm font-semibold" style={{ fontFamily: "Syne, sans-serif" }}>.env.local Template</h3>
        </div>
        <div className="mb-3 border-t border-border opacity-30" />
        <pre className="text-xs font-mono text-muted-foreground bg-[hsl(var(--surface-0))] rounded-lg p-4 overflow-auto leading-relaxed">
{`# Gemini AI
GOOGLE_GEMINI_API_KEY=AIzaSy…
GEMINI_MODEL=gemini-2.5-flash

# Twilio
TWILIO_ACCOUNT_SID=AC…
TWILIO_AUTH_TOKEN=…
TWILIO_WEBHOOK_BASE_URL=https://your-domain.com

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ…
SUPABASE_SERVICE_ROLE_KEY=eyJ…`}
        </pre>
      </motion.div>
    </div>
  );
}
