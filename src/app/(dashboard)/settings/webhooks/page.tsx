"use client";

import { useVoicePlatformStore } from "@/store/voicePlatformStore";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Trash2, Zap } from "lucide-react";
import { SettingsSectionHeader } from "@/components/settings/SettingsSectionHeader";

export default function WebhooksSettingsPage() {
  const { webhookLogs, clearWebhookLogs, appendWebhookLog, providers } = useVoicePlatformStore();

  const simulate = () => {
    const p = providers.find((x) => x.enabled) ?? providers[0];
    appendWebhookLog({
      provider: p.kind,
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
          <Button type="button" variant="outline" onClick={clearWebhookLogs}>
            <Trash2 className="h-4 w-4 mr-2" />
            Clear log
          </Button>
        </div>
      </SettingsSectionHeader>

      <Card className="glass">
        <CardHeader>
          <CardTitle className="text-base">Recommended endpoints</CardTitle>
          <CardDescription>Mount handlers on these Next.js routes in production.</CardDescription>
        </CardHeader>
        <CardContent className="font-mono text-xs space-y-2 text-muted-foreground">
          <p>
            <span className="text-foreground">POST</span> /api/webhooks/voice/inbound — voice URL
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
        <CardHeader>
          <CardTitle className="text-base">Live webhook log</CardTitle>
          <CardDescription>Newest entries at the bottom; mirrors Supabase insert stream when enabled.</CardDescription>
        </CardHeader>
        <CardContent>
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
