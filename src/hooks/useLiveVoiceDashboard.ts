"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type CallSessionRow = {
  call_sid: string;
  from_e164: string | null;
  to_e164: string | null;
  call_status: string | null;
  started_at: string;
  ended_at: string | null;
  updated_at: string | null;
  dashboard_state: string | null;
  pipeline_step_index: number | null;
  ai_confidence: number | null;
  escalation: boolean | null;
  human_takeover: boolean | null;
  intent_label: string | null;
  agent_id: string | null;
  caller_display_name: string | null;
  dealer_code_hint: string | null;
};

export type VoiceTranscriptRow = {
  id: string;
  call_sid: string;
  speaker: string;
  body: string;
  pipeline_step: string | null;
  intent_hint: string | null;
  confidence: number | null;
  created_at: string;
};

function hasSupabaseBrowser(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

const RECENT_SESSION_HOURS = 72;

export function useLiveVoiceDashboard() {
  const [ready, setReady] = useState(false);
  const [sessions, setSessions] = useState<CallSessionRow[]>([]);
  const [recentSessions, setRecentSessions] = useState<CallSessionRow[]>([]);
  const [selectedSid, setSelectedSid] = useState<string | null>(null);
  const [transcripts, setTranscripts] = useState<VoiceTranscriptRow[]>([]);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const selectedSession = useMemo(() => {
    if (!selectedSid) return null;
    return (
      sessions.find((s) => s.call_sid === selectedSid) ??
      recentSessions.find((s) => s.call_sid === selectedSid) ??
      null
    );
  }, [sessions, recentSessions, selectedSid]);

  const loadSessions = useCallback(async () => {
    if (!hasSupabaseBrowser()) return;
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("call_sessions")
        .select(
          "call_sid,from_e164,to_e164,call_status,started_at,ended_at,updated_at,dashboard_state,pipeline_step_index,ai_confidence,escalation,human_takeover,intent_label,agent_id,caller_display_name,dealer_code_hint"
        )
        .is("ended_at", null)
        .order("started_at", { ascending: false })
        .limit(40);
      if (error) {
        setConnectionError(error.message);
        return;
      }
      setConnectionError(null);
      if (data) setSessions(data as CallSessionRow[]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setConnectionError(msg);
      console.warn("[useLiveVoiceDashboard] loadSessions", msg);
    }
  }, []);

  const loadRecentSessions = useCallback(async () => {
    if (!hasSupabaseBrowser()) return;
    try {
      const supabase = createClient();
      const since = new Date(Date.now() - RECENT_SESSION_HOURS * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("call_sessions")
        .select(
          "call_sid,from_e164,to_e164,call_status,started_at,ended_at,updated_at,dashboard_state,pipeline_step_index,ai_confidence,escalation,human_takeover,intent_label,agent_id,caller_display_name,dealer_code_hint"
        )
        .not("ended_at", "is", null)
        .gte("started_at", since)
        .order("started_at", { ascending: false })
        .limit(35);
      if (error) {
        setConnectionError(error.message);
        return;
      }
      setConnectionError(null);
      if (data) setRecentSessions(data as CallSessionRow[]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setConnectionError(msg);
      console.warn("[useLiveVoiceDashboard] loadRecentSessions", msg);
    }
  }, []);

  const loadTranscripts = useCallback(async (sid: string) => {
    if (!hasSupabaseBrowser() || !sid) return;
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("voice_call_transcripts")
        .select("*")
        .eq("call_sid", sid)
        .order("created_at", { ascending: true })
        .limit(200);
      if (error) {
        setConnectionError(error.message);
        return;
      }
      if (data) setTranscripts(data as VoiceTranscriptRow[]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setConnectionError(msg);
      console.warn("[useLiveVoiceDashboard] loadTranscripts", msg);
    }
  }, []);

  useEffect(() => {
    if (!hasSupabaseBrowser()) return;
    setReady(true);
    void loadSessions();
    void loadRecentSessions();
  }, [loadSessions, loadRecentSessions]);

  useEffect(() => {
    if (!selectedSid) {
      setTranscripts([]);
      return;
    }
    void loadTranscripts(selectedSid);
  }, [selectedSid, loadTranscripts]);

  const loadSessionsRef = useRef(loadSessions);
  loadSessionsRef.current = loadSessions;
  const loadRecentSessionsRef = useRef(loadRecentSessions);
  loadRecentSessionsRef.current = loadRecentSessions;
  const selectedSidRef = useRef(selectedSid);
  selectedSidRef.current = selectedSid;

  useEffect(() => {
    if (!hasSupabaseBrowser()) return;

    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let retryCount = 0;
    const MAX_RETRIES = 10;
    const RETRY_BASE_MS = 3000;

    // Always poll as fallback regardless of Realtime status
    const pollTimer = window.setInterval(() => {
      void loadSessionsRef.current();
      void loadRecentSessionsRef.current();
    }, 5000);

    function connect() {
      if (cancelled) return;
      const supabase = createClient();

      const channel = supabase
        .channel(`live_voice_dashboard_${Date.now()}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "call_sessions" },
          () => {
            void loadSessionsRef.current();
            void loadRecentSessionsRef.current();
          }
        )
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "voice_call_transcripts" },
          (payload) => {
            const row = payload.new as VoiceTranscriptRow | null;
            if (!row?.call_sid) return;
            const sid = selectedSidRef.current;
            if (row.call_sid !== sid) {
              void loadSessionsRef.current();
              void loadRecentSessionsRef.current();
              return;
            }
            setTranscripts((prev) => {
              if (prev.some((p) => p.id === row.id)) return prev;
              return [...prev, row];
            });
          }
        )
        .subscribe((status, err) => {
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            const msg = err instanceof Error ? err.message : String(err ?? status);
            // Only show error after several retries — transient 1006 errors are normal
            if (retryCount >= 3) setConnectionError(msg);
            console.warn("[useLiveVoiceDashboard] Realtime", status, "— retry", retryCount + 1);
            void supabase.removeChannel(channel);
            if (!cancelled && retryCount < MAX_RETRIES) {
              const delay = Math.min(RETRY_BASE_MS * Math.pow(1.5, retryCount), 30000);
              retryTimer = setTimeout(connect, delay);
              retryCount++;
            }
          }
          if (status === "SUBSCRIBED") {
            retryCount = 0;
            setConnectionError(null);
          }
        });
    }

    connect();

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      window.clearInterval(pollTimer);
    };
  }, []);

  return {
    supabaseConfigured: hasSupabaseBrowser(),
    ready,
    sessions,
    recentSessions,
    selectedSid,
    setSelectedSid,
    selectedSession,
    transcripts,
    reloadSessions: loadSessions,
    reloadRecentSessions: loadRecentSessions,
    connectionError,
  };
}
