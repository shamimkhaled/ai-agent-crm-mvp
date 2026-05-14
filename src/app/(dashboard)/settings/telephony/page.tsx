"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Phone, Plus, Trash2, Bot, RefreshCw, Copy, ArrowRight,
  Webhook, CheckCircle2, AlertCircle, Settings2, Save, Edit2, Globe,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PhoneNumberRow {
  id: string;
  e164: string;
  label?: string;
  provider_kind: string;
  ai_agent_id?: string;
  language?: string;
  tts_voice?: string;
  ai_agents?: { id: string; name: string; department?: string } | null;
}

interface AgentRow {
  id: string;
  name: string;
  department?: string;
  language?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function TelephonyPage() {
  const [phoneNumbers, setPhoneNumbers] = useState<PhoneNumberRow[]>([]);
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  // Add form
  const [newNumber, setNewNumber] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newProvider, setNewProvider] = useState("twilio");
  const [adding, setAdding] = useState(false);

  // Webhook base URL (editable inline)
  const [webhookBase, setWebhookBase] = useState("");
  const [editingBase, setEditingBase] = useState(false);
  const [savingBase, setSavingBase] = useState(false);

  const { toast } = useToast();
  const supabase = createClient();

  // ── Load phone numbers (via admin API to bypass RLS) ───────────────────────

