"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  Database, Plus, RefreshCw, Play, Eye, AlertTriangle,
  CheckCircle2, Clock, Activity, Zap, ChevronRight,
  Link as LinkIcon, Loader2, FileJson, Globe, Key,
} from "lucide-react";

interface Connector {
  id: string;
  provider: string;
  status: string;
  last_sync_at: string | null;
  created_at: string;
  config: {
    connector_name?: string;
    connector_type?: string;
    base_url?: string;
    endpoint?: string;
    auth_type?: string;
    sync_frequency?: string;
    last_sync_stats?: {
      records_fetched: number;
      chunks_inserted: number;
      elapsed_ms: number;
    };
  };
}

interface NewConnectorForm {
  connector_name: string;
  connector_type: string;
  base_url: string;
  endpoint: string;
  method: string;
  auth_type: string;
  api_key: string;
  bearer_token: string;
  response_data_path: string;
  sync_frequency: string;
}

const CONNECTOR_TYPES = [
  { value: "rest_api",       label: "REST API" },
  { value: "crm_api",        label: "CRM API" },
  { value: "erp_api",        label: "ERP API" },
  { value: "order_api",      label: "Order Management" },
  { value: "inventory_api",  label: "Inventory System" },
  { value: "delivery_api",   label: "Delivery / Logistics" },
  { value: "custom",         label: "Custom" },
];
const SYNC_FREQUENCIES = [
  { value: "manual", label: "Manual only" },
  { value: "hourly", label: "Every hour" },
  { value: "daily",  label: "Daily" },
  { value: "weekly", label: "Weekly" },
];
const AUTH_TYPES = [
  { value: "none",   label: "No auth" },
  { value: "bearer", label: "Bearer Token" },
  { value: "api_key",label: "API Key header" },
  { value: "basic",  label: "Basic Auth" },
];

const STATUS_CONFIG = {
  connected:    { label: "Connected",   color: "emerald", dot: "live" },
  disconnected: { label: "Disconnected",color: "muted",   dot: "idle" },
  syncing:      { label: "Syncing…",    color: "cyan",    dot: "syncing" },
  error:        { label: "Error",       color: "rose",    dot: "error" },
  partial:      { label: "Partial",     color: "amber",   dot: "idle" },
} as const;

function SyncStatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.disconnected;
  return (
    <span className={cn(
      "flex items-center gap-1.5 text-xs font-mono",
      cfg.color === "emerald" && "text-[hsl(var(--emerald))]",
      cfg.color === "cyan"    && "text-[hsl(var(--cyan))]",
      cfg.color === "rose"    && "text-[hsl(var(--rose))]",
      cfg.color === "amber"   && "text-[hsl(var(--amber))]",
      cfg.color === "muted"   && "text-muted-foreground",
    )}>
      <span className={cn("status-dot", cfg.dot)} />
      {cfg.label}
    </span>
  );
}

