"use client";

import { useAuthStore } from "@/store/authStore";
import { useCallStats } from "@/hooks/useCallStats";
import { useLiveVoiceDashboard, type CallSessionRow } from "@/hooks/useLiveVoiceDashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  AreaChart, Area, BarChart, Bar, ResponsiveContainer,
  XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";
import {
  PhoneCall, BrainCircuit, TrendingUp, AlertTriangle,
  Zap, Activity, ArrowUpRight, ArrowDownRight,
  ChevronRight, Radio, RefreshCw, Clock,
} from "lucide-react";
import Link from "next/link";

const weekData = [
  { day: "Mon", calls: 142, resolved: 118, escalated: 24 },
  { day: "Tue", calls: 189, resolved: 162, escalated: 27 },
  { day: "Wed", calls: 230, resolved: 195, escalated: 35 },
  { day: "Thu", calls: 167, resolved: 141, escalated: 26 },
  { day: "Fri", calls: 312, resolved: 278, escalated: 34 },
  { day: "Sat", calls: 98,  resolved: 89,  escalated: 9  },
  { day: "Sun", calls: 45,  resolved: 42,  escalated: 3  },
];

const latencyData = [
  { t: "00:00", ms: 820 }, { t: "04:00", ms: 740 }, { t: "08:00", ms: 1020 },
  { t: "12:00", ms: 890 }, { t: "16:00", ms: 1140 }, { t: "20:00", ms: 760 },
  { t: "Now",   ms: 680 },
];

interface MetricCardProps {
  title: string;
  value: string | number;
  unit?: string;
  change?: number;
  icon: React.ReactNode;
  color: "cyan" | "violet" | "emerald" | "amber" | "rose";
  loading?: boolean;
}

function MetricCard({ title, value, unit, change, icon, color, loading }: MetricCardProps) {
  const colorMap = {
    cyan:    { bg: "hsl(var(--cyan)   / 0.08)", border: "hsl(var(--cyan)   / 0.2)", text: "hsl(var(--cyan))",    glow: "hsl(var(--cyan)   / 0.12)" },
    violet:  { bg: "hsl(var(--violet) / 0.08)", border: "hsl(var(--violet) / 0.2)", text: "hsl(var(--violet))", glow: "hsl(var(--violet) / 0.12)" },
    emerald: { bg: "hsl(var(--emerald)/ 0.08)", border: "hsl(var(--emerald)/ 0.2)", text: "hsl(var(--emerald))",glow: "hsl(var(--emerald)/ 0.12)" },
    amber:   { bg: "hsl(var(--amber)  / 0.08)", border: "hsl(var(--amber)  / 0.2)", text: "hsl(var(--amber))",  glow: "hsl(var(--amber)  / 0.12)" },
    rose:    { bg: "hsl(var(--rose)   / 0.08)", border: "hsl(var(--rose)   / 0.2)", text: "hsl(var(--rose))",   glow: "hsl(var(--rose)   / 0.12)" },
  };
  const c = colorMap[color];

  return (
    <div
      className="glass rounded-xl p-5 flex flex-col gap-3"
      style={{ borderColor: c.border, boxShadow: `0 0 20px ${c.glow}` }}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest">{title}</p>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: c.bg }}>
          <span style={{ color: c.text }}>{icon}</span>
        </div>
      </div>
      {loading ? (
        <div className="h-8 w-24 rounded bg-[hsl(var(--surface-2))] animate-pulse" />
      ) : (
        <div className="flex items-end gap-2">
          <span className="metric-value text-3xl text-foreground" style={{ color: c.text }}>{value}</span>
          {unit && <span className="text-sm text-muted-foreground mb-0.5">{unit}</span>}
        </div>
      )}
      {change !== undefined && (
        <div className={cn("flex items-center gap-1 text-xs font-mono", change >= 0 ? "text-[hsl(var(--emerald))]" : "text-[hsl(var(--rose))]")}>
          {change >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
          {Math.abs(change)}% vs yesterday
        </div>
      )}
    </div>
  );
}

function PipelineStep({ label, active, index }: { label: string; active?: boolean; index: number }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <motion.div
        className={cn(
          "w-8 h-8 rounded-lg flex items-center justify-center text-xs font-mono font-bold border",
          active
            ? "bg-[hsl(var(--cyan))/15] border-[hsl(var(--cyan))/50] text-[hsl(var(--cyan))]"
            : "bg-[hsl(var(--surface-2))] border-border text-muted-foreground"
        )}
        animate={active ? { boxShadow: ["0 0 0px hsl(var(--cyan)/0.5)", "0 0 12px hsl(var(--cyan)/0.3)", "0 0 0px hsl(var(--cyan)/0.5)"] } : {}}
        transition={{ repeat: Infinity, duration: 2 }}
      >
        {index + 1}
      </motion.div>
      <span className="text-[10px] text-muted-foreground font-mono text-center leading-tight max-w-[60px]">{label}</span>
    </div>
  );
}

