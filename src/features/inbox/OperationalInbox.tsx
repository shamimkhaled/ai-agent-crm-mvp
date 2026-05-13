"use client";

import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, MessageCircle, Smartphone, Phone } from "lucide-react";

export function OperationalInbox() {
  const inbox = useOperationalInbox();
  const { toast } = useToast();

  if (!inbox.supabaseConfigured) {
    return (
      <p className="text-sm text-muted-foreground p-6">
        Set <code className="text-xs bg-muted px-1 rounded">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
        <code className="text-xs bg-muted px-1 rounded">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>, then run{" "}
        <code className="text-xs bg-muted px-1 rounded">docs/sql/mvp_platform_tables.sql</code>.
      </p>
    );
  }

  if (inbox.loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-6rem)] gap-6">
      <div className="w-full md:w-1/3 shrink-0 flex flex-col h-full">
        <ConversationListPanel
          conversations={inbox.conversations}
          activeId={inbox.activeId}
          onSelect={(id) => inbox.setActiveId(id)}
        />
      </div>

      {inbox.active ? (
        <Card className="glass flex-1 flex flex-col h-full rounded-xl overflow-hidden min-w-0">
          <CardHeader className="p-4 border-b border-border flex flex-row items-start justify-between gap-3 space-y-0 bg-muted/20 shrink-0">
            <div className="min-w-0">
              <CardTitle className="text-base font-medium truncate">{inbox.active.customerName}</CardTitle>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground mt-1">
                {inbox.active.channel === "WhatsApp" && <MessageCircle className="w-3 h-3" />}
                {inbox.active.channel === "Web Chat" && <Smartphone className="w-3 h-3" />}
                {inbox.active.channel === "Phone" && <Phone className="w-3 h-3" />}
                <span>via {inbox.active.channel}</span>
                {inbox.active.customerPhone && (
                  <span className="font-mono text-[11px]">{inbox.active.customerPhone}</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Badge variant={inbox.active.status === "resolved" ? "outline" : "secondary"} className="capitalize">
                {inbox.active.status}
              </Badge>
              <Button size="sm" variant="outline" type="button">
                Assign
              </Button>
            </div>
          </CardHeader>

          <MessageThreadPanel
            customerName={inbox.active.customerName}
            messages={inbox.messages}
            loading={inbox.messagesLoading}
            lowConfidence={inbox.active.aiConfidence < 60}
            aiConfidence={inbox.active.aiConfidence}
          />

          <InboxComposer
            disabled={!inbox.activeId}
            onSend={async (body, senderRole) => {
              const r = await inbox.sendMessage(body, senderRole);
              if (!r.ok) {
                toast({
                  title: "Send failed",
                  description: r.error,
                  variant: "destructive",
                });
                return r;
              }
              toast({ title: "Sent", description: senderRole === "customer" ? "AI reply queued." : "Message saved." });
              return r;
            }}
          />
        </Card>
      ) : (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm border border-dashed border-border rounded-xl">
          Select a conversation.
        </div>
      )}

      {inbox.error && (
        <div className="fixed bottom-4 right-4 max-w-sm rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {inbox.error}
        </div>
      )}
    </div>
  );
}
