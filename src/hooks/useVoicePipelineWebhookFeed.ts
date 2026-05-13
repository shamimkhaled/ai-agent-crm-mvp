"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  pipelineEventRowToWebhookLog,
  type VoicePipelineEventRow,
} from "@/lib/voice/pipelineEventToWebhookLog";
import { useVoicePlatformStore } from "@/store/voicePlatformStore";

function hasSupabaseBrowserConfig(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

const POLL_MS = 3000;
const BOOTSTRAP_LIMIT = 80;

function rowAtOrBeforeCutoff(row: VoicePipelineEventRow, cutoffIso: string | null): boolean {
  if (!cutoffIso) return false;
  return new Date(row.created_at).getTime() <= new Date(cutoffIso).getTime();
}

/**
 * Streams `voice_pipeline_events` (written by voice webhooks when SUPABASE_SERVICE_ROLE_KEY
 * is set) into the Zustand webhook log. Polls every few seconds; also subscribes to Realtime
 * INSERT when the table is part of the `supabase_realtime` publication.
 */
export function useVoicePipelineWebhookFeed() {
  const appendWebhookLog = useVoicePlatformStore((s) => s.appendWebhookLog);
  const clearWebhookLogs = useVoicePlatformStore((s) => s.clearWebhookLogs);
  const appendRef = useRef(appendWebhookLog);
  appendRef.current = appendWebhookLog;

  const replayCutoffRef = useRef<string | null>(null);
  const [liveActive, setLiveActive] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);

  const ingestRows = useCallback((rows: VoicePipelineEventRow[]) => {
    const cutoff = replayCutoffRef.current;
    const chronological = [...rows].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    for (const row of chronological) {
      if (rowAtOrBeforeCutoff(row, cutoff)) continue;
      appendRef.current(pipelineEventRowToWebhookLog(row));
    }
  }, []);

  /** Clears the on-screen log and stops re-showing DB rows older than this moment. */
  const resetLiveLog = useCallback(() => {
    replayCutoffRef.current = new Date().toISOString();
    clearWebhookLogs();
  }, [clearWebhookLogs]);

  useEffect(() => {
    if (!hasSupabaseBrowserConfig()) {
      setLiveActive(false);
      return;
    }

    const supabase = createClient();
    let cancelled = false;

    async function bootstrap() {
      try {
        const { data, error } = await supabase
          .from("voice_pipeline_events")
          .select("id,call_id,step,detail,duration_ms,created_at")
          .order("created_at", { ascending: false })
          .limit(BOOTSTRAP_LIMIT);

        if (cancelled) return;
        if (error) {
          setLiveError(error.message);
          setLiveActive(false);
          return;
        }
        setLiveError(null);
        setLiveActive(true);
        ingestRows((data ?? []) as VoicePipelineEventRow[]);
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        setLiveError(msg);
        setLiveActive(false);
        console.warn("[useVoicePipelineWebhookFeed] bootstrap", msg);
      }
    }

    void bootstrap();

    const poll = async () => {
      if (cancelled) return;
      try {
        const { data, error } = await supabase
          .from("voice_pipeline_events")
          .select("id,call_id,step,detail,duration_ms,created_at")
          .order("created_at", { ascending: false })
          .limit(40);
        if (cancelled || error) return;
        ingestRows((data ?? []) as VoicePipelineEventRow[]);
      } catch {
        /* network blips — next poll may succeed */
      }
    };

    const pollTimer = window.setInterval(() => void poll(), POLL_MS);

    const channel = supabase
      .channel("voice_pipeline_events_webhook_feed")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "voice_pipeline_events" },
        (payload) => {
          const row = payload.new as VoicePipelineEventRow | null;
          if (row?.id) ingestRows([row]);
        }
      )
      .subscribe((status, err) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          const msg = err instanceof Error ? err.message : String(err ?? status);
          setLiveError(msg);
          console.warn("[useVoicePipelineWebhookFeed] Realtime", status, err);
        }
      });

    return () => {
      cancelled = true;
      window.clearInterval(pollTimer);
      void supabase.removeChannel(channel);
    };
  }, [ingestRows]);

  return {
    liveActive: liveActive && hasSupabaseBrowserConfig(),
    liveError,
    resetLiveLog,
    supabaseConfigured: hasSupabaseBrowserConfig(),
  };
}
