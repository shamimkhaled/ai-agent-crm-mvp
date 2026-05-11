"use client";

import Link from "next/link";
import { UnifiedTelephonyForm } from "@/components/voice/UnifiedTelephonyForm";
import { SettingsSectionHeader } from "@/components/settings/SettingsSectionHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight, BookOpen } from "lucide-react";

export default function TelephonySettingsPage() {
  return (
    <div className="space-y-8 pb-12">
      <SettingsSectionHeader
        title="Phone provider (one simple setup)"
        subtitle="Pick Twilio, Exotel, Plivo, or Telnyx — the form changes automatically. Save your keys, hit Test live connection, then paste the webhook URLs into your carrier console. WhatsApp has its own tab so messaging stays clear."
      />

      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-muted-foreground max-w-2xl">
            <strong className="text-foreground">Twilio tip:</strong> add{" "}
            <code className="rounded bg-muted px-1 text-xs">TWILIO_ACCOUNT_SID</code> and{" "}
            <code className="rounded bg-muted px-1 text-xs">TWILIO_AUTH_TOKEN</code> to your server{" "}
            <code className="rounded bg-muted px-1 text-xs">.env</code> for investor-safe demos (keys never
            leave the server). You can still paste here for quick tests.
          </div>
          <Button variant="secondary" size="sm" asChild>
            <Link href="/settings/whatsapp">
              WhatsApp setup
              <ArrowRight className="h-4 w-4 ml-1" />
            </Link>
          </Button>
        </CardContent>
      </Card>

      <UnifiedTelephonyForm />

      <Card className="glass">
        <CardContent className="py-4 flex flex-wrap gap-4 text-sm text-muted-foreground items-center">
          <BookOpen className="h-5 w-5 text-primary shrink-0" />
          <span>
            Next: assign AI agents on{" "}
            <Link href="/settings/voice-agents" className="text-primary font-medium underline">
              Voice agents
            </Link>{" "}
            and run a live story on{" "}
            <Link href="/calls" className="text-primary font-medium underline">
              Live calls
            </Link>
            .
          </span>
        </CardContent>
      </Card>
    </div>
  );
}
