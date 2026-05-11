import { create } from "zustand";
import type { AppAuthUser } from "@/lib/auth/mapSupabaseUser";

interface AuthState {
  user: AppAuthUser | null;
  setUser: (user: AppAuthUser | null) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  setUser: (user) => set({ user }),
  logout: () => set({ user: null }),
}));
