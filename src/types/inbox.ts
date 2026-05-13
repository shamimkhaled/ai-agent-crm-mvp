export type ConversationChannel = "WhatsApp" | "Messenger" | "Web Chat" | "Phone";

export type ConversationRow = {
  id: string;
  customer_name: string;
  channel: string;
  last_message: string | null;
  ai_confidence: number | null;
  status: string | null;
  created_at: string;
  updated_at: string | null;
  organization_id?: string | null;
  locale?: string | null;
  dealer_code?: string | null;
  customer_phone?: string | null;
};

export type ConversationMessageRow = {
  id: string;
  conversation_id: string;
  role: "customer" | "agent" | "ai" | "system";
  body: string;
  meta: Record<string, unknown> | null;
  created_at: string;
};

export type OperationalConversation = {
  id: string;
  customerName: string;
  channel: ConversationChannel;
  lastMessage: string;
  timestamp: string;
  status: "active" | "resolved" | "waiting";
  aiConfidence: number;
  dealerCode?: string | null;
  customerPhone?: string | null;
  locale?: string | null;
};
