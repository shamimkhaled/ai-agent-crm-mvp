"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useSupabaseRealtime } from "@/lib/supabase/hooks";
import type {
  ConversationMessageRow,
  ConversationRow,
  OperationalConversation,
} from "@/types/inbox";

function mapChannel(raw: string | null | undefined): OperationalConversation["channel"] {
  const c = (raw || "Web Chat").trim();
  if (c === "WhatsApp" || c === "Messenger" || c === "Web Chat" || c === "Phone") return c;
  return "Web Chat";
}

function rowToOperational(r: ConversationRow): OperationalConversation {
  return {
    id: r.id,
    customerName: r.customer_name,
    channel: mapChannel(r.channel),
    lastMessage: r.last_message || "",
    timestamp: new Date(r.updated_at || r.created_at).toLocaleString(),
    status:
      r.status === "resolved" || r.status === "waiting" || r.status === "active"
        ? r.status
        : "active",
    aiConfidence: r.ai_confidence ?? 100,
    dealerCode: r.dealer_code,
    customerPhone: r.customer_phone,
    locale: r.locale,
  };
}

function hasSupabaseBrowser(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

export function useOperationalInbox() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [conversations, setConversations] = useState<OperationalConversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ConversationMessageRow[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const didInitialSelect = useRef(false);

  const active = useMemo(
    () => conversations.find((c) => c.id === activeId) ?? null,
    [conversations, activeId]
  );

  const loadConversations = useCallback(async () => {
    if (!hasSupabaseBrowser()) {
      setLoading(false);
      return;
    }
    try {
      const supabase = createClient();
      const { data, error: qErr } = await supabase
        .from("conversations")
        .select(
          "id,customer_name,channel,last_message,ai_confidence,status,created_at,updated_at,dealer_code,customer_phone,locale"
        )
        .order("created_at", { ascending: false })
        .limit(80);
      if (qErr) {
        setError(qErr.message);
        return;
      }
      setError(null);
      const rows = (data ?? []) as ConversationRow[];
      setConversations(rows.map(rowToOperational));
      if (!didInitialSelect.current && rows.length > 0) {
        didInitialSelect.current = true;
        setActiveId((prev) => prev ?? rows[0].id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMessages = useCallback(async (conversationId: string) => {
    if (!hasSupabaseBrowser() || !conversationId) return;
    setMessagesLoading(true);
    try {
      const supabase = createClient();
      const { data, error: qErr } = await supabase
        .from("conversation_messages")
        .select("id,conversation_id,role,body,meta,created_at")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true })
        .limit(200);
      if (qErr) {
        setError(qErr.message);
        return;
      }
      setError(null);
      setMessages((data ?? []) as ConversationMessageRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setMessagesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    if (!activeId) {
      setMessages([]);
      return;
    }
    void loadMessages(activeId);
  }, [activeId, loadMessages]);

  useSupabaseRealtime<ConversationRow>("conversations", "*", () => {
    void loadConversations();
  });

  useSupabaseRealtime<ConversationMessageRow>(
    "conversation_messages",
    "INSERT",
    (payload) => {
      const row = payload.new as ConversationMessageRow | null;
      if (!row?.conversation_id) return;
      if (row.conversation_id !== activeId) {
        void loadConversations();
        return;
      }
      setMessages((prev) => {
        if (prev.some((m) => m.id === row.id)) return prev;
        return [...prev, row];
      });
    },
    activeId ? { filter: `conversation_id=eq.${activeId}`, enabled: true } : { enabled: false }
  );

  const sendMessage = useCallback(
    async (body: string, senderRole: "customer" | "agent") => {
      if (!activeId) return { ok: false as const, error: "No conversation selected" };
      const res = await fetch("/api/inbox/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: activeId, body, senderRole }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) return { ok: false as const, error: data.error || res.statusText };
      void loadConversations();
      return { ok: true as const };
    },
    [activeId, loadConversations]
  );

  return {
    supabaseConfigured: hasSupabaseBrowser(),
    loading,
    error,
    conversations,
    activeId,
    setActiveId,
    active,
    messages,
    messagesLoading,
    reloadConversations: loadConversations,
    sendMessage,
  };
}
