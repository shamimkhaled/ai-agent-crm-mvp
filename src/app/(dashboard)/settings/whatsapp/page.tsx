"use client";

import { useVoicePlatformStore, type ProviderKind } from "@/store/voicePlatformStore";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { MessageCircle, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";

import { SettingsSectionHeader } from "@/components/settings/SettingsSectionHeader";

export default function WhatsAppSettingsPage() {
  const {
    providers,
    setProviderField,
    toggleProvider,
    whatsappEvents,
    pushWhatsAppEvent,
    appendWebhookLog,
  } = useVoicePlatformStore();
  const wa = useMemo(
    () => providers.find((p) => p.kind === "twilio_whatsapp")!,
    [providers]
  );
  const [simBody, setSimBody] = useState("Order status for #4521?");

  const simulateInbound = () => {
    pushWhatsAppEvent({
      from: "+15551234567",
      bodyPreview: simBody.slice(0, 160),
      provider: "twilio_whatsapp" as ProviderKind,
    });
    appendWebhookLog({
      provider: "twilio_whatsapp",
      method: "POST",
      path: "/api/webhooks/whatsapp",
      status: 200,
      latencyMs: 42,
      payloadPreview: JSON.stringify({ From: "+1555", Body: simBody }).slice(0, 140),
    });
  };

  return (
    <div className="space-y-8 pb-12">
      <SettingsSectionHeader
        title="WhatsApp Business"
        subtitle="Pair your Twilio WhatsApp sender with the same Account SID you use for voice. Paste the messaging webhook, then simulate an inbound message for investors — events also appear under Webhooks & logs."
      />

      <Card className="glass">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <MessageCircle className="h-5 w-5 text-primary" />
              Twilio WhatsApp sender
            </CardTitle>
            <CardDescription>Messaging webhook and sandbox / production sender IDs.</CardDescription>
          </div>
          <Switch checked={wa.enabled} onCheckedChange={(v) => toggleProvider("twilio_whatsapp", v)} />
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>WhatsApp-enabled sender</Label>
            <Input
              value={wa.fromNumber}
              onChange={(e) => setProviderField("twilio_whatsapp", { fromNumber: e.target.value })}
              placeholder="whatsapp:+14155238886"
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Inbound WhatsApp webhook URL</Label>
            <Input
              value={wa.whatsappWebhookUrl}
              onChange={(e) =>
                setProviderField("twilio_whatsapp", { whatsappWebhookUrl: e.target.value })
              }
              placeholder="https://your-domain.com/api/webhooks/whatsapp"
            />
          </div>
          <div className="space-y-2 md:col-span-2 flex flex-wrap gap-2 items-end">
            <div className="flex-1 min-w-[200px] space-y-2">
              <Label>Simulate inbound body</Label>
              <Input value={simBody} onChange={(e) => setSimBody(e.target.value)} />
            </div>
            <Button type="button" onClick={simulateInbound} variant="secondary">
              <RefreshCw className="h-4 w-4 mr-2" />
              Push test event
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="glass">
        <CardHeader>
          <CardTitle className="text-base">Live WhatsApp events</CardTitle>
          <CardDescription>Most recent simulated or webhook-driven rows (newest at bottom).</CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[280px] rounded-md border border-border p-3 font-mono text-xs">
            {whatsappEvents.length === 0 ? (
              <p className="text-muted-foreground">No events yet.</p>
            ) : (
              <ul className="space-y-2">
                {whatsappEvents.map((e) => (
                  <li key={e.id} className="flex flex-wrap gap-2 border-b border-border/60 pb-2">
                    <Badge variant="outline">{new Date(e.at).toLocaleTimeString()}</Badge>
                    <span className="text-muted-foreground">{e.from}</span>
                    <span>{e.bodyPreview}</span>
                  </li>
                ))}
              </ul>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
