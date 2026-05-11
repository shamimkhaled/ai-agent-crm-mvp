"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Bot, Loader2, Pencil, Plus, Trash2, CloudUpload } from "lucide-react";
import {
  useVoicePlatformStore,
  mergeVoiceAgent,
  type VoiceAgent,
  type PersonalityPreset,
} from "@/store/voicePlatformStore";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { SettingsSectionHeader } from "@/components/settings/SettingsSectionHeader";

const PRESET_SNIPPETS: Record<PersonalityPreset, string> = {
  professional: "Use a concise, polite, business-professional tone.",
  friendly: "Be warm, approachable, and reassuring without being overly verbose.",
  sales: "Highlight value and clear next steps; keep momentum toward a helpful CTA.",
  support: "Empathize first, then solve; confirm the customer feels heard before closing.",
};

const emptyAgent = (): VoiceAgent =>
  mergeVoiceAgent({
    id: `agent-${Date.now()}`,
    name: "",
    department: "",
  });

export default function VoiceAgentsSettingsPage() {
  const { agents, upsertAgent, removeAgent } = useVoicePlatformStore();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<VoiceAgent | null>(null);
  const [kbInput, setKbInput] = useState("");
  const [crmInput, setCrmInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [deploying, setDeploying] = useState<string | null>(null);
  const supabase = createClient();
  const { toast } = useToast();

  const normalizedAgents = useMemo(() => agents.map((a) => mergeVoiceAgent(a)), [agents]);

  useEffect(() => {
    if (editing) {
      setKbInput(editing.knowledgeBaseLabels.join(", "));
      setCrmInput(editing.crmConnectorLabels.join(", "));
    } else {
      setKbInput("");
      setCrmInput("");
    }
  }, [editing, open]);

  const openNew = () => {
    setEditing(emptyAgent());
    setOpen(true);
  };

  const openEdit = (a: VoiceAgent) => {
    setEditing(mergeVoiceAgent(a));
    setOpen(true);
  };

  const saveLocal = () => {
    if (!editing) return;
    if (!editing.name.trim() || !editing.department.trim()) {
      toast({
        title: "Missing fields",
        description: "Name and department are required.",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    const next: VoiceAgent = mergeVoiceAgent({
      ...editing,
      knowledgeBaseLabels: kbInput
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      crmConnectorLabels: crmInput
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    });
    upsertAgent(next);
    setSaving(false);
    setOpen(false);
    setEditing(null);
    toast({ title: "Agent saved", description: `${next.name} is stored in this workspace.` });
  };

  const deployToSupabase = async (a: VoiceAgent) => {
    setDeploying(a.id);
    const merged = mergeVoiceAgent(a);
    const { error } = await supabase.from("ai_agents").insert({
      name: merged.name,
      department: merged.department,
      voice_model: merged.voiceId,
      system_prompt: [
        `Personality: ${merged.personalityPreset}. ${PRESET_SNIPPETS[merged.personalityPreset]}`,
        merged.personalityPrompt,
        merged.systemInstructions,
      ]
        .filter(Boolean)
        .join("\n\n"),
      status: merged.active ? "active" : "inactive",
    });
    if (error) {
      toast({ title: "Supabase sync failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Synced to Supabase", description: "Row written to ai_agents." });
    }
    setDeploying(null);
  };

  const handleDelete = (a: VoiceAgent) => {
    removeAgent(a.id);
    toast({ title: "Removed", description: `${a.name} deleted from workspace store.` });
  };

  const roleLabels = useMemo(
    () =>
      ({
        support: "Customer support",
        dealer: "Dealer support",
        order: "Order tracking",
        billing: "Billing / payments",
        sales: "Sales / growth",
      }) as const,
    []
  );

  return (
    <div className="space-y-8 pb-12">
      <SettingsSectionHeader
        title="AI voice agents"
        subtitle="Create agents that sound like your brand: pick voice, language (Bangla / English / auto), personality, business hours, and which knowledge + CRM data they may use on calls and WhatsApp."
      >
        <Button onClick={openNew} className="shrink-0">
          <Plus className="h-4 w-4 mr-2" />
          New agent
        </Button>
      </SettingsSectionHeader>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {normalizedAgents.map((agent) => (
          <Card key={agent.id} className="glass flex flex-col">
            <CardHeader className="space-y-1">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar className="h-12 w-12 border border-border">
                    {agent.avatarUrl ? (
                      <AvatarImage src={agent.avatarUrl} alt="" />
                    ) : null}
                    <AvatarFallback className="bg-primary/15 text-primary">
                      <Bot className="h-6 w-6" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <CardTitle className="text-lg leading-tight truncate">{agent.name}</CardTitle>
                    <p className="text-xs text-muted-foreground truncate">{agent.department}</p>
                  </div>
                </div>
                <Badge variant={agent.active ? "default" : "secondary"}>
                  {agent.active ? "active" : "inactive"}
                </Badge>
              </div>
              <CardDescription className="text-xs flex flex-wrap gap-1">
                <Badge variant="outline" className="capitalize">
                  {agent.personalityPreset}
                </Badge>
                <span>·</span>
                <span>{roleLabels[agent.workflowRole]}</span>
                <span>·</span>
                <span>confidence ≥ {agent.confidenceThreshold}%</span>
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col gap-2 text-sm">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-muted-foreground block">Language</span>
                  <span className="font-medium uppercase">{agent.language}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Voice</span>
                  <span className="font-mono truncate block">{agent.voiceId}</span>
                </div>
              </div>
              {(agent.whatsappSender || agent.primaryPhone) && (
                <p className="text-[11px] text-muted-foreground font-mono truncate">
                  {agent.primaryPhone && <span>{agent.primaryPhone} · </span>}
                  {agent.whatsappSender}
                </p>
              )}
              <p className="text-[11px] text-muted-foreground">
                Hours {agent.businessHoursStart}–{agent.businessHoursEnd} {agent.timezone}
              </p>
              <p className="text-[11px] text-muted-foreground">
                Human fallback: <span className="text-foreground">{agent.fallbackHumanLabel || "—"}</span>
              </p>
              <div className="flex flex-wrap gap-2 mt-auto pt-3">
                <Button variant="secondary" size="sm" onClick={() => openEdit(agent)}>
                  <Pencil className="h-3 w-3 mr-1" />
                  Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => deployToSupabase(agent)}
                  disabled={deploying === agent.id}
                >
                  {deploying === agent.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <CloudUpload className="h-3 w-3 mr-1" />
                  )}
                  Sync DB
                </Button>
                <Button variant="ghost" size="sm" className="text-destructive" onClick={() => handleDelete(agent)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={open} onOpenChange={(v) => !v && (setOpen(false), setEditing(null))}>
        <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing?.name ? "Edit voice agent" : "Create voice agent"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="grid gap-4 py-2">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label>Agent name</Label>
                  <Input
                    value={editing.name}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                    placeholder="e.g. Order tracking AI"
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Avatar image URL (optional)</Label>
                  <Input
                    value={editing.avatarUrl}
                    onChange={(e) => setEditing({ ...editing, avatarUrl: e.target.value })}
                    placeholder="https://…"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Department</Label>
                  <Input
                    value={editing.department}
                    onChange={(e) => setEditing({ ...editing, department: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Workflow role</Label>
                  <Select
                    value={editing.workflowRole}
                    onValueChange={(v) => setEditing({ ...editing, workflowRole: v as VoiceAgent["workflowRole"] })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(roleLabels) as VoiceAgent["workflowRole"][]).map((k) => (
                        <SelectItem key={k} value={k}>
                          {roleLabels[k]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Personality</Label>
                  <Select
                    value={editing.personalityPreset}
                    onValueChange={(v) => {
                      const preset = v as PersonalityPreset;
                      setEditing({
                        ...editing,
                        personalityPreset: preset,
                        personalityPrompt: PRESET_SNIPPETS[preset],
                      });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="professional">Professional</SelectItem>
                      <SelectItem value="friendly">Friendly</SelectItem>
                      <SelectItem value="sales">Sales</SelectItem>
                      <SelectItem value="support">Support</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Language</Label>
                  <Select
                    value={editing.language}
                    onValueChange={(v) => setEditing({ ...editing, language: v as VoiceAgent["language"] })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bn">Bangla</SelectItem>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="auto">Auto detect</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Voice ID / profile</Label>
                  <Input
                    value={editing.voiceId}
                    onChange={(e) => setEditing({ ...editing, voiceId: e.target.value })}
                    placeholder="e.g. multilingual-female-1"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Primary phone (E.164, optional)</Label>
                  <Input
                    value={editing.primaryPhone}
                    onChange={(e) => setEditing({ ...editing, primaryPhone: e.target.value })}
                    placeholder="+880…"
                    className="font-mono text-sm"
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>WhatsApp sender (optional)</Label>
                  <Input
                    value={editing.whatsappSender}
                    onChange={(e) => setEditing({ ...editing, whatsappSender: e.target.value })}
                    placeholder="whatsapp:+14155238886"
                    className="font-mono text-sm"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label>Active from</Label>
                  <Input
                    type="time"
                    value={editing.businessHoursStart}
                    onChange={(e) => setEditing({ ...editing, businessHoursStart: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Active to</Label>
                  <Input
                    type="time"
                    value={editing.businessHoursEnd}
                    onChange={(e) => setEditing({ ...editing, businessHoursEnd: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Timezone</Label>
                  <Input
                    value={editing.timezone}
                    onChange={(e) => setEditing({ ...editing, timezone: e.target.value })}
                    placeholder="Asia/Dhaka"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Personality notes (editable)</Label>
                <Textarea
                  rows={2}
                  value={editing.personalityPrompt}
                  onChange={(e) => setEditing({ ...editing, personalityPrompt: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Gemini / system instructions</Label>
                <Textarea
                  rows={4}
                  value={editing.systemInstructions}
                  onChange={(e) => setEditing({ ...editing, systemInstructions: e.target.value })}
                  placeholder="How to use CRM fields, escalation, brand rules…"
                />
              </div>
              <div className="space-y-2">
                <Label>Knowledge bases (comma-separated)</Label>
                <Input value={kbInput} onChange={(e) => setKbInput(e.target.value)} placeholder="Policies, FAQs" />
              </div>
              <div className="space-y-2">
                <Label>CRM / ERP connectors (comma-separated)</Label>
                <Input value={crmInput} onChange={(e) => setCrmInput(e.target.value)} placeholder="HubSpot, Odoo" />
              </div>
              <div className="space-y-2">
                <Label>Escalation rules</Label>
                <Textarea
                  rows={3}
                  value={editing.escalationRules}
                  onChange={(e) => setEditing({ ...editing, escalationRules: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Fallback human agent label</Label>
                <Input
                  value={editing.fallbackHumanLabel}
                  onChange={(e) => setEditing({ ...editing, fallbackHumanLabel: e.target.value })}
                  placeholder="Queue or person name shown to agents"
                />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <Label>Confidence threshold</Label>
                  <span>{editing.confidenceThreshold}%</span>
                </div>
                <Slider
                  value={[editing.confidenceThreshold]}
                  min={30}
                  max={95}
                  step={1}
                  onValueChange={([v]) => setEditing({ ...editing, confidenceThreshold: v })}
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <Label>Active</Label>
                <Switch checked={editing.active} onCheckedChange={(v) => setEditing({ ...editing, active: v })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={saveLocal} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save agent"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
