import { create } from "zustand";

export type TranscriptSpeaker = "AI" | "Caller" | "System";

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
  transcript: { speaker: "AI" | "Caller"; text: string; id: string }[];
  chatHistory: { role: string; content: string }[];
  /** PSTN / Supabase-driven live monitor */
  livePstnEnabled: boolean;
  liveCallSid: string | null;
  liveTranscript: { id: string; speaker: TranscriptSpeaker; text: string }[];
  livePipelineStepIndex: number;
  liveDashboardState: string | null;
  liveThinking: boolean;
  startSimulation: () => void;
  endSimulation: () => void;
  setCallPipelineStep: (step: number) => void;
  addTranscriptLine: (line: { speaker: "AI" | "Caller"; text: string; id: string }) => void;
  addChatHistory: (role: string, content: string) => void;
  updateConfidence: (score: number, intent: string) => void;
  setLivePstnEnabled: (on: boolean) => void;
  setLiveCallSid: (sid: string | null) => void;
  clearLiveTranscript: () => void;
  pushLiveTranscriptLine: (line: { id: string; speaker: TranscriptSpeaker; text: string }) => void;
  setLivePipelineFromSession: (stepIndex: number, dashboardState: string | null) => void;
  setLiveThinking: (v: boolean) => void;
}

export const useCallStore = create<CallState>((set) => ({
  isSimulating: false,
  activeCall: null,
  callPipelineStep: 0,
  transcript: [],
  chatHistory: [],
  livePstnEnabled: false,
  liveCallSid: null,
  liveTranscript: [],
  livePipelineStepIndex: 0,
  liveDashboardState: null,
  liveThinking: false,

  startSimulation: () =>
    set({
      isSimulating: true,
      activeCall: {
        callerName: "Rahim Uddin",
        phoneNumber: "+8801700000000",
        duration: 0,
        dealerCode: "1212",
        isDealer: true,
        intent: "Greeting",
        confidenceScore: 95,
      },
      callPipelineStep: 0,
      transcript: [],
      chatHistory: [],
    }),

  endSimulation: () => set({ isSimulating: false, activeCall: null, callPipelineStep: 0 }),

  setCallPipelineStep: (step) => set({ callPipelineStep: step }),

  addTranscriptLine: (line) =>
    set((state) => ({ transcript: [...state.transcript, line] })),

  addChatHistory: (role, content) =>
    set((state) => ({
      chatHistory: [...state.chatHistory, { role, content }],
    })),

  updateConfidence: (score, intent) =>
    set((state) => ({
      activeCall: state.activeCall
        ? { ...state.activeCall, confidenceScore: score, intent }
        : null,
    })),

  setLivePstnEnabled: (on) => set({ livePstnEnabled: on }),

  setLiveCallSid: (sid) => set({ liveCallSid: sid }),

  clearLiveTranscript: () => set({ liveTranscript: [], liveThinking: false }),

  pushLiveTranscriptLine: (line) =>
    set((state) => {
      if (state.liveTranscript.some((x) => x.id === line.id)) return state;
      return { liveTranscript: [...state.liveTranscript, line] };
    }),

  setLivePipelineFromSession: (stepIndex, dashboardState) =>
    set({
      livePipelineStepIndex: stepIndex,
      liveDashboardState: dashboardState,
      liveThinking: dashboardState === "thinking",
    }),

  setLiveThinking: (v) => set({ liveThinking: v }),
}));
