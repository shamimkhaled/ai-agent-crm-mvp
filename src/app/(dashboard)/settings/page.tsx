"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { VoiceWorkflowDiagram } from "@/components/voice/VoiceWorkflowDiagram";
import {
  Radio,
  MessageCircle,
  Bot,
  GitBranch,
  Webhook,
  Activity,
  ListTree,
  Waves,
  LayoutGrid,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useVoicePlatformStore } from "@/store/voicePlatformStore";
import { SettingsSectionHeader } from "@/components/settings/SettingsSectionHeader";

const tiles = [
  {
    href: "/settings/telephony",
    title: "Phone provider",
    desc: "One form for Twilio, Exotel, Plivo, or Telnyx — save, test live, copy webhooks.",
    icon: Radio,
  },
  {
    href: "/settings/whatsapp",
    title: "WhatsApp",
    desc: "Twilio WhatsApp sender + inbound simulator.",
    icon: MessageCircle,
  },
  {
    href: "/settings/voice-agents",
    title: "Voice agents",
    desc: "Personalities, languages, hours, CRM & knowledge access.",
    icon: Bot,
  },
  {
    href: "/settings/routing",
    title: "Call routing",
    desc: "Who answers by number, department, language, and time of day.",
    icon: GitBranch,
  },
  {
    href: "/settings/webhooks",
    title: "Webhooks & traffic log",
    desc: "See every POST your carriers send to you.",
    icon: Webhook,
  },
  {
    href: "/settings/monitoring",
    title: "Live health",
    desc: "Gemini + Supabase pulse for the ops wall.",
    icon: Activity,
  },
  {
    href: "/settings/pipeline-logs",
    title: "Voice pipeline",
    desc: "STT → CRM → Gemini → TTS timeline.",
    icon: ListTree,
  },
  {
    href: "/settings/media-stream",
    title: "Audio & speech stack",
    desc: "WebSocket URL, barge-in, STT/TTS vendors.",
    icon: Waves,
  },
];

const checklist = [
  "Connect phone provider & run live test",
  "Paste webhooks into Twilio / carrier console",
  "Create at least one AI voice agent",
  "Open Live calls + Investor demo for the room",
];

export default function SettingsHubPage() {
  const providers = useVoicePlatformStore((s) => s.providers);
  const enabledCount = providers.filter((p) => p.enabled).length;

  return (
    <div className="space-y-10 pb-12">
      <SettingsSectionHeader
        title="Voice & telephony"
        subtitle="This hub is designed like Intercom or HubSpot settings: short explanations, clear sections, and live validation where possible. Work top-to-bottom once, then use Live health during demos."
      />

      <Card className="border-primary/25 bg-gradient-to-br from-primary/10 via-background to-background">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <LayoutGrid className="h-5 w-5 text-primary" />
            Quick setup checklist
          </CardTitle>
          <CardDescription>Share this order with non-technical teammates.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {checklist.map((line, i) => (
            <div key={line} className="flex items-start gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <span>
                <span className="font-mono text-xs text-muted-foreground mr-2">{i + 1}.</span>
                {line}
              </span>
            </div>
          ))}
          <div className="sm:col-span-2 flex flex-wrap gap-2 pt-2">
            <Button asChild>
              <Link href="/settings/telephony">Start at phone provider</Link>
            </Button>
            <Button variant="secondary" asChild>
              <Link href="/calls">Open live demo</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
        <span>
          {enabledCount} carrier profile{enabledCount === 1 ? "" : "s"} enabled
        </span>
        <span className="hidden sm:inline">·</span>
        <span>WhatsApp counted separately on its own tab</span>
      </div>

      <VoiceWorkflowDiagram activeIndex={null} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map((tile, i) => {
          const Icon = tile.icon;
          return (
            <motion.div
              key={tile.href}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
            >
              <Card className="glass h-full hover:border-primary/40 transition-colors group">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="rounded-lg bg-primary/10 p-2 text-primary">
                      <Icon className="h-5 w-5" />
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <CardTitle className="text-base pt-2">{tile.title}</CardTitle>
                  <CardDescription className="text-xs leading-relaxed">{tile.desc}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button variant="secondary" size="sm" className="w-full" asChild>
                    <Link href={tile.href}>Open</Link>
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
