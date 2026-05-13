"use client";

import { useState } from "react";
import { useOperationalInbox } from "@/hooks/useOperationalInbox";
import { useToast } from "@/hooks/use-toast";
import type { OperationalConversation, ConversationMessageRow } from "@/types/inbox";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import {
  Loader2, MessageCircle, Smartphone, Phone, Send,
  AlertCircle, CheckCircle2, Clock, Bot, User, Headphones,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

// ─── Sub-components ──────────────────────────────────────────────────────────

function channelIcon(channel: string) {
  if (channel === "WhatsApp") return <MessageCircle className="w-3 h-3 text-emerald-500" />;
  if (channel === "Phone")    return <Phone className="w-3 h-3 text-primary" />;
  return <Smartphone className="w-3 h-3 text-muted-foreground" />;
}

function statusColor(status: string) {
  if (status === "active")   return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30";
  if (status === "waiting")  return "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30";
  if (status === "resolved") return "bg-muted text-muted-foreground border-border";
  return "";
}

function ConversationListPanel({
  conversations, activeId, onSelect,
}: {
  conversations: OperationalConversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <Card className="glass flex flex-col h-full border-border/60">
      <CardHeader className="pb-2 shrink-0">
        <CardTitle className="text-sm flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-primary" />
          Conversations
          {conversations.length > 0 && (
            <Badge className="ml-auto text-xs px-1.5 py-0">{conversations.length}</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto space-y-1.5 pb-3 px-3">
        {conversations.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-8">
            No conversations yet.
          </p>
        )}
        <AnimatePresence>
          {conversations.map((conv) => (
            <motion.button
              key={conv.id}
              type="button"
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -6 }}
              onClick={() => onSelect(conv.id)}
              className={cn(
                "w-full text-left rounded-xl border p-3 transition-all",
                activeId === conv.id
                  ? "border-primary bg-primary/10 shadow-sm"
                  : "border-border bg-background/40 hover:bg-muted/30"
              )}
            >
              <div className="flex items-start gap-2.5">
                <Avatar className="h-8 w-8 shrink-0 border border-border/60">
                  <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                    {conv.customerName.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 justify-between">
                    <p className="font-semibold text-sm truncate">{conv.customerName}</p>
                    <span className={cn(
                      "text-[10px] px-1.5 py-0.5 rounded-full border font-medium shrink-0",
                      statusColor(conv.status)
                    )}>
                      {conv.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 mt-0.5">
                    {channelIcon(conv.channel)}
                    <span className="text-[11px] text-muted-foreground truncate">
                      {conv.lastMessage || "No messages"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-1.5">
                    <span className="text-[10px] text-muted-foreground">{conv.timestamp}</span>
                    {conv.aiConfidence < 60 && (
                      <AlertCircle className="h-3 w-3 text-destructive shrink-0" />
                    )}
                  </div>
                </div>
              </div>
            </motion.button>
          ))}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}

function roleIcon(role: string) {
  if (role === "ai")       return <Bot className="h-3.5 w-3.5 text-primary" />;
  if (role === "customer") return <User className="h-3.5 w-3.5 text-muted-foreground" />;
  if (role === "agent")    return <Headphones className="h-3.5 w-3.5 text-emerald-500" />;
  return <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground" />;
}

function MessageThreadPanel({
  customerName, messages, loading, lowConfidence, aiConfidence,
}: {
  customerName: string;
  messages: ConversationMessageRow[];
  loading: boolean;
  lowConfidence: boolean;
  aiConfidence: number;
}) {
  return (
    <CardContent className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
      {/* Confidence bar */}
      <div className="sticky top-0 bg-card/80 backdrop-blur pb-2 pt-1 z-10">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wide">AI confidence</span>
          <span className={cn("text-xs font-bold", lowConfidence ? "text-destructive" : "text-emerald-500")}>
            {aiConfidence}%
          </span>
        </div>
        <Progress value={aiConfidence} className="h-1" />
        {lowConfidence && (
          <p className="text-[10px] text-destructive mt-1 flex items-center gap-1">
            <AlertCircle className="h-3 w-3" /> Low confidence — human review recommended
          </p>
        )}
      </div>

      {loading && (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      )}

      {!loading && messages.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">
          No messages yet in this conversation.
        </p>
      )}

      <AnimatePresence>
        {messages.map((msg) => (
          <motion.div
            key={msg.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
              "flex gap-2",
              msg.role === "customer" ? "justify-end" : "justify-start",
              msg.role === "system" && "justify-center"
            )}
          >
            {msg.role !== "customer" && msg.role !== "system" && (
              <div className="mt-1 shrink-0">{roleIcon(msg.role)}</div>
            )}
            {msg.role === "system" ? (
              <div className="max-w-[80%] rounded-lg bg-muted/40 border border-border/40 px-3 py-1.5">
                <p className="text-[11px] text-muted-foreground text-center">{msg.body}</p>
              </div>
            ) : (
              <div className={cn(
                "max-w-[75%] rounded-2xl px-3.5 py-2.5",
                msg.role === "customer"
                  ? "bg-muted text-foreground rounded-tr-sm"
                  : msg.role === "ai"
                    ? "bg-primary/15 border border-primary/30 text-foreground rounded-tl-sm"
                    : "bg-emerald-500/10 border border-emerald-500/30 text-foreground rounded-tl-sm"
              )}>
                <div className="flex items-center gap-1 mb-0.5">
                  <span className="text-[10px] text-muted-foreground capitalize font-medium">
                    {msg.role === "customer" ? customerName : msg.role}
                  </span>
                  <Clock className="h-2.5 w-2.5 text-muted-foreground/60" />
                  <span className="text-[10px] text-muted-foreground/60">
                    {new Date(msg.created_at).toLocaleTimeString()}
                  </span>
                </div>
                <p className="text-sm whitespace-pre-wrap">{msg.body}</p>
              </div>
            )}
            {msg.role === "customer" && (
              <div className="mt-1 shrink-0">{roleIcon(msg.role)}</div>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </CardContent>
  );
}

function InboxComposer({
  disabled,
  onSend,
}: {
  disabled: boolean;
  onSend: (body: string, role: "customer" | "agent") => Promise<{ ok: boolean; error?: string }>;
}) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [role, setRole] = useState<"agent" | "customer">("agent");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || disabled || sending) return;
    setSending(true);
    await onSend(text.trim(), role);
    setText("");
    setSending(false);
  };

  return (
    <div className="border-t border-border p-3 shrink-0 bg-muted/10">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as "agent" | "customer")}
          className="text-xs rounded-lg border border-border bg-background px-2 py-1.5 text-muted-foreground focus:outline-none"
        >
          <option value="agent">Agent reply</option>
          <option value="customer">Simulate customer</option>
        </select>
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={role === "agent" ? "Type agent reply…" : "Simulate customer message…"}
          disabled={disabled || sending}
          className="flex-1 text-sm"
        />
        <Button type="submit" size="sm" disabled={disabled || sending || !text.trim()}>
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </form>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function OperationalInbox() {
  const inbox = useOperationalInbox();
  const { toast } = useToast();

  if (!inbox.supabaseConfigured) {
    return (
      <p className="text-sm text-muted-foreground p-6">
        Set <code className="text-xs bg-muted px-1 rounded">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
        <code className="text-xs bg-muted px-1 rounded">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>, then run{" "}
        <code className="text-xs bg-muted px-1 rounded">docs/sql/MASTER_SETUP.sql</code>.
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
    <div className="flex h-[calc(100vh-6rem)] gap-4">
      {/* Left: conversation list */}
      <div className="w-80 shrink-0 flex flex-col h-full">
        <ConversationListPanel
          conversations={inbox.conversations}
          activeId={inbox.activeId}
          onSelect={(id) => inbox.setActiveId(id)}
        />
      </div>

      {/* Right: thread + composer */}
      {inbox.active ? (
        <Card className="glass flex-1 flex flex-col h-full rounded-xl overflow-hidden min-w-0 border-border/60">
          <CardHeader className="p-4 border-b border-border flex flex-row items-start justify-between gap-3 space-y-0 bg-muted/20 shrink-0">
            <div className="min-w-0">
              <CardTitle className="text-base font-semibold truncate">
                {inbox.active.customerName}
              </CardTitle>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground mt-1">
                {channelIcon(inbox.active.channel)}
                <span>via {inbox.active.channel}</span>
                {inbox.active.customerPhone && (
                  <span className="font-mono text-[11px] bg-muted px-1.5 py-0.5 rounded">
                    {inbox.active.customerPhone}
                  </span>
                )}
                {inbox.active.dealerCode && (
                  <Badge variant="outline" className="text-[10px] border-primary/30 text-primary">
                    {inbox.active.dealerCode}
                  </Badge>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className={cn(
                "text-[11px] px-2 py-1 rounded-full border font-medium",
                statusColor(inbox.active.status)
              )}>
                {inbox.active.status}
              </span>
              <Button size="sm" variant="outline" type="button" className="text-xs h-7">
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
                toast({ title: "Send failed", description: r.error, variant: "destructive" });
                return r;
              }
              toast({
                title: "Sent",
                description: senderRole === "customer" ? "AI reply queued." : "Message saved.",
              });
              return r;
            }}
          />
        </Card>
      ) : (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm border border-dashed border-border rounded-xl">
          <div className="text-center space-y-2">
            <MessageCircle className="h-8 w-8 mx-auto text-muted-foreground/40" />
            <p>Select a conversation to view messages</p>
          </div>
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
