"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Menu, Bell, LogOut, UserCircle, Radio, Activity } from "lucide-react";
import { useUiStore } from "@/store/uiStore";
import { useAuthStore } from "@/store/authStore";
import { useCallStats } from "@/hooks/useCallStats";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export function TopNav() {
  const { toggleSidebar } = useUiStore();
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const { stats } = useCallStats();
  const supabase = createClient();

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

  return (
    <nav
      className="fixed top-0 z-30 h-16 flex items-center justify-between px-4 sm:px-6 border-b border-border"
      style={{
        left: 0,
        right: 0,
        background: "hsl(var(--surface-0) / 0.85)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
      }}
    >
      {/* Left: sidebar toggle */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleSidebar}
          className="shrink-0 text-muted-foreground hover:text-foreground h-9 w-9"
        >
          <Menu className="h-4.5 w-4.5" size={18} />
        </Button>

        {/* Live call pill */}
        {stats.activeCalls > 0 && (
          <Link href="/calls" className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[hsl(var(--emerald))/10] border border-[hsl(var(--emerald))/25] hover:bg-[hsl(var(--emerald))/15] transition-colors">
            <span className="status-dot live" />
            <span className="text-xs font-mono font-medium text-[hsl(var(--emerald))]">
              {stats.activeCalls} live {stats.activeCalls === 1 ? "call" : "calls"}
            </span>
            <Radio size={11} className="text-[hsl(var(--emerald))]" />
          </Link>
        )}
      </div>

      {/* Center: System status */}
      <div className="hidden md:flex items-center gap-4">
        <div className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground">
          <span className="status-dot live" />
          <span>Gemini</span>
        </div>
        <div className="w-px h-4 bg-border" />
        <div className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground">
          <span className="status-dot live" />
          <span>Twilio</span>
        </div>
        <div className="w-px h-4 bg-border" />
        <div className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground">
          <Activity size={11} />
          <span>{stats.todayTotal} calls today</span>
        </div>
        {stats.openEscalations > 0 && (
          <>
            <div className="w-px h-4 bg-border" />
            <Link href="/calls" className="flex items-center gap-1.5 text-xs font-mono text-[hsl(var(--rose))] hover:text-[hsl(var(--rose))/80]">
              <span className="status-dot error" />
              {stats.openEscalations} escalation{stats.openEscalations !== 1 ? "s" : ""}
            </Link>
          </>
        )}
      </div>

      {/* Right: actions */}
      <div className="flex items-center gap-2">
        {/* Notifications */}
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9 text-muted-foreground hover:text-foreground"
          aria-label="Notifications"
        >
          <Bell size={16} />
          {stats.openEscalations > 0 && (
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[hsl(var(--rose))]" />
          )}
        </Button>

        {/* User avatar */}
        {user && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-9 w-9 rounded-full p-0">
                <Avatar className="h-8 w-8 border border-border">
                  {user.avatar ? <AvatarImage src={user.avatar} alt="" /> : null}
                  <AvatarFallback className="text-xs bg-[hsl(var(--primary))/15] text-[hsl(var(--primary))] font-semibold">
                    {initials}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-56 bg-[hsl(var(--surface-1))] border-border"
            >
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-semibold text-foreground truncate">{user.name}</span>
                  <span className="text-xs text-muted-foreground font-mono truncate">{user.email}</span>
                  <span className={cn("text-xs capitalize font-mono", "text-[hsl(var(--primary))]")}>{user.role}</span>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-border" />
              <DropdownMenuItem asChild className="focus:bg-[hsl(var(--surface-2))]">
                <Link href="/profile" className="flex items-center">
                  <UserCircle className="mr-2 h-4 w-4" />
                  Profile & settings
                </Link>
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
        )}
      </div>
    </nav>
  );
}
