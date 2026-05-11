import { create } from 'zustand';

interface CallState {
  isSimulating: boolean;
  activeCall: {
    callerName: string;
    phoneNumber: string;
    duration: number;
    dealerCode?: string;
    isDealer: boolean;
    intent: string;
    confidenceScore: number;
  } | null;
  callPipelineStep: number;
  transcript: { speaker: 'AI' | 'Caller'; text: string; id: string }[];
  chatHistory: { role: string; content: string }[];
  startSimulation: () => void;
  endSimulation: () => void;
  setCallPipelineStep: (step: number) => void;
  addTranscriptLine: (line: { speaker: 'AI' | 'Caller'; text: string; id: string }) => void;
  addChatHistory: (role: string, content: string) => void;
  updateConfidence: (score: number, intent: string) => void;
}

export const useCallStore = create<CallState>((set) => ({
  isSimulating: false,
  activeCall: null,
  callPipelineStep: 0,
  transcript: [],
  chatHistory: [],
  
  startSimulation: () => set({
    isSimulating: true,
    activeCall: {
      callerName: 'Rahim Uddin',
      phoneNumber: '+8801700000000',
      duration: 0,
      dealerCode: '1212',
      isDealer: true,
      intent: 'Greeting',
      confidenceScore: 95,
    },
    callPipelineStep: 0,
    transcript: [],
    chatHistory: [],
  }),
  
  endSimulation: () => set({ isSimulating: false, activeCall: null, callPipelineStep: 0 }),
  setCallPipelineStep: (step) => set({ callPipelineStep: step }),
  
  addTranscriptLine: (line) => set((state) => ({ transcript: [...state.transcript, line] })),
  
  addChatHistory: (role, content) => set((state) => ({
     chatHistory: [...state.chatHistory, { role, content }]
  })),

  updateConfidence: (score, intent) => set((state) => ({
     activeCall: state.activeCall ? { ...state.activeCall, confidenceScore: score, intent } : null
  })),
}));
