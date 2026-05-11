"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  PhoneCall,
  Database,
  Users,
  Settings,
  BookOpen,
  BarChart3,
  Inbox,
  MessagesSquare,
  BrainCircuit,
  GitBranch,
  UserCircle,
  LogOut,
  ChevronUp,
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

interface NavItem {
  name: string;
  href: string;
  icon: LucideIcon;
}

const NavItems: NavItem[] = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Live Calls", href: "/calls", icon: PhoneCall },
  { name: "Conversations", href: "/conversations", icon: MessagesSquare },
  { name: "Inbox", href: "/inbox", icon: Inbox },
  { name: "Dealers", href: "/dealers", icon: Users },
  { name: "Knowledge Base", href: "/knowledge", icon: BookOpen },
  { name: "Connectors", href: "/connectors", icon: Database },
  { name: "Data mapping", href: "/connectors/mapping", icon: GitBranch },
  { name: "Analytics", href: "/analytics", icon: BarChart3 },
  { name: "AI Training", href: "/training", icon: BrainCircuit },
  { name: "Profile", href: "/profile", icon: UserCircle },
  { name: "Voice & Telephony", href: "/settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { sidebarOpen } = useUiStore();
  const { user, logout } = useAuthStore();
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
    <aside
      className={cn(
        "fixed left-0 top-0 z-40 h-screen transition-transform glass border-r",
        sidebarOpen ? "w-64 translate-x-0" : "w-20 -translate-x-full sm:translate-x-0"
      )}
    >
      <div className="h-full px-3 py-4 overflow-y-auto flex flex-col">
        <div className="flex items-center ps-2.5 mb-8 mt-2 shrink-0">
          <div className="w-8 h-8 rounded bg-primary flex items-center justify-center mr-3">
            <span className="text-primary-foreground font-bold text-lg">AI</span>
          </div>
          {sidebarOpen && (
            <span className="self-center text-xl font-semibold whitespace-nowrap dark:text-white">
              CRM Agent
            </span>
          )}
        </div>
        <ul className="space-y-2 font-medium flex-1 min-h-0">
          {NavItems.map((item) => {
            const isActive =
              pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
            const Icon = item.icon;
            return (
              <li key={item.name}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center p-2 rounded-lg group transition-colors",
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <Icon
                    className={cn(
                      "flex-shrink-0 w-5 h-5 transition duration-75",
                      isActive ? "text-primary" : "group-hover:text-foreground"
                    )}
                  />
                  {sidebarOpen && <span className="ms-3">{item.name}</span>}
                </Link>
              </li>
            );
          })}
        </ul>

        {sidebarOpen && user && (
          <div className="mt-auto pt-4 border-t border-border shrink-0">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="w-full justify-between h-auto py-2 px-2 font-normal hover:bg-muted/80"
                >
                  <div className="flex items-center gap-3 min-w-0 text-left">
                    <Avatar className="h-9 w-9 border border-border shrink-0">
                      {user.avatar ? <AvatarImage src={user.avatar} alt="" /> : null}
                      <AvatarFallback className="text-xs bg-primary/15 text-primary">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">{user.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                    </div>
                  </div>
                  <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground opacity-70" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="start" side="top">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium">{user.name}</span>
                    <span className="text-xs text-muted-foreground truncate">{user.email}</span>
                    <span className="text-xs text-muted-foreground capitalize">Role: {user.role}</span>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/profile">Profile & settings</Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={handleSignOut}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}

        {sidebarOpen && !user && (
          <div className="mt-auto pt-4 border-t border-border text-xs text-muted-foreground px-1">
            Loading account…
          </div>
        )}
      </div>
    </aside>
  );
}
