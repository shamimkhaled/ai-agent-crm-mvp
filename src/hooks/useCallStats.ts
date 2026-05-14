"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
 *
 * IMPORTANT: Every mount gets a unique channel name so that multiple
 * simultaneous consumers (Sidebar, TopNav, Dashboard) never share the
 * same Supabase Realtime channel object — which would trigger the
 * "cannot add postgres_changes callbacks after subscribe()" error.
 */
export function useCallStats() {
  const [stats, setStats] = useState<CallStats>({
    activeCalls: 0,
    todayTotal: 0,
    avgConfidence: null,
    openEscalations: 0,
  });
  const [loading, setLoading] = useState(true);

  // Stable, unique channel name for this hook instance
  const channelName = useRef<string>("");
  if (!channelName.current) {
    // Use crypto.randomUUID when available (all modern browsers + Node 19+),
    // otherwise fall back to a timestamp + random suffix.
    channelName.current =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? `call_stats_${crypto.randomUUID()}`
        : `call_stats_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  }

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
    // Guard: only run in browser (not during SSR/RSC)
    if (typeof window === "undefined") return;

    void refresh();
    const poll = window.setInterval(() => void refresh(), POLL_MS);

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnon) {
      return () => window.clearInterval(poll);
    }

    const supabase = createClient();

    // Each instance gets a fresh unique channel — never reuses a shared one.
    const channel = supabase
      .channel(channelName.current)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "call_sessions" },
        () => { void refresh(); }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "escalations" },
        () => { void refresh(); }
      )
      .subscribe();

    return () => {
      window.clearInterval(poll);
      void supabase.removeChannel(channel);
    };
  }, [refresh]); // channelName.current is stable so no dep needed

  return { stats, loading, refresh };
}
