"use client";

import { useShallow } from "zustand/react/shallow";
import { useVoicePlatformStore } from "@/store/voicePlatformStore";
import { useVoicePipelineWebhookFeed } from "@/hooks/useVoicePipelineWebhookFeed";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Trash2, Zap, Radio } from "lucide-react";
import { SettingsSectionHeader } from "@/components/settings/SettingsSectionHeader";

export default function WebhooksSettingsPage() {
  const { webhookLogs, appendWebhookLog } = useVoicePlatformStore(
    useShallow((s) => ({
      webhookLogs: s.webhookLogs,
      appendWebhookLog: s.appendWebhookLog,
    }))
  );
  const { liveActive, liveError, resetLiveLog, supabaseConfigured } = useVoicePipelineWebhookFeed();

  const simulate = () => {
    appendWebhookLog({
      provider: "twilio_voice",
      method: "POST",
      path: "/api/webhooks/voice/inbound",
      status: 200,
      latencyMs: 28 + Math.floor(Math.random() * 40),
      payloadPreview: JSON.stringify({
        CallSid: "CA" + Math.random().toString(36).slice(2, 14),
        From: "+8801...",
      }).slice(0, 160),
    });
  };

  return (
    <div className="space-y-8 pb-12">
      <SettingsSectionHeader
        title="Webhooks & request log"
        subtitle="Every carrier posts here. Use the simulator while Twilio numbers are still provisioning — then compare with real traffic during dress rehearsal."
      >
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={simulate}>
            <Zap className="h-4 w-4 mr-2" />
            Simulate webhook
          </Button>
          <Button type="button" variant="outline" onClick={resetLiveLog}>
            <Trash2 className="h-4 w-4 mr-2" />
            Clear log
          </Button>
        </div>
      </SettingsSectionHeader>

      <Card className="glass">
        <CardHeader>
          <CardTitle className="text-base">Recommended endpoints</CardTitle>
          <CardDescription>
            Mount handlers on these Next.js routes. Full Twilio + ngrok + production steps:{" "}
            <code className="text-foreground">docs/TWILIO_VOICE_INBOUND_PRODUCTION.md</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="font-mono text-xs space-y-2 text-muted-foreground">
          <p>
            <span className="text-foreground">POST</span> /api/webhooks/voice/inbound — voice URL (TwiML
            + Gather)
          </p>
          <p>
            <span className="text-foreground">POST</span> /api/webhooks/voice/gather — speech → Gemini →
            TwiML Say
          </p>
          <p>
            <span className="text-foreground">POST</span> /api/webhooks/voice/ivr — DTMF language menu
            (when <code className="text-foreground">TWILIO_VOICE_DTMF_MENU=true</code>)
          </p>
          <p>
            <span className="text-foreground">GET</span> /api/webhooks/voice/diagnostic — env + webhook URL
            checklist (open in browser when calls do not hit AI)
          </p>
          <p>
            <span className="text-foreground">POST</span> /api/webhooks/voice/status — carrier
            status callbacks
          </p>
          <p>
            <span className="text-foreground">POST</span> /api/webhooks/whatsapp — WhatsApp / messaging
          </p>
          <p>
            <span className="text-foreground">WS</span> /api/voice/media — bidirectional audio (see
            Media Stream)
          </p>
        </CardContent>
      </Card>

      <Card className="glass">
        <CardHeader className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-base">Live webhook log</CardTitle>
            {supabaseConfigured && liveActive ? (
              <Badge variant="default" className="gap-1 font-normal">
                <Radio className="h-3 w-3" />
                Voice feed (Supabase)
              </Badge>
            ) : null}
            {supabaseConfigured && !liveActive && !liveError ? (
              <Badge variant="secondary" className="font-normal">
                Connecting…
              </Badge>
            ) : null}
            {liveError ? (
              <Badge variant="destructive" className="font-normal max-w-[min(100%,280px)] truncate">
                {liveError}
              </Badge>
            ) : null}
          </div>
          <CardDescription>
            Newest entries at the bottom. Simulator and telephony test append here in the browser.
            When <code className="text-foreground">NEXT_PUBLIC_SUPABASE_*</code> and{" "}
            <code className="text-foreground">SUPABASE_SERVICE_ROLE_KEY</code> are set, real PSTN
            calls append rows from <code className="text-foreground">voice_pipeline_events</code>{" "}
            every few seconds (and instantly if that table is in the Realtime publication — see{" "}
            <code className="text-foreground">supabase_schema.sql</code>).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!supabaseConfigured ? (
            <p className="text-sm text-muted-foreground mb-3">
              Add Supabase URL + anon key to <code className="text-foreground">.env.local</code> to
              mirror live Twilio voice traffic (inbound, gather, status) in this list.
            </p>
          ) : null}
          <ScrollArea className="h-[420px] rounded-md border border-border bg-muted/20 p-3">
            <div className="space-y-2 font-mono text-[11px]">
              {webhookLogs.length === 0 ? (
                <p className="text-muted-foreground">No webhook traffic recorded in this session.</p>
              ) : (
                webhookLogs.map((log) => (
                  <div
                    key={log.id}
                    className="rounded border border-border/80 bg-background/60 p-2 flex flex-wrap gap-2 items-center"
                  >
                    <Badge variant="outline">{log.method}</Badge>
                    <span className="text-muted-foreground">{new Date(log.at).toLocaleTimeString()}</span>
                    <Badge variant="secondary">{log.provider}</Badge>
                    <span>{log.path}</span>
                    <span className="text-primary">{log.status}</span>
                    <span className="text-muted-foreground">{log.latencyMs}ms</span>
                    <p className="w-full text-muted-foreground break-all">{log.payloadPreview}</p>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
