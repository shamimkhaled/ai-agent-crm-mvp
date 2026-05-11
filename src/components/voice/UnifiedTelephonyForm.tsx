"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  UNIFIED_TELEPHONY_OPTIONS,
  storeKindFromUnified,
  type UnifiedTelephonyId,
} from "@/lib/telephonyProviders";
import {
  useVoicePlatformStore,
  type TelephonyConnectionStatus,
  type ProviderKind,
} from "@/store/voicePlatformStore";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Activity,
  CheckCircle2,
  ChevronRight,
  Copy,
  Loader2,
  Phone,
  Plus,
  Radio,
  Trash2,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = [
  { id: 1, title: "Choose carrier", hint: "Pick who routes your phone calls." },
  { id: 2, title: "Connect account", hint: "Paste API keys — stored in this browser for MVP." },
  { id: 3, title: "Numbers & webhooks", hint: "Tell the carrier where to send events." },
] as const;

function statusBadge(status: TelephonyConnectionStatus) {
  switch (status) {
    case "connected":
      return (
        <Badge className="bg-emerald-600 hover:bg-emerald-600 gap-1">
          <CheckCircle2 className="h-3 w-3" /> Live OK
        </Badge>
      );
    case "error":
      return (
        <Badge variant="destructive" className="gap-1">
          <XCircle className="h-3 w-3" /> Check credentials
        </Badge>
      );
    case "testing":
      return (
        <Badge variant="secondary" className="gap-1">
          <Loader2 className="h-3 w-3 animate-spin" /> Testing…
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className="text-muted-foreground">
          Not tested yet
        </Badge>
      );
  }
}

