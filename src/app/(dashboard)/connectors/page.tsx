"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useConnectorStore, type Connector } from "@/store/connectorStore";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Database,
  Link as LinkIcon,
  RefreshCw,
  Activity,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  GitBranch,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function ConnectorsPage() {
  const { connectors, toggleConnectorStatus, updateConnector } = useConnectorStore();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { toast } = useToast();

  const selected = useMemo(
    () => connectors.find((c) => c.id === selectedId) ?? null,
    [connectors, selectedId]
  );

  const getStatusIcon = (status: string) => {
    if (status === "connected") return <CheckCircle2 className="w-4 h-4 text-primary" />;
    if (status === "error") return <AlertTriangle className="w-4 h-4 text-destructive" />;
    return <LinkIcon className="w-4 h-4 text-muted-foreground" />;
  };

  const patch = (partial: Partial<Connector>) => {
    if (!selected) return;
    updateConnector(selected.id, partial);
  };

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">CRM, ERP & data</h1>
          <p className="text-muted-foreground mt-1 max-w-2xl text-sm leading-relaxed">
            Step 1 — pick a system. Step 2 — paste connection details. Step 3 — map fields so Gemini
            can speak your customer language. AI voice uses the same mappings during calls.
          </p>
        </div>
        <Button variant="secondary" asChild>
          <Link href="/connectors/mapping">
            <GitBranch className="w-4 h-4 mr-2" />
            Field mapping
            <ArrowRight className="w-4 h-4 ml-1" />
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {["Choose connector", "Test connection", "Map → AI"].map((t, i) => (
          <Card key={t} className="border-dashed bg-muted/20">
            <CardHeader className="pb-2">
              <Badge variant="outline" className="w-fit mb-1">
                Step {i + 1}
              </Badge>
              <CardTitle className="text-base">{t}</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground leading-relaxed">
              {i === 0 && "HubSpot, Salesforce, Odoo, REST, or SQL — one card each."}
              {i === 1 && "Use Test in the dialog; latency shows in the card when connected."}
              {i === 2 && "External CRM fields become stable AI slots (name, phone, dealer_code…)."}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {connectors.map((connector) => (
          <Card key={connector.id} className="glass flex flex-col">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/20">
                  <Database className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-lg">{connector.name}</CardTitle>
                  <span className="text-xs text-muted-foreground">{connector.type}</span>
                </div>
              </div>
              <Switch
                checked={connector.status === "connected"}
                onCheckedChange={() => toggleConnectorStatus(connector.id)}
              />
            </CardHeader>
            <CardContent className="flex-1 mt-4">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center space-x-2">{getStatusIcon(connector.status)}</div>
                {connector.latency && (
                  <Badge variant="outline" className="font-mono text-xs">
                    {connector.latency}
                  </Badge>
                )}
              </div>
              {connector.baseUrl && (
                <p className="text-[11px] font-mono text-muted-foreground mt-3 truncate" title={connector.baseUrl}>
                  {connector.baseUrl}
                </p>
              )}
              {connector.lastSync && (
                <div className="flex items-center space-x-2 mt-4 text-xs text-muted-foreground">
                  <RefreshCw className="w-3 h-3" />
                  <span>Last synced: {connector.lastSync}</span>
                </div>
              )}
            </CardContent>
            <CardFooter className="pt-4 border-t border-border mt-auto flex gap-2">
              <Button
                variant="ghost"
                className="flex-1 text-primary hover:text-primary"
                onClick={() => setSelectedId(connector.id)}
              >
                Configure
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>

      <Dialog open={!!selectedId} onOpenChange={(o) => !o && setSelectedId(null)}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Configure {selected?.name}</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Saved in this browser. Production: move secrets to env and call from API routes only.
            </p>
          </DialogHeader>
          {selected && (
            <div className="grid gap-4 py-2">
              {selected.type === "API" || selected.type === "CRM" || selected.type === "ERP" ? (
                <>
                  <div className="grid gap-2">
                    <Label>Base URL</Label>
                    <Input
                      value={selected.baseUrl ?? ""}
                      onChange={(e) => patch({ baseUrl: e.target.value })}
                      placeholder="https://api.hubapi.com"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>API key</Label>
                    <Input
                      type="password"
                      value={selected.apiKey ?? ""}
                      onChange={(e) => patch({ apiKey: e.target.value })}
                      placeholder="••••••••"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Headers (JSON, optional)</Label>
                    <Textarea
                      rows={3}
                      className="font-mono text-xs"
                      value={selected.headersJson ?? ""}
                      onChange={(e) => patch({ headersJson: e.target.value })}
                      placeholder='{ "X-Custom": "value" }'
                    />
                  </div>
                </>
              ) : null}

              {selected.type === "Database" ? (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label>Host</Label>
                      <Input
                        value={selected.dbHost ?? ""}
                        onChange={(e) => patch({ dbHost: e.target.value })}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label>Port</Label>
                      <Input
                        value={selected.dbPort ?? ""}
                        onChange={(e) => patch({ dbPort: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label>Database</Label>
                    <Input
                      value={selected.dbName ?? ""}
                      onChange={(e) => patch({ dbName: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Username</Label>
                    <Input
                      value={selected.dbUser ?? ""}
                      onChange={(e) => patch({ dbUser: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Password</Label>
                    <Input
                      type="password"
                      value={selected.dbPassword ?? ""}
                      onChange={(e) => patch({ dbPassword: e.target.value })}
                    />
                  </div>
                </>
              ) : null}
            </div>
          )}
          <DialogFooter className="flex flex-col sm:flex-row sm:justify-between gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                toast({
                  title: "Connection test (MVP)",
                  description: "Wire /api/connectors/test with your vendor SDK; UI marks success for demo.",
                });
                patch({ status: "connected", latency: `${40 + Math.floor(Math.random() * 40)}ms`, lastSync: "just now" });
              }}
            >
              <Activity className="w-4 h-4 mr-2" /> Test connection
            </Button>
            <Button
              onClick={() => {
                setSelectedId(null);
                toast({ title: "Saved", description: `${selected?.name} configuration stored locally.` });
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
