"use client";

import Link from "next/link";
import { useConnectorStore } from "@/store/connectorStore";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowLeft, Plus, Trash2, Shuffle } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

export default function ConnectorFieldMappingPage() {
  const { connectors, fieldMappings, addFieldMapping, updateFieldMapping, removeFieldMapping } =
    useConnectorStore();
  const [connectorId, setConnectorId] = useState(connectors[0]?.id ?? "");
  const [ext, setExt] = useState("");
  const [ai, setAi] = useState("");
  const { toast } = useToast();

  const rows = fieldMappings.filter((m) => m.connectorId === connectorId);

  return (
    <div className="space-y-8 pb-12 max-w-5xl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Button variant="ghost" size="sm" className="mb-2 -ml-2 text-muted-foreground" asChild>
            <Link href="/connectors">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back to connectors
            </Link>
          </Button>
          <h1 className="text-3xl font-bold tracking-tight">AI data mapping</h1>
          <p className="text-muted-foreground mt-1 text-sm max-w-2xl leading-relaxed">
            Tell the AI which CRM or API field means what. During voice calls, mapped values are merged
            into the Gemini system prompt (next step: read from this store in{" "}
            <code className="text-xs bg-muted px-1 rounded">/api/chat</code>).
          </p>
        </div>
      </div>

      <Card className="glass">
        <CardHeader>
          <CardTitle className="text-lg">Add mapping</CardTitle>
          <CardDescription>External field → stable AI slot (snake_case recommended).</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>Connector</Label>
              <Select value={connectorId} onValueChange={setConnectorId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose system" />
                </SelectTrigger>
                <SelectContent>
                  {connectors.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>External field</Label>
              <Input
                value={ext}
                onChange={(e) => setExt(e.target.value)}
                placeholder="e.g. firstname, phone, dealer_id"
                className="font-mono text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label>AI field</Label>
              <Input
                value={ai}
                onChange={(e) => setAi(e.target.value)}
                placeholder="e.g. first_name, phone, dealer_code"
                className="font-mono text-sm"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => {
                if (!ext.trim() || !ai.trim()) return;
                addFieldMapping(connectorId, ext.trim(), ai.trim());
                setExt("");
                setAi("");
                toast({ title: "Mapping saved", description: `${ext} → ${ai}` });
              }}
            >
              <Plus className="h-4 w-4 mr-2" />
              Save mapping
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setExt("order_id");
                setAi("order_id");
                toast({ title: "Example filled", description: "Edit and save as your own." });
              }}
            >
              <Shuffle className="h-4 w-4 mr-2" />
              Insert example
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="glass">
        <CardHeader>
          <CardTitle className="text-lg">Live preview</CardTitle>
          <CardDescription>How the AI will see a customer payload (mock JSON).</CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="rounded-lg border bg-muted/40 p-4 text-xs font-mono overflow-x-auto">
            {JSON.stringify(
              Object.fromEntries(rows.map((r) => [r.aiField, `<${r.externalField}>`])),
              null,
              2
            )}
          </pre>
        </CardContent>
      </Card>

      <Card className="glass">
        <CardHeader>
          <CardTitle className="text-lg">Mappings for selected connector</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>External</TableHead>
                <TableHead>AI field</TableHead>
                <TableHead className="w-[80px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-muted-foreground text-center py-8">
                    No mappings yet for this connector.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>
                      <Input
                        className="font-mono h-8 text-xs"
                        value={m.externalField}
                        onChange={(e) => updateFieldMapping(m.id, { externalField: e.target.value })}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        className="font-mono h-8 text-xs"
                        value={m.aiField}
                        onChange={(e) => updateFieldMapping(m.id, { aiField: e.target.value })}
                      />
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => removeFieldMapping(m.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          <p className="text-xs text-muted-foreground mt-4">
            Drag-and-drop reorder can be added with <code className="bg-muted px-1 rounded">@dnd-kit</code>; for MVP,
            edit inline and delete rows you do not need.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