function ConnectorCard({
  connector,
  onSync,
  onTest,
  onIngest,
  syncing,
}: {
  connector: Connector;
  onSync: (id: string) => void;
  onTest: (id: string) => void;
  onIngest: (id: string) => void;
  syncing: boolean;
}) {
  const stats = connector.config.last_sync_stats;
  const name = connector.config.connector_name || connector.provider;
  const type = connector.config.connector_type || "api";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      className="glass rounded-xl overflow-hidden group card-hover"
    >
      {syncing && (
        <div className="sync-progress" />
      )}

      <div className="p-5">
        {/* Header */}
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-[hsl(var(--cyan))/10] border border-[hsl(var(--cyan))/20] flex items-center justify-center shrink-0">
            <Database size={18} className="text-[hsl(var(--cyan))]" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-foreground truncate" style={{ fontFamily: "Syne, sans-serif" }}>
              {name}
            </h3>
            <div className="flex items-center gap-2 mt-0.5">
              <Badge variant="outline" className="text-[10px] font-mono border-border text-muted-foreground capitalize">
                {type.replace(/_/g, " ")}
              </Badge>
              <SyncStatusBadge status={connector.status} />
            </div>
          </div>
        </div>

        {/* URL */}
        {connector.config.base_url && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono bg-[hsl(var(--surface-2))] rounded-md px-2 py-1.5 mb-3">
            <Globe size={10} className="shrink-0" />
            <span className="truncate">{connector.config.base_url}{connector.config.endpoint}</span>
          </div>
        )}

        {/* Auth */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-4">
          <Key size={11} />
          <span className="capitalize">{connector.config.auth_type || "no auth"}</span>
          <span className="text-border">·</span>
          <Clock size={11} />
          <span className="capitalize">{connector.config.sync_frequency || "manual"}</span>
        </div>

        {/* Last sync stats */}
        {stats && (
          <div className="grid grid-cols-3 gap-2 mb-4">
            {[
              { label: "Records", value: stats.records_fetched.toLocaleString() },
              { label: "Chunks", value: stats.chunks_inserted.toLocaleString() },
              { label: "Time", value: `${(stats.elapsed_ms / 1000).toFixed(1)}s` },
            ].map((s) => (
              <div key={s.label} className="bg-[hsl(var(--surface-2))] rounded-lg p-2 text-center">
                <p className="metric-value text-sm text-foreground">{s.value}</p>
                <p className="text-[10px] text-muted-foreground font-mono mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        )}

        {connector.last_sync_at && (
          <p className="text-[11px] text-muted-foreground font-mono mb-4 flex items-center gap-1">
            <RefreshCw size={10} />
            Last sync: {new Date(connector.last_sync_at).toLocaleString()}
          </p>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 pt-3 border-t border-border">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 text-xs border-border gap-1.5 hover:border-[hsl(var(--cyan))/50] hover:text-[hsl(var(--cyan))]"
            onClick={() => onTest(connector.id)}
            disabled={syncing}
          >
            <Play size={11} /> Test
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex-1 text-xs border-border gap-1.5 hover:border-[hsl(var(--violet))/50] hover:text-[hsl(var(--violet))]"
            onClick={() => onIngest(connector.id)}
            disabled={syncing}
          >
            <Zap size={11} /> Ingest
          </Button>
          <Button
            size="sm"
            className="flex-1 text-xs bg-[hsl(var(--cyan))/15] text-[hsl(var(--cyan))] hover:bg-[hsl(var(--cyan))/25] border border-[hsl(var(--cyan))/30] gap-1.5"
            onClick={() => onSync(connector.id)}
            disabled={syncing}
          >
            {syncing ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
            {syncing ? "Syncing" : "Sync"}
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

const DEFAULT_FORM: NewConnectorForm = {
  connector_name: "",
  connector_type: "rest_api",
  base_url: "",
  endpoint: "/api/orders",
  method: "GET",
  auth_type: "none",
  api_key: "",
  bearer_token: "",
  response_data_path: "",
  sync_frequency: "manual",
};

export default function ConnectorsPage() {
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<NewConnectorForm>(DEFAULT_FORM);
  const [creating, setCreating] = useState(false);
  const [syncingIds, setSyncingIds] = useState<Set<string>>(new Set());
  const [testResult, setTestResult] = useState<{ id: string; result: unknown } | null>(null);
  const { toast } = useToast();

  const loadConnectors = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/connectors", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json() as { connectors: Connector[] };
      setConnectors(data.connectors ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void loadConnectors(); }, [loadConnectors]);

  const handleCreate = async () => {
    if (!form.connector_name.trim() || !form.base_url.trim()) {
      toast({ title: "Name and Base URL are required", variant: "destructive" });
      return;
    }
    setCreating(true);
    const res = await fetch("/api/connectors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        connector_name: form.connector_name,
        connector_type: form.connector_type,
        base_url: form.base_url.trim(),
        endpoint: form.endpoint.trim() || "/",
        method: form.method,
        auth_type: form.auth_type,
        api_key: form.api_key || null,
        bearer_token: form.bearer_token || null,
        response_data_path: form.response_data_path || null,
        sync_frequency: form.sync_frequency,
      }),
    });
    const json = await res.json() as { error?: string };
    if (!res.ok) {
      toast({ title: "Create failed", description: json.error ?? "Unknown error", variant: "destructive" });
    } else {
      toast({ title: "Connector created", description: `${form.connector_name} is ready to sync.` });
      setDialogOpen(false);
      setForm(DEFAULT_FORM);
      void loadConnectors();
    }
    setCreating(false);
  };

  const handleSync = async (id: string) => {
    setSyncingIds((prev) => new Set(Array.from(prev).concat(id)));
    const res = await fetch("/api/connectors/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connector_id: id }),
    });
    const json = await res.json() as { error?: string; stats?: { records_fetched: number; chunks_inserted: number } };
    setSyncingIds((prev) => new Set(Array.from(prev).filter((x) => x !== id)));
    if (!res.ok) {
      toast({ title: "Sync failed", description: json.error ?? "Unknown error", variant: "destructive" });
    } else {
      toast({
        title: "Sync complete",
        description: `${json.stats?.records_fetched ?? 0} records → ${json.stats?.chunks_inserted ?? 0} KB chunks`,
      });
      void loadConnectors();
    }
  };

  const handleTest = async (id: string) => {
    setSyncingIds((prev) => new Set(Array.from(prev).concat(id)));
    const res = await fetch(`/api/connectors/${id}/test`, { method: "POST" });
    const json = await res.json() as { success?: boolean; error?: string; records_returned?: number; elapsed_ms?: number; preview?: unknown[] };
    setSyncingIds((prev) => new Set(Array.from(prev).filter((x) => x !== id)));
    if (json.success) {
      toast({ title: "Connection OK", description: `${json.records_returned ?? 0} records in ${json.elapsed_ms ?? 0}ms` });
      setTestResult({ id, result: json.preview });
    } else {
      toast({ title: "Connection failed", description: json.error ?? "Could not connect", variant: "destructive" });
    }
  };

  const handleIngest = async (id: string) => {
    setSyncingIds((prev) => new Set(Array.from(prev).concat(id)));
    toast({ title: "Ingesting data…", description: "Fetching records, generating embeddings…" });
    const res = await fetch(`/api/connectors/${id}/ingest`, { method: "POST" });
    const json = await res.json() as { error?: string; stats?: { records_processed: number; chunks_inserted: number } };
    setSyncingIds((prev) => new Set(Array.from(prev).filter((x) => x !== id)));
    if (!res.ok) {
      toast({ title: "Ingest failed", description: json.error ?? "Unknown error", variant: "destructive" });
    } else {
      toast({
        title: "Ingest complete",
        description: `${json.stats?.records_processed ?? 0} records → ${json.stats?.chunks_inserted ?? 0} embeddings`,
      });
      void loadConnectors();
    }
  };

  return (
    <div className="space-y-6 pb-16">
      {/* Header */}
      <motion.div
        className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: "Syne, sans-serif" }}>Data Connectors</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Connect CRM/ERP APIs → sync data → generate embeddings → power AI voice responses
          </p>
        </div>
        <Button
          onClick={() => setDialogOpen(true)}
          className="bg-[hsl(var(--cyan))] text-[hsl(var(--surface-0))] hover:bg-[hsl(var(--cyan))/90] gap-2 font-semibold"
        >
          <Plus size={16} /> Add Connector
        </Button>
      </motion.div>

      {/* Pipeline banner */}
      <motion.div
        className="glass rounded-xl p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
      >
        <div className="flex items-center gap-3 overflow-x-auto pb-1">
          {[
            { icon: <Globe size={13} />, label: "REST API", color: "cyan" },
            { icon: <ChevronRight size={12} />, label: "", color: "" },
            { icon: <Database size={13} />, label: "Fetch Records", color: "violet" },
            { icon: <ChevronRight size={12} />, label: "", color: "" },
            { icon: <Activity size={13} />, label: "Normalize JSON", color: "amber" },
            { icon: <ChevronRight size={12} />, label: "", color: "" },
            { icon: <Zap size={13} />, label: "Gemini Embed", color: "emerald" },
            { icon: <ChevronRight size={12} />, label: "", color: "" },
            { icon: <FileJson size={13} />, label: "Vector Store", color: "violet" },
            { icon: <ChevronRight size={12} />, label: "", color: "" },
            { icon: <Activity size={13} />, label: "AI Voice", color: "cyan" },
          ].map((item, i) => (
            item.label ? (
              <div key={i} className="flex items-center gap-1.5 shrink-0">
                <div className={cn(
                  "w-7 h-7 rounded-lg flex items-center justify-center",
                  item.color === "cyan" && "bg-[hsl(var(--cyan))/10] text-[hsl(var(--cyan))]",
                  item.color === "violet" && "bg-[hsl(var(--violet))/10] text-[hsl(var(--violet))]",
                  item.color === "amber" && "bg-[hsl(var(--amber))/10] text-[hsl(var(--amber))]",
                  item.color === "emerald" && "bg-[hsl(var(--emerald))/10] text-[hsl(var(--emerald))]",
                )}>
                  {item.icon}
                </div>
                <span className="text-xs text-muted-foreground whitespace-nowrap">{item.label}</span>
              </div>
            ) : (
              <span key={i} className="text-border text-xs shrink-0">{item.icon}</span>
            )
          ))}
        </div>
      </motion.div>

      {/* Test result preview */}
      {testResult && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="glass rounded-xl p-4 border-[hsl(var(--emerald))/30]"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={14} className="text-[hsl(var(--emerald))]" />
              <span className="text-sm font-medium text-[hsl(var(--emerald))]">Connection Test — Data Preview</span>
            </div>
            <Button variant="ghost" size="sm" className="text-xs h-6" onClick={() => setTestResult(null)}>
              Dismiss
            </Button>
          </div>
          <pre className="text-xs font-mono text-muted-foreground overflow-auto max-h-40 bg-[hsl(var(--surface-2))] rounded-lg p-3">
            {JSON.stringify(testResult.result, null, 2)}
          </pre>
        </motion.div>
      )}

      {/* Connector Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1, 2, 3].map((i) => (
            <div key={i} className="glass rounded-xl h-64 animate-pulse bg-[hsl(var(--surface-2))]" />
          ))}
        </div>
      ) : connectors.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="glass rounded-xl p-16 flex flex-col items-center justify-center gap-4 text-center border-dashed"
        >
          <div className="w-16 h-16 rounded-2xl bg-[hsl(var(--cyan))/10] flex items-center justify-center">
            <Database size={28} className="text-[hsl(var(--cyan))]" />
          </div>
          <div>
            <h3 className="text-lg font-semibold" style={{ fontFamily: "Syne, sans-serif" }}>
              No connectors yet
            </h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm">
              Connect your CRM or ERP REST API. We&apos;ll fetch records, generate Gemini embeddings, and let AI agents answer using your live data.
            </p>
            <div className="mt-2 text-xs font-mono text-muted-foreground/60">
              Example: https://crmapi.armansharif.com/api/orders
            </div>
          </div>
          <Button
            onClick={() => setDialogOpen(true)}
            className="bg-[hsl(var(--cyan))] text-[hsl(var(--surface-0))] hover:bg-[hsl(var(--cyan))/90] gap-2"
          >
            <Plus size={16} /> Add your first connector
          </Button>
        </motion.div>
      ) : (
        <AnimatePresence mode="popLayout">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {connectors.map((c) => (
              <ConnectorCard
                key={c.id}
                connector={c}
                onSync={handleSync}
                onTest={handleTest}
                onIngest={handleIngest}
                syncing={syncingIds.has(c.id)}
              />
            ))}
          </div>
        </AnimatePresence>
      )}

      {/* Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-xl bg-[hsl(var(--surface-1))] border-border max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "Syne, sans-serif" }}>Add Data Connector</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Connect any REST API. Data is fetched, embedded via Gemini, and stored for voice AI retrieval.
            </p>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1.5">
                <Label className="text-xs font-mono text-muted-foreground uppercase">Connector Name *</Label>
                <Input
                  value={form.connector_name}
                  onChange={(e) => setForm((f) => ({ ...f, connector_name: e.target.value }))}
                  placeholder="e.g. Orders CRM"
                  className="bg-[hsl(var(--surface-2))] border-border"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-mono text-muted-foreground uppercase">Type</Label>
                <Select value={form.connector_type} onValueChange={(v) => setForm((f) => ({ ...f, connector_type: v }))}>
                  <SelectTrigger className="bg-[hsl(var(--surface-2))] border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[hsl(var(--surface-1))] border-border">
                    {CONNECTOR_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-mono text-muted-foreground uppercase">HTTP Method</Label>
                <Select value={form.method} onValueChange={(v) => setForm((f) => ({ ...f, method: v }))}>
                  <SelectTrigger className="bg-[hsl(var(--surface-2))] border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[hsl(var(--surface-1))] border-border">
                    <SelectItem value="GET">GET</SelectItem>
                    <SelectItem value="POST">POST</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-mono text-muted-foreground uppercase">Base URL *</Label>
                <Input
                  value={form.base_url}
                  onChange={(e) => setForm((f) => ({ ...f, base_url: e.target.value }))}
                  placeholder="https://crmapi.armansharif.com"
                  className="bg-[hsl(var(--surface-2))] border-border font-mono text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-mono text-muted-foreground uppercase">Endpoint</Label>
                <Input
                  value={form.endpoint}
                  onChange={(e) => setForm((f) => ({ ...f, endpoint: e.target.value }))}
                  placeholder="/api/orders"
                  className="bg-[hsl(var(--surface-2))] border-border font-mono text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-mono text-muted-foreground uppercase">Auth Type</Label>
                <Select value={form.auth_type} onValueChange={(v) => setForm((f) => ({ ...f, auth_type: v }))}>
                  <SelectTrigger className="bg-[hsl(var(--surface-2))] border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[hsl(var(--surface-1))] border-border">
                    {AUTH_TYPES.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-mono text-muted-foreground uppercase">Sync Frequency</Label>
                <Select value={form.sync_frequency} onValueChange={(v) => setForm((f) => ({ ...f, sync_frequency: v }))}>
                  <SelectTrigger className="bg-[hsl(var(--surface-2))] border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[hsl(var(--surface-1))] border-border">
                    {SYNC_FREQUENCIES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {(form.auth_type === "bearer") && (
                <div className="col-span-2 space-y-1.5">
                  <Label className="text-xs font-mono text-muted-foreground uppercase">Bearer Token</Label>
                  <Input
                    type="password"
                    value={form.bearer_token}
                    onChange={(e) => setForm((f) => ({ ...f, bearer_token: e.target.value }))}
                    placeholder="eyJ…"
                    className="bg-[hsl(var(--surface-2))] border-border font-mono text-sm"
                  />
                </div>
              )}
              {(form.auth_type === "api_key") && (
                <div className="col-span-2 space-y-1.5">
                  <Label className="text-xs font-mono text-muted-foreground uppercase">API Key</Label>
                  <Input
                    type="password"
                    value={form.api_key}
                    onChange={(e) => setForm((f) => ({ ...f, api_key: e.target.value }))}
                    placeholder="sk-…"
                    className="bg-[hsl(var(--surface-2))] border-border font-mono text-sm"
                  />
                </div>
              )}

              <div className="col-span-2 space-y-1.5">
                <Label className="text-xs font-mono text-muted-foreground uppercase">
                  JSON Data Path
                  <span className="ml-1 text-muted-foreground/50">(optional — e.g. &quot;data.orders&quot;)</span>
                </Label>
                <Input
                  value={form.response_data_path}
                  onChange={(e) => setForm((f) => ({ ...f, response_data_path: e.target.value }))}
                  placeholder="data.orders"
                  className="bg-[hsl(var(--surface-2))] border-border font-mono text-sm"
                />
              </div>
            </div>

            <div className="rounded-lg bg-[hsl(var(--cyan))/5] border border-[hsl(var(--cyan))/20] p-3 text-xs text-muted-foreground">
              <p className="flex items-center gap-1.5 font-medium text-[hsl(var(--cyan))] mb-1">
                <LinkIcon size={11} /> After creating:
              </p>
              <ul className="space-y-0.5 ml-4">
                <li>• Click <strong>Test</strong> to verify the connection returns data</li>
                <li>• Click <strong>Sync</strong> to fetch records and store as KB chunks</li>
                <li>• Click <strong>Ingest</strong> to generate Gemini embeddings for semantic search</li>
              </ul>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="border-border">Cancel</Button>
            <Button
              onClick={handleCreate}
              disabled={creating}
              className="bg-[hsl(var(--cyan))] text-[hsl(var(--surface-0))] hover:bg-[hsl(var(--cyan))/90] gap-2"
            >
              {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              {creating ? "Creating…" : "Create Connector"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
