"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type EscalationRow = {
  id: string;
  call_sid: string | null;
  reason: string;
  status: string;
  meta: Record<string, unknown>;
  created_at: string;
  resolved_at: string | null;
};

function hasSupabaseBrowser() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

/**
 * Subscribes to the `escalations` table via Supabase Realtime.
 * Returns the open escalation queue and a helper to mark one resolved.
 */
export function useEscalationFeed() {
  const [escalations, setEscalations] = useState<EscalationRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!hasSupabaseBrowser()) return;
    setLoading(true);
    try {
      const supabase = createClient();
      const { data, error: dbErr } = await supabase
        .from("escalations")
        .select("id,call_sid,reason,status,meta,created_at,resolved_at")
        .eq("status", "open")
        .order("created_at", { ascending: false })
        .limit(30);
      if (dbErr) {
        setError(dbErr.message);
      } else {
        setEscalations((data ?? []) as EscalationRow[]);
        setError(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!hasSupabaseBrowser()) return;
    void load();

    const supabase = createClient();
    const channel = supabase
      .channel("escalation_feed")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "escalations" },
        () => { void load(); }
      )
      .subscribe((status, err) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          const msg = err instanceof Error ? err.message : String(err ?? status);
          setError(msg);
        }
      });

    return () => { void supabase.removeChannel(channel); };
  }, [load]);

  const resolveEscalation = useCallback(async (id: string) => {
    if (!hasSupabaseBrowser()) return;
    const supabase = createClient();
    await supabase
      .from("escalations")
      .update({ status: "resolved", resolved_at: new Date().toISOString() })
      .eq("id", id);
    void load();
  }, [load]);

  return {
    escalations,
    openCount: escalations.length,
    loading,
    error,
    resolveEscalation,
    reload: load,
    configured: hasSupabaseBrowser(),
  };
}
