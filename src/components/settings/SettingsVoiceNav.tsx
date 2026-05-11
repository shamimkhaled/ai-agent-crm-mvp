"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Radio,
  MessageCircle,
  Bot,
  GitBranch,
  Webhook,
  Activity,
  ListTree,
  Waves,
  LayoutGrid,
} from "lucide-react";
import { cn } from "@/lib/utils";

const groups: {
  label: string;
  hint: string;
  links: { href: string; label: string; icon: typeof Radio; exact?: boolean }[];
}[] = [
  {
    label: "Start here",
    hint: "Connect carriers and voice transport",
    links: [
      { href: "/settings", label: "Overview", icon: LayoutGrid, exact: true },
      { href: "/settings/telephony", label: "Phone provider", icon: Radio },
      { href: "/settings/whatsapp", label: "WhatsApp", icon: MessageCircle },
      { href: "/settings/media-stream", label: "Audio & AI speech", icon: Waves },
    ],
  },
  {
    label: "AI & routing",
    hint: "Who answers and when",
    links: [
      { href: "/settings/voice-agents", label: "Voice agents", icon: Bot },
      { href: "/settings/routing", label: "Call routing", icon: GitBranch },
    ],
  },
  {
    label: "Operations",
    hint: "Observe traffic like Retool / HubSpot",
    links: [
      { href: "/settings/webhooks", label: "Webhooks & logs", icon: Webhook },
      { href: "/settings/monitoring", label: "Live health", icon: Activity },
      { href: "/settings/pipeline-logs", label: "Voice pipeline", icon: ListTree },
    ],
  },
];

export function SettingsVoiceNav() {
  const pathname = usePathname();

  return (
    <div className="space-y-6 mb-8">
      {groups.map((group) => (
        <div key={group.label}>
          <div className="mb-2 px-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{group.label}</p>
            <p className="text-[11px] text-muted-foreground/80">{group.hint}</p>
          </div>
          <nav className="flex flex-wrap gap-2">
            {group.links.map(({ href, label, icon: Icon, exact }) => {
              const active = exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors border",
                    active
                      ? "bg-primary/15 text-primary border-primary/40"
                      : "text-muted-foreground border-transparent hover:bg-muted hover:text-foreground"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>
      ))}
    </div>
  );
}