const PIPELINE_STEPS = ["STT", "Intent", "RAG", "Gemini", "TTS", "Twilio"];

export default function Dashboard() {
  const { user } = useAuthStore();
  const { stats, loading: statsLoading } = useCallStats();
  const { sessions: activeSessions } = useLiveVoiceDashboard();

  const resolutionRate = stats.todayTotal > 0
    ? Math.round(((stats.todayTotal - stats.openEscalations) / stats.todayTotal) * 100)
    : 94;

  return (
    <div className="space-y-6 pb-16">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <motion.div
        className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div>
          <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: "Syne, sans-serif" }}>
            Command Center
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
            {user ? ` — Welcome, ${user.name}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {stats.activeCalls > 0 && (
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[hsl(var(--emerald))/10] border border-[hsl(var(--emerald))/25]"
            >
              <span className="status-dot live" />
              <span className="text-xs font-mono text-[hsl(var(--emerald))] font-medium">
                {stats.activeCalls} live
              </span>
            </motion.div>
          )}
          <Button variant="outline" size="sm" className="border-border text-muted-foreground hover:text-foreground gap-1.5" asChild>
            <Link href="/calls">
              <Radio size={14} />
              Monitor calls
              <ChevronRight size={12} />
            </Link>
          </Button>
        </div>
      </motion.div>

      {/* ── Metrics Grid ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            title: "Active Calls",
            value: statsLoading ? "—" : stats.activeCalls,
            icon: <Radio size={16} />,
            color: "cyan" as const,
            change: 12,
          },
          {
            title: "Today Total",
            value: statsLoading ? "—" : stats.todayTotal,
            icon: <PhoneCall size={16} />,
            color: "violet" as const,
            change: 8,
          },
          {
            title: "AI Resolution",
            value: statsLoading ? "—" : `${resolutionRate}`,
            unit: "%",
            icon: <BrainCircuit size={16} />,
            color: "emerald" as const,
            change: 3,
          },
          {
            title: "Escalations",
            value: statsLoading ? "—" : stats.openEscalations,
            icon: <AlertTriangle size={16} />,
            color: "rose" as const,
            change: -2,
          },
        ].map((m, i) => (
          <motion.div
            key={m.title}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.07, duration: 0.4 }}
          >
            <MetricCard {...m} loading={statsLoading} />
          </motion.div>
        ))}
      </div>

      {/* ── AI Pipeline Status ───────────────────────────────────── */}
      <motion.div
        className="glass rounded-xl p-5"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Zap size={16} className="text-[hsl(var(--cyan))]" />
            <h3 className="text-sm font-semibold text-foreground" style={{ fontFamily: "Syne, sans-serif" }}>
              AI Voice Pipeline
            </h3>
            <Badge className="bg-[hsl(var(--emerald))/15] text-[hsl(var(--emerald))] border-[hsl(var(--emerald))/30] text-[10px] font-mono">
              OPERATIONAL
            </Badge>
          </div>
          <span className="text-[11px] font-mono text-muted-foreground">avg latency: 680ms</span>
        </div>
        <div className="flex items-center gap-3 overflow-x-auto pb-1">
          {PIPELINE_STEPS.map((step, i) => (
            <div key={step} className="flex items-center gap-3 flex-shrink-0">
              <PipelineStep label={step} active={stats.activeCalls > 0} index={i} />
              {i < PIPELINE_STEPS.length - 1 && (
                <div className="w-6 h-px bg-gradient-to-r from-[hsl(var(--cyan)/0.5)] to-[hsl(var(--cyan)/0.1)]" />
              )}
            </div>
          ))}
        </div>
      </motion.div>

      {/* ── Charts ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Call volume chart */}
        <motion.div
          className="lg:col-span-2"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
        >
          <Card className="glass h-full border-border">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-sm font-semibold" style={{ fontFamily: "Syne, sans-serif" }}>Call Volume</CardTitle>
                <p className="text-xs text-muted-foreground font-mono mt-0.5">7-day breakdown</p>
              </div>
              <div className="flex items-center gap-4 text-xs">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <span className="w-3 h-1.5 rounded-sm bg-[hsl(var(--cyan))] inline-block" />
                  Total
                </span>
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <span className="w-3 h-1.5 rounded-sm bg-[hsl(var(--rose))] inline-block" />
                  Escalated
                </span>
              </div>
            </CardHeader>
            <CardContent className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weekData} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="day" fontSize={11} tickLine={false} axisLine={false} style={{ fontFamily: "JetBrains Mono" }} />
                  <YAxis fontSize={11} tickLine={false} axisLine={false} style={{ fontFamily: "JetBrains Mono" }} />
                  <Tooltip
                    cursor={{ fill: "hsl(var(--primary) / 0.05)" }}
                    contentStyle={{
                      background: "hsl(var(--surface-1))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: "12px",
                      fontFamily: "JetBrains Mono",
                    }}
                  />
                  <Bar dataKey="calls" fill="hsl(var(--cyan))" radius={[4, 4, 0, 0]} opacity={0.85} />
                  <Bar dataKey="escalated" fill="hsl(var(--rose))" radius={[4, 4, 0, 0]} opacity={0.85} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </motion.div>

        {/* Latency trend */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.32 }}
        >
          <Card className="glass h-full border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold" style={{ fontFamily: "Syne, sans-serif" }}>AI Response Latency</CardTitle>
              <p className="text-xs text-muted-foreground font-mono">Gemini P50 (ms)</p>
            </CardHeader>
            <CardContent className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={latencyData} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
                  <defs>
                    <linearGradient id="latencyGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--violet))" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="hsl(var(--violet))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="t" fontSize={10} tickLine={false} axisLine={false} style={{ fontFamily: "JetBrains Mono" }} />
                  <YAxis fontSize={10} tickLine={false} axisLine={false} style={{ fontFamily: "JetBrains Mono" }} />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--surface-1))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: "11px",
                      fontFamily: "JetBrains Mono",
                    }}
                    formatter={(val) => [`${val}ms`, "Latency"]}
                  />
                  <Area dataKey="ms" stroke="hsl(var(--violet))" fill="url(#latencyGrad)" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* ── Live Calls + Quick Actions ───────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent calls */}
        <motion.div
          className="lg:col-span-2"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
        >
          <Card className="glass border-border h-full">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-sm font-semibold" style={{ fontFamily: "Syne, sans-serif" }}>
                Live & Recent Calls
              </CardTitle>
              <Button variant="ghost" size="sm" className="text-xs text-muted-foreground gap-1" asChild>
                <Link href="/calls">
                  View all <ChevronRight size={12} />
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              {activeSessions.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 gap-2 text-center">
                  <Activity size={24} className="text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">No active calls right now</p>
                  <p className="text-xs text-muted-foreground/60 font-mono">Dashboard updates in real-time</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {activeSessions.slice(0, 5).map((session: CallSessionRow) => (
                    <div
                      key={session.call_sid}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-[hsl(var(--surface-2))] hover:bg-[hsl(var(--surface-3))] transition-colors"
                    >
                      <span className="status-dot live" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{session.caller_display_name || session.from_e164 || "Unknown"}</p>
                        <p className="text-xs text-muted-foreground font-mono truncate">{session.agent_id || "AI Agent"}</p>
                      </div>
                      <div className="text-right">
                        <Badge variant="outline" className={cn(
                          "text-[10px] font-mono",
                          session.dashboard_state === "speaking" && "border-[hsl(var(--cyan))/40] text-[hsl(var(--cyan))]",
                          session.dashboard_state === "thinking" && "border-[hsl(var(--amber))/40] text-[hsl(var(--amber))]",
                        )}>
                          {session.dashboard_state ?? "active"}
                        </Badge>
                        {session.ai_confidence && (
                          <p className="text-[10px] font-mono text-muted-foreground mt-0.5">{session.ai_confidence}% conf</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Quick actions */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <Card className="glass border-border h-full">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold" style={{ fontFamily: "Syne, sans-serif" }}>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {[
                { label: "Create AI Agent", href: "/agents", icon: <BrainCircuit size={14} />, color: "cyan" },
                { label: "Add Connector", href: "/connectors", icon: <Zap size={14} />, color: "violet" },
                { label: "Upload Knowledge", href: "/knowledge", icon: <TrendingUp size={14} />, color: "emerald" },
                { label: "View Pipeline Logs", href: "/settings/pipeline-logs", icon: <Activity size={14} />, color: "amber" },
                { label: "Configure Webhooks", href: "/settings/webhooks", icon: <RefreshCw size={14} />, color: "rose" },
              ].map((action) => (
                <Link
                  key={action.href}
                  href={action.href}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-[hsl(var(--surface-2))] hover:bg-[hsl(var(--surface-3))] transition-all group"
                >
                  <span className={cn(
                    "w-7 h-7 rounded-lg flex items-center justify-center text-xs transition-colors",
                    action.color === "cyan" && "bg-[hsl(var(--cyan))/10] text-[hsl(var(--cyan))] group-hover:bg-[hsl(var(--cyan))/20]",
                    action.color === "violet" && "bg-[hsl(var(--violet))/10] text-[hsl(var(--violet))] group-hover:bg-[hsl(var(--violet))/20]",
                    action.color === "emerald" && "bg-[hsl(var(--emerald))/10] text-[hsl(var(--emerald))] group-hover:bg-[hsl(var(--emerald))/20]",
                    action.color === "amber" && "bg-[hsl(var(--amber))/10] text-[hsl(var(--amber))] group-hover:bg-[hsl(var(--amber))/20]",
                    action.color === "rose" && "bg-[hsl(var(--rose))/10] text-[hsl(var(--rose))] group-hover:bg-[hsl(var(--rose))/20]",
                  )}>
                    {action.icon}
                  </span>
                  <span className="text-sm text-foreground font-medium flex-1">{action.label}</span>
                  <ChevronRight size={14} className="text-muted-foreground group-hover:text-foreground transition-colors" />
                </Link>
              ))}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* ── Performance stats row ─────────────────────────────────── */}
      <motion.div
        className="grid grid-cols-2 sm:grid-cols-4 gap-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.45 }}
      >
        {[
          { label: "Avg Confidence", value: stats.avgConfidence ? `${stats.avgConfidence}%` : "—", icon: <BrainCircuit size={12} /> },
          { label: "Avg Handle Time", value: "2m 34s", icon: <Clock size={12} /> },
          { label: "KB Chunks", value: "1,284", icon: <Activity size={12} /> },
          { label: "Embeddings", value: "768-dim", icon: <Zap size={12} /> },
        ].map((stat) => (
          <div key={stat.label} className="glass rounded-xl p-4 flex items-center gap-3">
            <span className="text-[hsl(var(--cyan))]">{stat.icon}</span>
            <div>
              <p className="metric-value text-lg text-foreground">{stat.value}</p>
              <p className="text-[10px] font-mono text-muted-foreground mt-0.5">{stat.label}</p>
            </div>
          </div>
        ))}
      </motion.div>
    </div>
  );
}
