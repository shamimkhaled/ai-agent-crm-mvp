"use client";

import { useEffect, useState } from "react";
import { useVoicePlatformStore } from "@/store/voicePlatformStore";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Activity, Loader2, Radio } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { SettingsSectionHeader } from "@/components/settings/SettingsSectionHeader";

type GeminiHealth = {
  ok?: boolean;
  configured?: boolean;
  latencyMs?: number;
  preview?: string;
  error?: string;
  message?: string;
};

export default function RealtimeMonitoringPage() {
  const { callEvents, whatsappEvents, pushCallEvent } = useVoicePlatformStore();
  const [gemini, setGemini] = useState<GeminiHealth | null>(null);
  const [loading, setLoading] = useState(false);
  const [supabaseOk, setSupabaseOk] = useState<boolean | null>(null);

  const pingGemini = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/voice/gemini-health");
      const data = await res.json();
      setGemini(data);
    } catch {
      setGemini({ ok: false, error: "Request failed" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    pingGemini();
    const supabase = createClient();
    void supabase
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .then(({ error }) => setSupabaseOk(!error));
  }, []);

  return (
    <div className="space-y-8 pb-12">
      <SettingsSectionHeader
        title="Live monitoring"
        subtitle="Gemini latency, Supabase reachability, and synthetic call/WhatsApp injectors — ideal for a second monitor during a pitch."
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="glass">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              Gemini API
            </CardTitle>
            <CardDescription>Server-side key from environment.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button size="sm" variant="secondary" onClick={pingGemini} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Refresh"}
            </Button>
            {gemini && (
              <>
                <div className="flex items-center gap-2">
                  <Badge variant={gemini.ok ? "default" : "destructive"}>
                    {gemini.ok ? "Healthy" : "Degraded"}
                  </Badge>
                  {gemini.latencyMs != null && (
                    <span className="text-xs font-mono text-muted-foreground">{gemini.latencyMs}ms</span>
                  )}
                </div>
                {!gemini.configured && (
                  <p className="text-xs text-muted-foreground">{gemini.message}</p>
                )}
                {gemini.preview && (
                  <p className="text-xs text-muted-foreground line-clamp-2">{gemini.preview}</p>
                )}
                {gemini.error && <p className="text-xs text-destructive">{gemini.error}</p>}
              </>
            )}
          </CardContent>
        </Card>

        <Card className="glass">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Supabase</CardTitle>
            <CardDescription>Lightweight head query on conversations.</CardDescription>
          </CardHeader>
          <CardContent>
            <Badge variant={supabaseOk ? "default" : "secondary"}>
              {supabaseOk === null ? "Checking…" : supabaseOk ? "Reachable" : "Check env keys"}
            </Badge>
            <p className="text-xs text-muted-foreground mt-2">
              Enable Realtime on tables such as <code className="bg-muted px-1 rounded">voice_events</code>{" "}
              (see schema migration) for push updates to this UI.
            </p>
          </CardContent>
        </Card>

        <Card className="glass">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Radio className="h-4 w-4" />
              Demo pulse
            </CardTitle>
            <CardDescription>Inject a synthetic call event.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                pushCallEvent({
                  channel: "phone",
                  from: "+88018" + Math.floor(Math.random() * 1e7),
                  provider: "twilio_voice",
                  state: "ringing",
                  assignedAgentId: "agent-support-1",
                })
              }
            >
              Simulate inbound call
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="glass">
          <CardHeader>
            <CardTitle className="text-base">Incoming call events</CardTitle>
            <CardDescription>Channels: phone, WhatsApp call, Telegram, web widget, chat.</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[260px] rounded-md border p-3 text-xs font-mono">
              {callEvents.length === 0 ? (
                <p className="text-muted-foreground">No call events in this browser session.</p>
              ) : (
                <ul className="space-y-2">
                  {callEvents.map((c) => (
                    <li key={c.id} className="border-b border-border/60 pb-2">
                      <span className="text-muted-foreground">{new Date(c.at).toLocaleTimeString()}</span>{" "}
                      <Badge variant="outline" className="mx-1">
                        {c.channel}
                      </Badge>
                      {c.from} · {c.state} · {c.provider}
                    </li>
                  ))}
                </ul>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        <Card className="glass">
          <CardHeader>
            <CardTitle className="text-base">WhatsApp inbound</CardTitle>
            <CardDescription>Latest simulated messaging events.</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[260px] rounded-md border p-3 text-xs">
              {whatsappEvents.length === 0 ? (
                <p className="text-muted-foreground">No WhatsApp rows yet.</p>
              ) : (
                <ul className="space-y-2">
                  {whatsappEvents.map((w) => (
                    <li key={w.id} className="border-b border-border/60 pb-2">
                      <span className="text-muted-foreground">{new Date(w.at).toLocaleTimeString()}</span>{" "}
                      {w.from}: {w.bodyPreview}
                    </li>
                  ))}
                </ul>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
