"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  PhoneCall,
  Database,
  Settings,
  BookOpen,
  BarChart3,
  Inbox,
  MessagesSquare,
  BrainCircuit,
  Bot,
  UserCircle,
  LogOut,
  ChevronUp,
  Zap,
  Radio,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/store/uiStore";
import { useAuthStore } from "@/store/authStore";
import { createClient } from "@/lib/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useCallStats } from "@/hooks/useCallStats";
import { motion, AnimatePresence } from "framer-motion";

interface NavItem {
  name: string;
  href: string;
  icon: LucideIcon;
  badge?: string;
  badgeColor?: string;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    label: "Operations",
    items: [
      { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { name: "Live Calls", href: "/calls", icon: PhoneCall, badge: "LIVE", badgeColor: "emerald" },
      { name: "Conversations", href: "/conversations", icon: MessagesSquare },
      { name: "Inbox", href: "/inbox", icon: Inbox },
    ],
  },
  {
    label: "AI Platform",
    items: [
      { name: "AI Agents", href: "/agents", icon: Bot },
      { name: "Knowledge Base", href: "/knowledge", icon: BookOpen },
      { name: "Connectors", href: "/connectors", icon: Database },
      { name: "AI Training", href: "/training", icon: BrainCircuit },
    ],
  },
  {
    label: "Analytics",
    items: [
      { name: "Analytics", href: "/analytics", icon: BarChart3 },
      { name: "Voice & Routing", href: "/settings", icon: Radio },
    ],
  },
  {
    label: "Account",
    items: [
      { name: "Profile", href: "/profile", icon: UserCircle },
      { name: "API Credentials", href: "/settings/credentials", icon: Settings },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { sidebarOpen } = useUiStore();
  const { user, logout } = useAuthStore();
  const supabase = createClient();
  const { stats } = useCallStats();

  const activeCallCount = stats?.activeCalls ?? 0;

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    logout();
    router.push("/auth/login");
    router.refresh();
  };

  const initials = (user?.name || user?.email || "?")
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const isActive = (href: string) =>
    pathname === href || (href !== "/" && pathname.startsWith(href));

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-40 h-screen transition-all duration-300 ease-in-out",
        "flex flex-col",
        "border-r border-border",
        "bg-[hsl(var(--surface-0))]",
        sidebarOpen ? "w-64" : "w-[72px] -translate-x-full sm:translate-x-0"
      )}
    >
      {/* ── Logo ────────────────────────────────────────────────────── */}
      <div className={cn(
        "flex items-center h-16 shrink-0 px-4 border-b border-border",
        sidebarOpen ? "gap-3" : "justify-center"
      )}>
        <div className="relative flex-shrink-0">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[hsl(var(--cyan))] to-[hsl(var(--violet))] flex items-center justify-center shadow-lg">
            <Zap className="w-5 h-5 text-white" />
          </div>
          {activeCallCount > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[hsl(var(--emerald))] text-[9px] font-bold text-white flex items-center justify-center shadow-sm">
              {activeCallCount > 9 ? "9+" : activeCallCount}
            </span>
          )}
        </div>
        <AnimatePresence>
          {sidebarOpen && (
            <motion.div
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: "auto" }}
              exit={{ opacity: 0, width: 0 }}
              className="overflow-hidden whitespace-nowrap"
            >
              <p className="text-sm font-bold text-foreground" style={{ fontFamily: "Syne, sans-serif", letterSpacing: "-0.02em" }}>
                NeuralCRM
              </p>
              <p className="text-[10px] text-muted-foreground font-mono tracking-wider uppercase">
                AI Voice Platform
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Active calls indicator ───────────────────────────────────── */}
      {activeCallCount > 0 && sidebarOpen && (
        <div className="mx-3 mt-3 px-3 py-2 rounded-lg bg-[hsl(var(--emerald))/10] border border-[hsl(var(--emerald))/25] flex items-center gap-2">
          <span className="status-dot live" />
          <span className="text-xs text-[hsl(var(--emerald))] font-mono font-medium">
            {activeCallCount} active call{activeCallCount !== 1 ? "s" : ""}
          </span>
        </div>
      )}

      {/* ── Navigation ──────────────────────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-6">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label}>
            <AnimatePresence>
              {sidebarOpen && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase mb-2 px-2"
                  style={{ fontFamily: "JetBrains Mono, monospace" }}
                >
                  {section.label}
                </motion.p>
              )}
            </AnimatePresence>

            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active = isActive(item.href);
                const Icon = item.icon;
                return (
                  <li key={item.name}>
                    <Link
                      href={item.href}
                      className={cn(
                        "relative flex items-center gap-3 px-2 py-2.5 rounded-lg group transition-all duration-150",
                        active
                          ? "bg-[hsl(var(--primary))/10] text-[hsl(var(--primary))]"
                          : "text-muted-foreground hover:bg-[hsl(var(--surface-2))] hover:text-foreground"
                      )}
                      title={!sidebarOpen ? item.name : undefined}
                    >
                      {active && <span className="nav-active-bar" />}
                      <Icon
                        className={cn(
                          "flex-shrink-0 w-4.5 h-4.5 transition-colors",
                          active ? "text-[hsl(var(--primary))]" : "group-hover:text-foreground"
                        )}
                        size={18}
                      />
                      <AnimatePresence>
                        {sidebarOpen && (
                          <motion.span
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -8 }}
                            className="text-sm font-medium whitespace-nowrap flex-1"
                          >
                            {item.name}
                          </motion.span>
                        )}
                      </AnimatePresence>
                      {sidebarOpen && item.badge && (
                        <span className={cn(
                          "text-[9px] font-bold font-mono tracking-wider px-1.5 py-0.5 rounded-full",
                          item.badgeColor === "emerald"
                            ? "bg-[hsl(var(--emerald))/15] text-[hsl(var(--emerald))] border border-[hsl(var(--emerald))/30]"
                            : "bg-primary/15 text-primary border border-primary/30"
                        )}>
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* ── System health ───────────────────────────────────────────── */}
      {sidebarOpen && (
        <div className="px-3 py-3 border-t border-border">
          <div className="px-2 py-2 rounded-lg bg-[hsl(var(--surface-2))] space-y-1.5">
            <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">System</p>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="status-dot live" />
                <span className="text-xs text-muted-foreground">Gemini</span>
              </div>
              <span className="text-[10px] font-mono text-[hsl(var(--emerald))]">online</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="status-dot live" />
                <span className="text-xs text-muted-foreground">Twilio</span>
              </div>
              <span className="text-[10px] font-mono text-[hsl(var(--emerald))]">online</span>
            </div>
          </div>
        </div>
      )}

      {/* ── User profile ─────────────────────────────────────────────── */}
      <div className="px-3 py-3 border-t border-border shrink-0">
        {sidebarOpen && user ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="w-full justify-between h-auto py-2 px-2 font-normal hover:bg-[hsl(var(--surface-2))]"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Avatar className="h-8 w-8 border border-border shrink-0">
                    {user.avatar ? <AvatarImage src={user.avatar} alt="" /> : null}
                    <AvatarFallback className="text-xs bg-[hsl(var(--primary))/15] text-[hsl(var(--primary))] font-semibold">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 text-left">
                    <p className="text-sm font-medium text-foreground truncate leading-tight">{user.name}</p>
                    <p className="text-[11px] text-muted-foreground truncate font-mono">{user.email}</p>
                  </div>
                </div>
                <ChevronUp className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56 bg-[hsl(var(--surface-1))] border-border" align="start" side="top">
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-semibold text-foreground">{user.name}</span>
                  <span className="text-xs text-muted-foreground font-mono truncate">{user.email}</span>
                  <span className="text-xs text-[hsl(var(--primary))] capitalize">Role: {user.role}</span>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-border" />
              <DropdownMenuItem asChild className="focus:bg-[hsl(var(--surface-2))]">
                <Link href="/profile">Profile & settings</Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-border" />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive focus:bg-destructive/10"
                onClick={handleSignOut}
              >
                <LogOut className="mr-2 h-4 w-4" />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : !sidebarOpen ? (
          <div className="flex justify-center">
            <Avatar className="h-8 w-8 border border-border cursor-pointer">
              <AvatarFallback className="text-xs bg-[hsl(var(--primary))/15] text-[hsl(var(--primary))] font-semibold">
                {initials}
              </AvatarFallback>
            </Avatar>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
