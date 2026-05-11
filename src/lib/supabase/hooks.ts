import { useEffect } from 'react';
import { createClient } from './client';
import { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

export function useSupabaseRealtime<T extends { [key: string]: any }>(
  table: string,
  event: 'INSERT' | 'UPDATE' | 'DELETE' | '*',
  callback: (payload: RealtimePostgresChangesPayload<T>) => void
) {
  const supabase = createClient();

  useEffect(() => {
    const channel = supabase
      .channel(`realtime_${table}`)
      .on(
        'postgres_changes',
        { event: event, schema: 'public', table: table },
        (payload: RealtimePostgresChangesPayload<T>) => {
          callback(payload);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, table, event, callback]);
}
