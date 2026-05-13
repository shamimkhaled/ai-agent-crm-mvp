"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type CallStats = {
  activeCalls: number;
  todayTotal: number;
  avgConfidence: number | null;
  openEscalations: number;
};

const POLL_MS = 8_000;

/**
 * Polls /api/voice/stats every POLL_MS and also refreshes on Supabase
 * Realtime events so the top bar metrics update quickly after real calls.
 */
export function useCallStats() {
  const [stats, setStats] = useState<CallStats>({
    activeCalls: 0,
    todayTotal: 0,
    avgConfidence: null,
    openEscalations: 0,
  });
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/voice/stats", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as {
        ok: boolean;
        activeCalls: number;
        todayTotal: number;
        avgConfidence: number | null;
        openEscalations: number;
      };
      if (data.ok) {
        setStats({
          activeCalls: data.activeCalls,
          todayTotal: data.todayTotal,
          avgConfidence: data.avgConfidence,
          openEscalations: data.openEscalations,
        });
      }
    } catch {
      // network blip — keep stale values
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const poll = window.setInterval(() => void refresh(), POLL_MS);

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnon) return () => window.clearInterval(poll);

    const supabase = createClient();
    const channel = supabase
      .channel("call_stats_trigger")
      .on("postgres_changes", { event: "*", schema: "public", table: "call_sessions" }, () => { void refresh(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "escalations" }, () => { void refresh(); })
      .subscribe();

    return () => {
      window.clearInterval(poll);
      void supabase.removeChannel(channel);
    };
  }, [refresh]);

  return { stats, loading, refresh };
}
