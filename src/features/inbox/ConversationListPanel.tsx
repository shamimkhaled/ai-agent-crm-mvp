"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Smartphone, MessageCircle, Phone, HelpCircle } from "lucide-react";
import type { OperationalConversation } from "@/types/inbox";
import { cn } from "@/lib/utils";

function channelIcon(channel: string) {
  switch (channel) {
    case "WhatsApp":
      return <MessageCircle className="w-3 h-3" />;
    case "Messenger":
      return <MessageCircle className="w-3 h-3 text-blue-500" />;
    case "Web Chat":
      return <Smartphone className="w-3 h-3" />;
    case "Phone":
      return <Phone className="w-3 h-3 text-primary" />;
    default:
      return <HelpCircle className="w-3 h-3" />;
  }
}

type Props = {
  conversations: OperationalConversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
};

export function ConversationListPanel({ conversations, activeId, onSelect }: Props) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return conversations;
    return conversations.filter(
      (c) =>
        c.customerName.toLowerCase().includes(s) ||
        c.lastMessage.toLowerCase().includes(s) ||
        (c.dealerCode && c.dealerCode.toLowerCase().includes(s)) ||
        (c.customerPhone && c.customerPhone.includes(s))
    );
  }, [conversations, q]);

  return (
    <div className="flex flex-col h-full overflow-hidden rounded-xl border border-border bg-card/40">
      <div className="p-4 border-b border-border shrink-0">
        <h2 className="font-semibold text-lg mb-4">Inbox</h2>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9 bg-muted/50"
            placeholder="Search name, dealer, phone…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>
      <ScrollArea className="flex-1 min-h-0">
        <div className="divide-y divide-border">
          {filtered.map((chat) => (
            <button
              key={chat.id}
              type="button"
              onClick={() => onSelect(chat.id)}
              className={cn(
                "w-full text-left p-4 transition-colors hover:bg-muted/50",
                activeId === chat.id && "bg-muted/80"
              )}
            >
              <div className="flex justify-between items-start mb-1">
                <div className="flex items-center gap-2 min-w-0">
                  <Avatar className="w-10 h-10 shrink-0">
                    <AvatarFallback>{chat.customerName.substring(0, 2)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <span className="font-medium text-sm block truncate">{chat.customerName}</span>
                    <span className="flex items-center text-[10px] text-muted-foreground mt-0.5 gap-1">
                      {channelIcon(chat.channel)}
                      <span>{chat.channel}</span>
                      {chat.dealerCode && (
                        <span className="font-mono text-[9px] opacity-80">· {chat.dealerCode}</span>
                      )}
                    </span>
                  </div>
                </div>
                <span className="text-xs text-muted-foreground shrink-0">{chat.timestamp}</span>
              </div>
              <p className="text-xs text-muted-foreground truncate w-[95%] mt-2">{chat.lastMessage}</p>
              {chat.aiConfidence < 60 && (
                <span className="inline-block mt-2 text-[10px] text-destructive bg-destructive/10 px-2 py-0.5 rounded-sm">
                  Low AI confidence — escalation suggested
                </span>
              )}
            </button>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
