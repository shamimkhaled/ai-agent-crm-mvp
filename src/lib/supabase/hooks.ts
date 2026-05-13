import { useEffect, useRef } from "react";
import { createClient } from "./client";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

export type UseSupabaseRealtimeOptions = {
  /** e.g. `conversation_id=eq.<uuid>` */
  filter?: string;
  enabled?: boolean;
};

/**
 * Subscribes to one table via Supabase Realtime. Creates the browser client **inside** the effect
 * so we do not reconnect on every render (avoid `createClient` in the dependency array).
 */
export function useSupabaseRealtime<T extends { [key: string]: unknown }>(
  table: string,
  event: "INSERT" | "UPDATE" | "DELETE" | "*",
  callback: (payload: RealtimePostgresChangesPayload<T>) => void,
  options?: UseSupabaseRealtimeOptions
) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  const enabled = options?.enabled !== false;
  const filter = options?.filter;

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined") return;
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      return;
    }

    const supabase = createClient();
    const filterKey = filter ? encodeURIComponent(filter) : "all";
    const channelName = `realtime_${table}_${event}_${filterKey}`;

    const postgresFilter = filter
      ? ({ event, schema: "public" as const, table, filter } as const)
      : ({ event, schema: "public" as const, table } as const);

    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        postgresFilter,
        (payload: RealtimePostgresChangesPayload<T>) => {
          try {
            callbackRef.current(payload);
          } catch (e) {
            console.warn("[useSupabaseRealtime] callback error", table, e);
          }
        }
      )
      .subscribe((status, err) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn("[useSupabaseRealtime] channel", table, status, err?.message ?? err);
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [table, event, filter, enabled]);
}
