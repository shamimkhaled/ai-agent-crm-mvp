"use client";

import { useConversationStore } from "@/store/conversationStore";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Search, Send, FileText, Smartphone, MessageCircle, Phone, HelpCircle, Loader2 } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useSupabaseRealtime } from "@/lib/supabase/hooks";
import { createClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";

export default function InboxPage() {
  const { conversations, activeConversation, setActiveConversation, upsertConversation, setConversations } = useConversationStore();
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
     async function fetchHistory() {
        const { data } = await supabase.from('conversations').select('*').order('created_at', { ascending: false });
        if (data) {
           setConversations(data.map(d => ({
              id: d.id, customerName: d.customer_name, channel: d.channel,
              lastMessage: d.last_message, status: d.status, aiConfidence: d.ai_confidence, timestamp: new Date(d.created_at).toLocaleTimeString(), unread: 0
           })));
           if (data.length > 0) setActiveConversation(data[0].id);
        }
        setLoading(false);
     }
     fetchHistory();
  }, [supabase, setConversations, setActiveConversation]);

  useSupabaseRealtime('conversations', '*', (payload) => {
     if (payload.new && Object.keys(payload.new).length > 0) {
        const newData = payload.new as any;
        upsertConversation({
           id: newData.id,
           customerName: newData.customer_name || 'Unknown',
           lastMessage: newData.last_message,
           channel: newData.channel || 'Web Chat',
           status: newData.status || 'active',
           aiConfidence: newData.ai_confidence || 100,
        });
     }
  });

  const getChannelIcon = (channel: string) => {
    switch (channel) {
      case 'WhatsApp': return <MessageCircle className="w-3 h-3" />;
      case 'Messenger': return <MessageCircle className="w-3 h-3 text-blue-500" />;
      case 'Web Chat': return <Smartphone className="w-3 h-3" />;
      case 'Phone': return <Phone className="w-3 h-3 text-primary" />;
      default: return <HelpCircle className="w-3 h-3" />;
    }
  }

  const active = conversations.find(c => c.id === activeConversation);

  return (
    <div className="flex h-[calc(100vh-6rem)] gap-6">
      {/* List */}
      <Card className="glass w-1/3 flex flex-col h-full border-r border-border overflow-hidden rounded-xl">
        <div className="p-4 border-b border-border">
          <h2 className="font-semibold text-lg mb-4">Inbox</h2>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9 bg-muted/50" placeholder="Search messages..." />
          </div>
        </div>
        <ScrollArea className="flex-1">
          <div className="divide-y divide-border">
            {conversations.map((chat) => (
              <div 
                key={chat.id} 
                onClick={() => setActiveConversation(chat.id)}
                className={`p-4 cursor-pointer hover:bg-muted/50 transition-colors ${activeConversation === chat.id ? 'bg-muted/80' : ''}`}
              >
                <div className="flex justify-between items-start mb-1">
                  <div className="flex items-center gap-2">
                    <Avatar className="w-10 h-10">
                      <AvatarFallback>{chat.customerName.substring(0, 2)}</AvatarFallback>
                    </Avatar>
                    <div>
                       <span className="font-medium text-sm block">{chat.customerName}</span>
                       <span className="flex items-center text-[10px] text-muted-foreground mt-0.5">
                         {getChannelIcon(chat.channel)} <span className="ml-1">{chat.channel}</span>
                       </span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                     <span className="text-xs text-muted-foreground">{chat.timestamp}</span>
                     {chat.unread > 0 && (
                       <Badge variant="default" className="h-4 w-4 p-0 flex items-center justify-center text-[10px] rounded-full">
                         {chat.unread}
                       </Badge>
                     )}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground truncate w-[90%] mt-2">
                  {chat.lastMessage}
                </p>
                {chat.aiConfidence < 60 && (
                   <span className="inline-block mt-2 text-[10px] text-destructive bg-destructive/10 px-2 py-0.5 rounded-sm">
                     AI confidence low — human handover suggested.
                   </span>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      </Card>

      {/* Chat Area */}
      {active ? (
        <Card className="glass flex-1 flex flex-col h-full rounded-xl overflow-hidden">
          <div className="p-4 border-b border-border flex justify-between items-center bg-muted/20">
             <div className="flex items-center gap-3">
                <Avatar>
                  <AvatarFallback>{active.customerName.substring(0,2)}</AvatarFallback>
                </Avatar>
                <div>
                   <h3 className="font-medium">{active.customerName}</h3>
                   <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {getChannelIcon(active.channel)}
                      <span>via {active.channel}</span>
                   </div>
                </div>
             </div>
             <div className="flex items-center gap-2">
                <Badge variant={active.status === 'resolved' ? 'outline' : 'secondary'} className="capitalize">
                  {active.status}
                </Badge>
                <Button size="sm" variant="outline">Assign to Me</Button>
             </div>
          </div>
          <ScrollArea className="flex-1 p-4 bg-background/50">
             <div className="flex flex-col gap-4">
                <div className="flex items-start gap-2">
                   <Avatar className="w-8 h-8 mt-1"><AvatarFallback>{active.customerName.substring(0,2)}</AvatarFallback></Avatar>
                   <div className="bg-muted p-3 rounded-2xl rounded-tl-none max-w-[70%]">
                      <p className="text-sm">Hi, I need help with order #1234. {active.lastMessage}</p>
                   </div>
                </div>
                <div className="flex items-start gap-2 justify-end">
                   <div className="bg-primary/20 border border-primary/30 p-3 rounded-2xl rounded-tr-none max-w-[70%]">
                      <p className="text-sm">Of course! Let me check that for you. It seems your order is currently <strong>Processing</strong> and will be shipped soon.</p>
                   </div>
                   <Avatar className="w-8 h-8 mt-1"><AvatarFallback className="bg-primary text-primary-foreground">AI</AvatarFallback></Avatar>
                </div>
                {active.aiConfidence < 60 && (
                   <div className="mx-auto my-4 text-center">
                     <span className="text-xs text-muted-foreground bg-destructive/10 text-destructive px-3 py-1 rounded-full border border-destructive/20">
                        AI paused: Low intent confidence ({active.aiConfidence}%). Waiting for agent.
                     </span>
                   </div>
                )}
             </div>
          </ScrollArea>
          <div className="p-4 border-t border-border bg-muted/20 flex gap-2 items-center">
             <Button variant="ghost" size="icon" className="text-muted-foreground"><FileText className="w-5 h-5"/></Button>
             <Input className="flex-1 bg-background" placeholder="Type a message as a human agent..." />
             <Button size="icon"><Send className="w-4 h-4" /></Button>
          </div>
        </Card>
      ) : (
         <div className="flex-1 flex items-center justify-center text-muted-foreground">
            Select a conversation to start messaging.
         </div>
      )}
    </div>
  );
}
