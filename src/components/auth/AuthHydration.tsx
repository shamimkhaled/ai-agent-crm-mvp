"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { mapSupabaseUser } from "@/lib/auth/mapSupabaseUser";
import { useAuthStore } from "@/store/authStore";

/**
 * Keeps Zustand auth in sync with Supabase session (SSR middleware already protects routes).
 */
export function AuthHydration() {
  const setUser = useAuthStore((s) => s.setUser);

  useEffect(() => {
    const supabase = createClient();

    void supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user ? mapSupabaseUser(user) : null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ? mapSupabaseUser(session.user) : null);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [setUser]);

  return null;
}