  const loadNumbers = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/phone-numbers", { cache: "no-store" });
    const json = await res.json() as { data?: PhoneNumberRow[]; error?: string };
    if (json.error) {
      toast({ title: "Failed to load phone numbers", description: json.error, variant: "destructive" });
    } else {
      setPhoneNumbers(json.data ?? []);
    }
    setLoading(false);
  }, [toast]);

  // ── Load AI agents (read-only, anon ok) ────────────────────────────────────

  const loadAgents = useCallback(async () => {
    const { data } = await supabase
      .from("ai_agents")
      .select("id,name,department,language")
      .order("name");
    setAgents((data ?? []) as AgentRow[]);
  }, [supabase]);

  // ── Load saved webhook base URL ────────────────────────────────────────────

  const loadWebhookBase = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/platform", { cache: "no-store" });
      const json = await res.json() as { settings?: { key: string; value: string }[] };
      const saved = json.settings?.find((s) => s.key === "TWILIO_WEBHOOK_BASE_URL")?.value;
      setWebhookBase(saved && saved.startsWith("http") ? saved : window.location.origin);
    } catch {
      setWebhookBase(window.location.origin);
    }
  }, []);

  useEffect(() => {
    loadNumbers();
    loadAgents();
    loadWebhookBase();
  }, [loadNumbers, loadAgents, loadWebhookBase]);

  // ── Add phone number ────────────────────────────────────────────────────────

  const handleAdd = async () => {
    if (!newNumber.trim()) return;
    setAdding(true);
    const res = await fetch("/api/phone-numbers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ e164: newNumber.trim(), label: newLabel.trim(), provider_kind: newProvider }),
    });
    const json = await res.json() as { data?: PhoneNumberRow; error?: string };
    if (json.error) {
      toast({ title: "Failed to add number", description: json.error, variant: "destructive" });
    } else {
      toast({ title: "Phone number added" });
      setNewNumber("");
      setNewLabel("");
      await loadNumbers();
    }
    setAdding(false);
  };

  // ── Update agent assignment ─────────────────────────────────────────────────

  const handleAgentChange = async (phoneId: string, agentId: string) => {
    setSaving(phoneId);
    const res = await fetch(`/api/phone-numbers/${phoneId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ai_agent_id: agentId === "unassigned" ? "" : agentId }),
    });
    const json = await res.json() as { error?: string };
    if (json.error) {
      toast({ title: "Failed to update routing", description: json.error, variant: "destructive" });
    } else {
      toast({ title: "Routing updated" });
      setPhoneNumbers((prev) =>
        prev.map((p) =>
          p.id === phoneId
            ? {
                ...p,
                ai_agent_id: agentId === "unassigned" ? undefined : agentId,
                ai_agents: agentId === "unassigned"
                  ? null
                  : agents.find((a) => a.id === agentId)
                    ? { id: agentId, name: agents.find((a) => a.id === agentId)!.name }
                    : p.ai_agents,
              }
            : p
        )
      );
    }
    setSaving(null);
  };

  // ── Remove phone number ─────────────────────────────────────────────────────

  const handleDelete = async (phoneId: string) => {
    const res = await fetch(`/api/phone-numbers/${phoneId}`, { method: "DELETE" });
    const json = await res.json() as { error?: string };
    if (json.error) {
      toast({ title: "Failed to remove", description: json.error, variant: "destructive" });
    } else {
      toast({ title: "Number removed" });
      setPhoneNumbers((prev) => prev.filter((p) => p.id !== phoneId));
    }
  };

  // ── Save webhook base URL ───────────────────────────────────────────────────

  const handleSaveBase = async () => {
    if (!webhookBase.trim()) return;
    setSavingBase(true);
    const res = await fetch("/api/settings/platform", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings: { TWILIO_WEBHOOK_BASE_URL: webhookBase.trim() } }),
    });
    const json = await res.json() as { ok?: boolean; error?: string };
    if (json.ok) {
      toast({ title: "Webhook base URL saved", description: "All webhook URLs updated." });
      setEditingBase(false);
    } else {
      toast({ title: "Save failed", description: json.error, variant: "destructive" });
    }
    setSavingBase(false);
  };

  // ── Webhook URLs ────────────────────────────────────────────────────────────

  const webhooks = [
    { label: "Inbound Voice",   url: `${webhookBase}/api/webhooks/voice/inbound`, desc: "Set in Twilio → Phone Numbers → Voice URL (HTTP POST)" },
    { label: "Voice Gather",    url: `${webhookBase}/api/webhooks/voice/gather`,  desc: "Internal — Twilio redirects here after Speech-to-Text" },
    { label: "Call Status",     url: `${webhookBase}/api/webhooks/voice/status`,  desc: "Set in Twilio → Phone Numbers → Status Callback URL" },
  ];

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied to clipboard" });
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 pb-16 max-w-4xl">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-bold" style={{ fontFamily: "Syne, sans-serif" }}>
          Phone Number Routing
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Assign each Twilio number to an AI Voice Agent. Every inbound call is routed based on this table.
        </p>
      </motion.div>

      {/* Credentials banner */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 }}>
        <Card className="border-[hsl(var(--cyan)/0.25)] bg-[hsl(var(--cyan)/0.04)]">
          <CardContent className="py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Settings2 size={14} className="text-[hsl(var(--cyan))] shrink-0" />
              <span>
                <strong className="text-foreground">Twilio API keys</strong> (Account SID, Auth Token) are managed in{" "}
                <strong className="text-foreground">API Credentials</strong>.
              </span>
          </div>
            <Button variant="outline" size="sm" className="shrink-0 border-[hsl(var(--cyan)/0.35)] text-[hsl(var(--cyan))] hover:bg-[hsl(var(--cyan)/0.08)]" asChild>
              <Link href="/settings/credentials">
                API Credentials <ArrowRight size={12} className="ml-1" />
            </Link>
          </Button>
        </CardContent>
      </Card>
      </motion.div>

      {/* Phone number routing table */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
        <Card className="glass border-border">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Phone size={15} className="text-[hsl(var(--cyan))]" />
                <CardTitle className="text-sm font-semibold" style={{ fontFamily: "Syne, sans-serif" }}>
                  Number → Agent Routing
                </CardTitle>
                <Badge variant="outline" className="text-[10px] font-mono">{phoneNumbers.length} number{phoneNumbers.length !== 1 ? "s" : ""}</Badge>
              </div>
              <Button variant="ghost" size="sm" className="h-7 px-2 text-muted-foreground" onClick={loadNumbers} disabled={loading}>
                <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {/* Number list */}
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                <RefreshCw size={13} className="animate-spin" /> Loading numbers…
              </div>
            ) : phoneNumbers.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                <Phone size={28} className="mx-auto mb-2 opacity-20" />
                No phone numbers yet. Add your first Twilio number below.
              </div>
            ) : (
              <div className="space-y-2 mb-4">
                {phoneNumbers.map((pn) => {
                  const assigned = pn.ai_agents ?? agents.find((a) => a.id === pn.ai_agent_id);
                  return (
                    <div
                      key={pn.id}
                      className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-lg bg-[hsl(var(--surface-2))] px-4 py-3"
                    >
                      {/* Number + label + provider */}
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                          style={{
                            background: assigned ? "hsl(var(--cyan)/0.1)" : "hsl(var(--surface-0))",
                            border: `1px solid ${assigned ? "hsl(var(--cyan)/0.25)" : "hsl(var(--border))"}`,
                          }}
                        >
                          <Phone size={13} className={assigned ? "text-[hsl(var(--cyan))]" : "text-muted-foreground"} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-mono font-medium">{pn.e164}</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            {pn.label && <span className="text-xs text-muted-foreground">{pn.label}</span>}
                            <Badge variant="outline" className="text-[9px] font-mono py-0">{pn.provider_kind}</Badge>
                          </div>
                        </div>
                      </div>

                      {/* Arrow */}
                      <ArrowRight size={13} className="text-muted-foreground/30 shrink-0 hidden sm:block" />

                      {/* Agent selector */}
                      <div className="flex items-center gap-2 sm:w-64">
                        <Bot size={13} className="text-[hsl(var(--violet))] shrink-0" />
                        <Select
                          value={pn.ai_agent_id ?? "unassigned"}
                          onValueChange={(v) => handleAgentChange(pn.id, v)}
                          disabled={saving === pn.id}
                        >
                          <SelectTrigger className="h-8 text-xs bg-[hsl(var(--surface-0))] border-border flex-1">
                            <SelectValue placeholder="Assign agent…" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="unassigned">
                              <span className="text-muted-foreground">— No agent —</span>
                            </SelectItem>
                            {agents.map((a) => (
                              <SelectItem key={a.id} value={a.id}>
                                {a.name}
                                {a.department && (
                                  <span className="text-[10px] text-muted-foreground ml-1.5">· {a.department}</span>
                                )}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {saving === pn.id
                          ? <RefreshCw size={12} className="animate-spin text-[hsl(var(--cyan))] shrink-0" />
                          : assigned
                            ? <CheckCircle2 size={12} className="text-[hsl(var(--emerald))] shrink-0" />
                            : <AlertCircle size={12} className="text-[hsl(var(--amber))] shrink-0" />
                        }
                      </div>

                      {/* Delete */}
                      <Button
                        variant="ghost" size="sm"
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-[hsl(var(--rose))] shrink-0"
                        onClick={() => handleDelete(pn.id)}
                      >
                        <Trash2 size={13} />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Add number form */}
            <div className={`pt-4 border-t border-border ${phoneNumbers.length > 0 ? "" : "mt-0"}`}>
              <p className="text-xs text-muted-foreground mb-3 font-medium">Add Twilio number</p>
              <div className="flex flex-col sm:flex-row gap-2">
                <Input
                  value={newNumber}
                  onChange={(e) => setNewNumber(e.target.value)}
                  placeholder="+1 415 555 0100"
                  className="font-mono text-sm bg-[hsl(var(--surface-2))] border-border sm:w-44"
                  onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                />
                <Input
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="Label (e.g. Sales line)"
                  className="text-sm bg-[hsl(var(--surface-2))] border-border flex-1"
                  onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                />
                <Select value={newProvider} onValueChange={setNewProvider}>
                  <SelectTrigger className="h-9 text-xs bg-[hsl(var(--surface-2))] border-border w-28 shrink-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="twilio">Twilio</SelectItem>
                    <SelectItem value="plivo">Plivo</SelectItem>
                    <SelectItem value="telnyx">Telnyx</SelectItem>
                    <SelectItem value="exotel">Exotel</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  onClick={handleAdd}
                  disabled={adding || !newNumber.trim()}
                  size="sm"
                  className="gap-1.5 bg-[hsl(var(--cyan))] text-black hover:bg-[hsl(var(--cyan)/0.85)] shrink-0 h-9"
                >
                  {adding ? <RefreshCw size={12} className="animate-spin" /> : <Plus size={12} />}
                  Add
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Webhook URLs */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14 }}>
        <Card className="glass border-border">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <Webhook size={15} className="text-[hsl(var(--amber))]" />
                <CardTitle className="text-sm font-semibold" style={{ fontFamily: "Syne, sans-serif" }}>
                  Webhook URLs
                </CardTitle>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Copy these into <strong>Twilio Console → Phone Numbers → Active Numbers</strong> for each number.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">

            {/* Editable base URL */}
            <div className="rounded-lg bg-[hsl(var(--surface-2))] px-4 py-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Globe size={13} className="text-[hsl(var(--amber))]" />
                  <Label className="text-xs font-medium text-muted-foreground">
                    Public Base URL <span className="text-[hsl(var(--amber))]">*</span>
                  </Label>
                </div>
                {!editingBase && (
                  <Button
                    variant="ghost" size="sm"
                    className="h-6 px-2 text-[10px] gap-1 text-muted-foreground hover:text-foreground"
                    onClick={() => setEditingBase(true)}
                  >
                    <Edit2 size={10} /> Edit
                  </Button>
                )}
              </div>

              {editingBase ? (
                <div className="flex gap-2">
                  <Input
                    value={webhookBase}
                    onChange={(e) => setWebhookBase(e.target.value)}
                    placeholder="https://your-domain.com or https://xxxx.ngrok.io"
                    className="font-mono text-xs bg-[hsl(var(--surface-0))] border-[hsl(var(--cyan)/0.4)] ring-1 ring-[hsl(var(--cyan)/0.15)] h-8 flex-1"
                    onKeyDown={(e) => e.key === "Enter" && handleSaveBase()}
                    autoFocus
                  />
                  <Button
                    size="sm" className="h-8 gap-1 bg-[hsl(var(--cyan))] text-black hover:bg-[hsl(var(--cyan)/0.85)] shrink-0 text-xs"
                    onClick={handleSaveBase}
                    disabled={savingBase}
                  >
                    {savingBase ? <RefreshCw size={11} className="animate-spin" /> : <Save size={11} />}
                    Save
                  </Button>
                  <Button
                    variant="ghost" size="sm"
                    className="h-8 text-xs text-muted-foreground shrink-0"
                    onClick={() => { setEditingBase(false); loadWebhookBase(); }}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <code className="block text-xs font-mono text-[hsl(var(--cyan))] truncate">{webhookBase}</code>
              )}

              <p className="text-[10px] text-muted-foreground/60">
                Use your production domain or ngrok URL. <strong className="text-muted-foreground">localhost will not work</strong> with Twilio webhooks.
              </p>
            </div>

            {/* Generated webhook URLs */}
            <div className="space-y-2">
              {webhooks.map(({ label, url, desc }) => (
                <div key={label} className="rounded-lg bg-[hsl(var(--surface-2))] px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-28 shrink-0 font-medium">{label}</span>
                    <code className="text-xs font-mono text-[hsl(var(--cyan))] flex-1 truncate">{url}</code>
                    <Button
                      variant="ghost" size="sm"
                      className="h-6 px-2 text-[10px] text-muted-foreground hover:text-foreground shrink-0 gap-1"
                      onClick={() => copy(url)}
                    >
                      <Copy size={9} /> Copy
                    </Button>
                  </div>
                  <p className="text-[10px] text-muted-foreground/60 mt-1 ml-[7.5rem]">{desc}</p>
                </div>
              ))}
            </div>

            <div className="rounded-lg bg-[hsl(var(--amber)/0.06)] border border-[hsl(var(--amber)/0.2)] px-4 py-3 text-xs text-muted-foreground">
              <span className="text-[hsl(var(--amber))] font-medium">Twilio setup:</span>{" "}
              In the Twilio Console, go to <strong>Phone Numbers → Manage → Active numbers</strong>,
              click a number, set <em>Voice &amp; Fax → "A call comes in"</em> to the{" "}
              <strong>Inbound Voice</strong> URL above (Webhook, HTTP POST), and set
              <em> Status Callback URL</em> to the <strong>Call Status</strong> URL.
            </div>
        </CardContent>
      </Card>
      </motion.div>

      {/* Quick links */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.22 }}>
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" size="sm" className="gap-1.5 border-border text-muted-foreground" asChild>
            <Link href="/settings/credentials"><Settings2 size={12} /> API Credentials</Link>
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5 border-border text-muted-foreground" asChild>
            <Link href="/agents"><Bot size={12} /> Manage AI Agents</Link>
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5 border-border text-muted-foreground" asChild>
            <Link href="/calls"><Phone size={12} /> Live Calls</Link>
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
