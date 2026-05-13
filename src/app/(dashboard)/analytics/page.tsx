"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import { Loader2 } from "lucide-react";
import { useSupabaseRealtime } from "@/lib/supabase/hooks";

type AnalyticsEventRow = {
  id: string;
  event_type: string;
  created_at: string;
};

type EscalationRow = {
  id: string;
  status: string;
  created_at: string;
  resolved_at: string | null;
};

function bucketHour(iso: string): string {
  const d = new Date(iso);
  return `${d.getHours().toString().padStart(2, "0")}:00`;
}

function hasSupabase(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

export default function AnalyticsDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [inboxTotal, setInboxTotal] = useState(0);
  const [resolvedInbox, setResolvedInbox] = useState(0);
  const [feedLines, setFeedLines] = useState(0);
  const [events24h, setEvents24h] = useState<AnalyticsEventRow[]>([]);
  const [escalations, setEscalations] = useState<EscalationRow[]>([]);
  const [intentRows, setIntentRows] = useState<{ intent: string | null }[]>([]);
  const [channelRows, setChannelRows] = useState<{ channel: string | null }[]>([]);

  const load = useCallback(async () => {
    if (!hasSupabase()) {
      setLoading(false);
      return;
    }
    const supabase = createClient();
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [
      inboxCount,
      resolvedCount,
      feedCount,
      ev,
      esc,
      intents,
      channels,
    ] = await Promise.all([
      supabase.from("conversations").select("id", { count: "exact", head: true }),
      supabase.from("conversations").select("id", { count: "exact", head: true }).eq("status", "resolved"),
      supabase.from("live_calls_feed").select("id", { count: "exact", head: true }),
      supabase.from("analytics_events").select("id,event_type,created_at").gte("created_at", since).limit(2000),
      supabase.from("escalations").select("id,status,created_at,resolved_at").limit(500),
      supabase.from("live_calls_feed").select("intent").not("intent", "is", null).limit(400),
      supabase.from("conversations").select("channel").limit(400),
    ]);

    setInboxTotal(inboxCount.count ?? 0);
    setResolvedInbox(resolvedCount.count ?? 0);
    setFeedLines(feedCount.count ?? 0);
    setEvents24h((ev.error ? [] : ev.data ?? []) as AnalyticsEventRow[]);
    setEscalations((esc.error ? [] : esc.data ?? []) as EscalationRow[]);
    setIntentRows((intents.error ? [] : intents.data ?? []) as { intent: string | null }[]);
    setChannelRows((channels.error ? [] : channels.data ?? []) as { channel: string | null }[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  useSupabaseRealtime<AnalyticsEventRow>("analytics_events", "INSERT", () => {
    setRefreshKey((k) => k + 1);
  });

  const totalInbound = inboxTotal + feedLines;
  const resolutionPct =
    inboxTotal > 0 ? Math.round((resolvedInbox / inboxTotal) * 1000) / 10 : 0;

  const avgWaitSec = useMemo(() => {
    const resolved = escalations.filter((e) => e.resolved_at && e.status === "resolved");
    if (!resolved.length) return null;
    let sum = 0;
    for (const e of resolved) {
      sum +=
        (new Date(e.resolved_at as string).getTime() - new Date(e.created_at).getTime()) / 1000;
    }
    return Math.round(sum / resolved.length);
  }, [escalations]);

  const topChannel = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of channelRows) {
      const c = (r.channel || "Other").trim();
      m.set(c, (m.get(c) ?? 0) + 1);
    }
    let best = "—";
    let bestN = 0;
    for (const [k, v] of Array.from(m.entries())) {
      if (v > bestN) {
        best = k;
        bestN = v;
      }
    }
    const pct = channelRows.length ? Math.round((bestN / channelRows.length) * 100) : 0;
    return { label: best, pct };
  }, [channelRows]);

  const timelineData = useMemo(() => {
    const byHour = new Map<string, { hour: string; ai: number; esc: number }>();
    for (const e of events24h) {
      const h = bucketHour(e.created_at);
      const cur = byHour.get(h) ?? { hour: h, ai: 0, esc: 0 };
      if (e.event_type === "inbox_ai_reply") cur.ai += 1;
      if (e.event_type.includes("escalat")) cur.esc += 1;
      byHour.set(h, cur);
    }
    return Array.from(byHour.values()).sort((a, b) => a.hour.localeCompare(b.hour));
  }, [events24h]);

  const intentData = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of intentRows) {
      const k = (r.intent || "Unknown").trim() || "Unknown";
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return Array.from(m.entries())
      .map(([intent, count]) => ({ intent, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }, [intentRows]);

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!hasSupabase()) {
    return (
      <p className="text-sm text-muted-foreground p-6">
        Configure Supabase env vars to load operational analytics.
      </p>
    );
  }

  return (
    <div className="space-y-6 pb-12 w-full">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">AI Operations Analytics</h1>
          <p className="text-muted-foreground mt-1">
            Counts and charts from Supabase tables and <code className="text-xs">analytics_events</code>{" "}
            (last 24h). Subscribes to live inserts.
          </p>
        </div>
        <Select defaultValue="today">
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Timeframe" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Today (live)</SelectItem>
            <SelectItem value="week">Past 7 days (query TBD)</SelectItem>
            <SelectItem value="month">Past 30 days (query TBD)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="glass">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total inbound signals</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totalInbound}</div>
            <p className="text-xs text-muted-foreground mt-1">conversations + live_calls_feed rows</p>
          </CardContent>
        </Card>
        <Card className="glass">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Inbox resolution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-primary">{resolutionPct}%</div>
            <p className="text-xs text-muted-foreground mt-1">resolved / all conversations</p>
          </CardContent>
        </Card>
        <Card className="glass border-destructive/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg escalation close time</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-destructive">
              {avgWaitSec == null ? "—" : `${Math.floor(avgWaitSec / 60)}m ${avgWaitSec % 60}s`}
            </div>
            <p className="text-xs text-muted-foreground mt-1">From escalations with resolved_at</p>
          </CardContent>
        </Card>
        <Card className="glass">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Top channel (sample)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{topChannel.label}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {channelRows.length ? `${topChannel.pct}% of last ${channelRows.length} rows` : "No rows"}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
        <Card className="glass lg:col-span-2">
          <CardHeader>
            <CardTitle>Operational events (24h)</CardTitle>
            <CardDescription>AI replies vs escalation-related events by hour</CardDescription>
          </CardHeader>
          <CardContent className="h-[350px]">
            {timelineData.length === 0 ? (
              <p className="text-sm text-muted-foreground">No analytics_events in the last 24 hours.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={timelineData}>
                  <defs>
                    <linearGradient id="colorAi" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#14B8A6" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#14B8A6" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorEscalation" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#EF4444" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#EF4444" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="hour" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.08)" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "rgb(23, 23, 23)",
                      border: "1px solid rgba(255,255,255,0.1)",
                    }}
                  />
                  <Area type="monotone" dataKey="ai" stackId="1" stroke="#14B8A6" fill="url(#colorAi)" />
                  <Area type="monotone" dataKey="esc" stackId="2" stroke="#EF4444" fill="url(#colorEscalation)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="glass">
          <CardHeader>
            <CardTitle>Intents (live_calls_feed)</CardTitle>
            <CardDescription>Aggregated from stored intent labels</CardDescription>
          </CardHeader>
          <CardContent className="h-[350px]">
            {intentData.length === 0 ? (
              <p className="text-sm text-muted-foreground">No intent rows yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={intentData} layout="vertical" margin={{ top: 0, right: 24, left: 8, bottom: 0 }}>
                  <XAxis type="number" hide />
                  <YAxis
                    dataKey="intent"
                    type="category"
                    stroke="#888888"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    width={100}
                  />
                  <Tooltip
                    cursor={{ fill: "rgba(255,255,255,0.05)" }}
                    contentStyle={{
                      backgroundColor: "rgb(23, 23, 23)",
                      border: "1px solid rgba(255,255,255,0.1)",
                    }}
                  />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
