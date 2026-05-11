import { create } from 'zustand';

export interface Conversation {
  id: string;
  customerName: string;
  channel: 'WhatsApp' | 'Messenger' | 'Web Chat' | 'Phone';
  lastMessage: string;
  timestamp: string;
  status: 'active' | 'resolved' | 'waiting';
  aiConfidence: number;
  unread: number;
}

interface ConversationState {
  conversations: Conversation[];
  activeConversation: string | null;
  setActiveConversation: (id: string) => void;
  upsertConversation: (newConv: Partial<Conversation>) => void;
  setConversations: (conversations: Conversation[]) => void;
}

export const useConversationStore = create<ConversationState>((set) => ({
  conversations: [],
  activeConversation: null,
  setActiveConversation: (id) => set({ activeConversation: id }),
  setConversations: (conversations) => set({ conversations }),
  upsertConversation: (newConv) => set((state) => {
     const exists = state.conversations.find((c) => c.id === newConv.id);
     if (exists) {
        return { conversations: state.conversations.map((c) => c.id === newConv.id ? { ...c, ...newConv } : c) };
     } else {
        return { conversations: [{ ...newConv, id: newConv.id || Date.now().toString(), status: 'active', unread: 1, aiConfidence: 90 } as Conversation, ...state.conversations] };
     }
  }),
}));