export function UnifiedTelephonyForm() {
  const [providerId, setProviderId] = useState<UnifiedTelephonyId>("twilio");
  const [step, setStep] = useState(1);
  const [origin, setOrigin] = useState("");
  const { toast } = useToast();

  const storeKind = useMemo(() => storeKindFromUnified(providerId), [providerId]);
  const providers = useVoicePlatformStore((s) => s.providers);
  const provider = providers.find((p) => p.kind === storeKind)!;
  const {
    setProviderField,
    toggleProvider,
    addPhoneNumber,
    removePhoneNumber,
    updatePhoneAgent,
    appendWebhookLog,
    recordTelephonyTest,
    agents,
  } = useVoicePlatformStore();

  const [newE164, setNewE164] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    setOrigin(typeof window !== "undefined" ? window.location.origin : "");
  }, []);

  const suggestedVoiceUrl = origin ? `${origin}/api/webhooks/voice/inbound` : "";
  const suggestedStatusUrl = origin ? `${origin}/api/webhooks/voice/status` : "";
  const suggestedWaUrl = origin ? `${origin}/api/webhooks/whatsapp` : "";

  const applySuggestedWebhooks = () => {
    if (!suggestedVoiceUrl) return;
    setProviderField(storeKind, {
      voiceWebhookUrl: suggestedVoiceUrl,
      statusCallbackUrl: suggestedStatusUrl,
      whatsappWebhookUrl: suggestedWaUrl,
    });
    toast({ title: "Webhooks filled", description: "URLs match this deployment’s origin." });
  };

  const copy = (text: string) => {
    void navigator.clipboard.writeText(text);
    toast({ title: "Copied", description: "Paste into your carrier console." });
  };

  const handleSave = () => {
    toast({
      title: "Configuration saved",
      description: `${provider.displayName} settings are stored in this browser (Zustand persist).`,
    });
  };

  const runLiveTest = async () => {
    setTesting(true);
    setProviderField(storeKind, { connectionStatus: "testing" });
    const t0 = performance.now();
    try {
      const res = await fetch("/api/telephony/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: providerId,
          accountSid: provider.accountSid,
          authToken: provider.authToken,
          apiKey: provider.apiKey,
          apiSecret: provider.apiSecret,
        }),
      });
      const data = await res.json();
      const latency = Math.round(performance.now() - t0);
      recordTelephonyTest(storeKind, {
        ok: !!data.ok,
        latencyMs: data.latencyMs ?? latency,
        message: data.message ?? "",
      });
      appendWebhookLog({
        provider: storeKind as ProviderKind,
        method: "POST",
        path: "/api/telephony/test",
        status: res.status,
        latencyMs: data.latencyMs ?? latency,
        payloadPreview: JSON.stringify({ provider: providerId, ok: data.ok }).slice(0, 160),
      });
      toast({
        title: data.ok ? "Live connection succeeded" : "Connection failed",
        description: data.message ?? `${data.latencyMs ?? latency}ms`,
        variant: data.ok ? "default" : "destructive",
      });
    } catch (e) {
      recordTelephonyTest(storeKind, {
        ok: false,
        latencyMs: Math.round(performance.now() - t0),
        message: e instanceof Error ? e.message : "Request failed",
      });
      toast({ title: "Test failed", variant: "destructive" });
    } finally {
      setTesting(false);
    }
  };

  const fieldGroups = () => {
    if (providerId === "twilio") {
      return (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label>Account SID</Label>
            <Input
              placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              value={provider.accountSid}
              onChange={(e) => setProviderField(storeKind, { accountSid: e.target.value })}
              className="font-mono text-sm"
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Auth token</Label>
            <Input
              type="password"
              placeholder="Your Twilio auth token"
              value={provider.authToken}
              onChange={(e) => setProviderField(storeKind, { authToken: e.target.value })}
              className="font-mono text-sm"
            />
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Tip: you can also set <code className="rounded bg-muted px-1">TWILIO_ACCOUNT_SID</code> and{" "}
              <code className="rounded bg-muted px-1">TWILIO_AUTH_TOKEN</code> in{" "}
              <code className="rounded bg-muted px-1">.env</code> so tests work without pasting in the
              browser.
            </p>
          </div>
        </div>
      );
    }
    if (providerId === "plivo") {
      return (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Auth ID</Label>
            <Input
              placeholder="MAxxxxxxxx"
              value={provider.accountSid}
              onChange={(e) => setProviderField(storeKind, { accountSid: e.target.value })}
              className="font-mono text-sm"
            />
          </div>
          <div className="space-y-2">
            <Label>Auth token</Label>
            <Input
              type="password"
              value={provider.authToken}
              onChange={(e) => setProviderField(storeKind, { authToken: e.target.value })}
              className="font-mono text-sm"
            />
          </div>
        </div>
      );
    }
    if (providerId === "telnyx") {
      return (
        <div className="space-y-2 max-w-xl">
          <Label>API key (V2)</Label>
          <Input
            type="password"
            placeholder="KEYxxxxxxxx…"
            value={provider.apiKey}
            onChange={(e) => setProviderField(storeKind, { apiKey: e.target.value })}
            className="font-mono text-sm"
          />
          <p className="text-[11px] text-muted-foreground">
            Or set <code className="rounded bg-muted px-1">TELNYX_API_KEY</code> in server{" "}
            <code className="rounded bg-muted px-1">.env</code> for tests without pasting here.
          </p>
        </div>
      );
    }
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Account / App SID</Label>
          <Input
            value={provider.accountSid}
            onChange={(e) => setProviderField(storeKind, { accountSid: e.target.value })}
            className="font-mono text-sm"
          />
        </div>
        <div className="space-y-2">
          <Label>API key</Label>
          <Input
            value={provider.apiKey}
            onChange={(e) => setProviderField(storeKind, { apiKey: e.target.value })}
            className="font-mono text-sm"
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label>API token</Label>
          <Input
            type="password"
            value={provider.authToken}
            onChange={(e) => setProviderField(storeKind, { authToken: e.target.value })}
            className="font-mono text-sm"
          />
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-8">
      {/* Progress */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-2">
          {STEPS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setStep(s.id)}
              className={cn(
                "flex-1 rounded-xl border px-3 py-2 text-left transition-colors sm:max-w-[200px]",
                step === s.id
                  ? "border-primary bg-primary/10 ring-1 ring-primary/30"
                  : "border-border bg-card/40 hover:bg-muted/50"
              )}
            >
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Step {s.id}
              </div>
              <div className="text-sm font-medium leading-tight">{s.title}</div>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {statusBadge(provider.connectionStatus ?? "idle")}
          {provider.lastTestLatencyMs != null && (
            <span className="text-xs font-mono text-muted-foreground">{provider.lastTestLatencyMs} ms</span>
          )}
        </div>
      </div>
      <p className="text-sm text-muted-foreground -mt-4">{STEPS.find((s) => s.id === step)?.hint}</p>

      <AnimatePresence mode="wait">
        {step === 1 && (
          <motion.div
            key="s1"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
          >
            {UNIFIED_TELEPHONY_OPTIONS.map((opt) => {
              const active = providerId === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setProviderId(opt.id)}
                  className={cn(
                    "rounded-xl border p-4 text-left transition-all hover:border-primary/50",
                    active ? "border-primary bg-primary/10 shadow-md ring-2 ring-primary/20" : "border-border bg-card/50"
                  )}
                >
                  <Radio className={cn("h-5 w-5 mb-2", active ? "text-primary" : "text-muted-foreground")} />
                  <div className="font-semibold">{opt.label}</div>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{opt.blurb}</p>
                </button>
              );
            })}
          </motion.div>
        )}

        {step === 2 && (
          <motion.div key="s2" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
            <Card className="border-border/80 bg-card/40">
              <CardHeader>
                <CardTitle className="text-lg">Account credentials</CardTitle>
                <CardDescription>
                  One form for every carrier — fields change based on your selection ({provider.displayName}).
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {fieldGroups()}
                <div className="flex flex-wrap gap-2 border-t border-border pt-4">
                  <Button type="button" variant="default" onClick={handleSave}>
                    Save configuration
                  </Button>
                  <Button type="button" variant="secondary" onClick={runLiveTest} disabled={testing}>
                    {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Activity className="h-4 w-4" />}
                    <span className="ml-2">Test live connection</span>
                  </Button>
                  <div className="flex items-center gap-2 rounded-lg border px-3 py-1.5">
                    <span className="text-xs text-muted-foreground">Enable carrier</span>
                    <Switch
                      checked={provider.enabled}
                      onCheckedChange={(v) => toggleProvider(storeKind, v)}
                    />
                  </div>
                </div>
                {provider.lastTestMessage && (
                  <p className="text-xs text-muted-foreground rounded-md bg-muted/50 p-2">{provider.lastTestMessage}</p>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}

        {step === 3 && (
          <motion.div key="s3" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
            <Card className="border-border/80 bg-card/40">
              <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle className="text-lg">Numbers & webhooks</CardTitle>
                  <CardDescription>
                    Primary caller ID and the URLs your carrier should POST to (this Next.js app).
                  </CardDescription>
                </div>
                <Button type="button" size="sm" variant="outline" onClick={applySuggestedWebhooks} disabled={!origin}>
                  Auto-fill URLs from this site
                </Button>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Primary voice number (E.164)</Label>
                    <Input
                      placeholder="+1… or +880…"
                      value={provider.fromNumber}
                      onChange={(e) => setProviderField(storeKind, { fromNumber: e.target.value })}
                      className="font-mono"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Media stream WebSocket (optional)</Label>
                    <Input
                      value={provider.mediaStreamUrl}
                      onChange={(e) => setProviderField(storeKind, { mediaStreamUrl: e.target.value })}
                      className="font-mono text-xs"
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <div className="flex items-center justify-between gap-2">
                      <Label>Voice webhook URL</Label>
                      {suggestedVoiceUrl && (
                        <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => copy(suggestedVoiceUrl)}>
                          <Copy className="h-3 w-3 mr-1" /> Copy suggested
                        </Button>
                      )}
                    </div>
                    <Input
                      value={provider.voiceWebhookUrl}
                      onChange={(e) => setProviderField(storeKind, { voiceWebhookUrl: e.target.value })}
                      className="font-mono text-xs"
                      placeholder={suggestedVoiceUrl || "https://…"}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Status callback URL</Label>
                    <Input
                      value={provider.statusCallbackUrl}
                      onChange={(e) => setProviderField(storeKind, { statusCallbackUrl: e.target.value })}
                      className="font-mono text-xs"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>WhatsApp / messaging webhook</Label>
                    <Input
                      value={provider.whatsappWebhookUrl}
                      onChange={(e) => setProviderField(storeKind, { whatsappWebhookUrl: e.target.value })}
                      className="font-mono text-xs"
                    />
                  </div>
                </div>

                <div className="rounded-xl border border-dashed p-4 space-y-3">
                  <div className="flex items-center gap-2 font-medium text-sm">
                    <Phone className="h-4 w-4 text-primary" />
                    Additional lines (optional)
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Input
                      className="max-w-[220px] font-mono text-sm"
                      placeholder="+1…"
                      value={newE164}
                      onChange={(e) => setNewE164(e.target.value)}
                    />
                    <Input
                      className="max-w-[160px] text-sm"
                      placeholder="Label"
                      value={newLabel}
                      onChange={(e) => setNewLabel(e.target.value)}
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        if (!newE164.trim()) return;
                        addPhoneNumber(
                          storeKind,
                          newE164.trim(),
                          newLabel.trim() || "Line",
                          agents[0]?.id ?? ""
                        );
                        setNewE164("");
                        setNewLabel("");
                        toast({ title: "Number registered", description: "Assign an AI agent on the Voice Agents page." });
                      }}
                    >
                      <Plus className="h-4 w-4 mr-1" /> Add number
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {provider.phoneNumbers.map((n) => (
                      <div
                        key={n.id}
                        className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/40 p-2 text-sm"
                      >
                        <span className="font-mono">{n.e164}</span>
                        <span className="text-muted-foreground">{n.label}</span>
                        <Select
                          value={n.voiceAgentId}
                          onValueChange={(v) => updatePhoneAgent(storeKind, n.id, v)}
                        >
                          <SelectTrigger className="w-[200px] h-8 text-xs">
                            <SelectValue placeholder="AI agent" />
                          </SelectTrigger>
                          <SelectContent>
                            {agents.map((a) => (
                              <SelectItem key={a.id} value={a.id}>
                                {a.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          onClick={() => removePhoneNumber(storeKind, n.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button type="button" onClick={handleSave}>
                    Save configuration
                  </Button>
                  <Button type="button" variant="secondary" onClick={runLiveTest} disabled={testing}>
                    {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Activity className="h-4 w-4" />}
                    <span className="ml-2">Test again</span>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex justify-between">
        <Button type="button" variant="outline" disabled={step <= 1} onClick={() => setStep((s) => Math.max(1, s - 1))}>
          Back
        </Button>
        <Button type="button" onClick={() => setStep((s) => Math.min(3, s + 1))} disabled={step >= 3}>
          Next
          <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}
