import type { User } from "@supabase/supabase-js";

export type AppAuthUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar?: string | null;
};

/** Normalizes raw metadata values to display labels. */
export function formatRoleLabel(raw: string): string {
  const t = raw.trim();
  if (!t) return "Admin";
  const key = t.toLowerCase().replace(/\s+/g, "_");
  if (key === "super_admin" || key === "superadmin") return "Super Admin";
  if (key === "admin") return "Admin";
  if (key === "manager") return "Manager";
  if (key === "agent") return "Agent";
  return t;
}

function superAdminEmails(): string[] {
  const fromEnv =
    (process.env.NEXT_PUBLIC_SUPER_ADMIN_EMAILS ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
  /** Primary workspace owner — extend via NEXT_PUBLIC_SUPER_ADMIN_EMAILS */
  const defaults = ["i.amshamim94@gmail.com"];
  return Array.from(new Set([...defaults, ...fromEnv]));
}

function resolveRole(user: User): string {
  const meta = user.user_metadata ?? {};
  const app = user.app_metadata ?? {};
  const rawMeta =
    (typeof meta.role === "string" && meta.role.trim()) ||
    (typeof app.role === "string" && app.role.trim()) ||
    "";
  if (rawMeta) return formatRoleLabel(rawMeta);

  const email = user.email?.toLowerCase() ?? "";
  if (email && superAdminEmails().includes(email)) return "Super Admin";

  return "Admin";
}

export function mapSupabaseUser(user: User): AppAuthUser {
  const meta = user.user_metadata ?? {};
  const name =
    (typeof meta.full_name === "string" && meta.full_name.trim()) ||
    user.email?.split("@")[0] ||
    "User";
  const role = resolveRole(user);
  const avatar =
    typeof meta.avatar_url === "string" && meta.avatar_url.trim()
      ? meta.avatar_url.trim()
      : null;

  return {
    id: user.id,
    name,
    email: user.email ?? "",
    role,
    avatar: avatar || undefined,
  };
}
