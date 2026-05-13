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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Bot, Link2, Loader2, Pencil, Plus, Trash2, Unlink, CloudUpload } from "lucide-react";
import {
  useVoicePlatformStore,
  mergeVoiceAgent,
  type VoiceAgent,
  type PersonalityPreset,
  type ProviderKind,
} from "@/store/voicePlatformStore";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { SettingsSectionHeader } from "@/components/settings/SettingsSectionHeader";
import { VOICE_OPTIONS, FIELD_REFERENCE } from "@/lib/voiceAgentCatalog";
import { VoicePreviewButton } from "@/components/voice/VoicePreviewButton";

const PRESET_SNIPPETS: Record<PersonalityPreset, string> = {
  professional: "Use a concise, polite, business-professional tone.",
  friendly: "Be warm, approachable, and reassuring without being overly verbose.",
  sales: "Highlight value and clear next steps; keep momentum toward a helpful CTA.",
  support: "Empathize first, then solve; confirm the customer feels heard before closing.",
};

const VOICE_PROVIDER_KINDS: ProviderKind[] = ["twilio_voice", "exotel", "plivo", "telnyx"];

const VOICE_PRESET_IDS: string[] = VOICE_OPTIONS.filter((o) => o.id !== "custom").map((o) => o.id);

type PhoneRow = {
  id: string;
  e164: string;
  label: string;
  voiceAgentId: string;
  providerKind: ProviderKind;
  providerLabel: string;
};

const emptyAgent = (): VoiceAgent =>
  mergeVoiceAgent({
    id: `agent-${Date.now()}`,
    name: "",
    department: "",
  });

export default function VoiceAgentsSettingsPage() {
  const { agents, providers, upsertAgent, removeAgent, updatePhoneAgent } = useVoicePlatformStore();
  const [open, setOpen] = useState(false);
  const [refOpen, setRefOpen] = useState(false);
  const [editing, setEditing] = useState<VoiceAgent | null>(null);
  const [kbInput, setKbInput] = useState("");
  const [crmInput, setCrmInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [deploying, setDeploying] = useState<string | null>(null);
  const { toast } = useToast();

  const normalizedAgents = useMemo(() => agents.map((a) => mergeVoiceAgent(a)), [agents]);

  const departmentSuggestions = useMemo(() => {
    const s = new Set<string>();
    agents.forEach((a) => {
      if (a.department.trim()) s.add(a.department.trim());
    });
    return Array.from(s).sort();
  }, [agents]);

  const voiceInventory = useMemo<PhoneRow[]>(
    () =>
      providers.flatMap((p) =>
        VOICE_PROVIDER_KINDS.includes(p.kind)
          ? p.phoneNumbers.map((n) => ({
              ...n,
              providerKind: p.kind,
              providerLabel: p.displayName,
            }))
          : []
      ),
    [providers]
  );

  const whatsappInventory = useMemo<PhoneRow[]>(
    () =>
      providers.flatMap((p) =>
        p.kind === "twilio_whatsapp"
          ? p.phoneNumbers.map((n) => ({
              ...n,
              providerKind: p.kind,
              providerLabel: p.displayName,
            }))
          : []
      ),
    [providers]
  );

  const agentNameById = useMemo(() => {
    const m = new Map<string, string>();
    agents.forEach((a) => m.set(a.id, a.name || a.id));
    return m;
  }, [agents]);

  const linesForAgent = (agentId: string, rows: PhoneRow[]) =>
    rows.filter((r) => r.voiceAgentId === agentId);

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
    if (!editing.voiceId.trim()) {
      toast({
        title: "Voice required",
        description: "Pick a voice preset or enter a custom TTS voice id.",
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
    try {
      const supabase = createClient();
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
    } catch (e) {
      toast({
        title: "Supabase sync failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setDeploying(null);
    }
  };

  const handleDelete = (a: VoiceAgent) => {
    removeAgent(a.id);
    toast({ title: "Removed", description: `${a.name} deleted from workspace store.` });
  };

  const setActive = (a: VoiceAgent, active: boolean) => {
    upsertAgent(mergeVoiceAgent({ ...a, active }));
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

  const linkNumber = (row: PhoneRow, agentId: string) => {
    const prevName = row.voiceAgentId ? agentNameById.get(row.voiceAgentId) : undefined;
    updatePhoneAgent(row.providerKind, row.id, agentId);
    const nextName = agentNameById.get(agentId) ?? agentId;
    toast({
      title: prevName && row.voiceAgentId !== agentId ? "Number reassigned" : "Number assigned",
      description: `${row.e164} → ${nextName}`,
    });
  };

  const unlinkNumber = (row: PhoneRow) => {
    updatePhoneAgent(row.providerKind, row.id, "");
    toast({ title: "Number unassigned", description: row.e164 });
  };

  const coreFeatures = [
    "Create, edit, and delete AI voice agents",
    "Activate or deactivate agents without opening the editor",
    "Assign telephony numbers and WhatsApp senders from your configured providers",
    "Bind departments, languages, personality, and Gemini-style instructions",
    "Knowledge base & CRM connector labels, escalation rules, confidence threshold, hours, human fallback",
    "Test voice — quick browser preview of language and personality pacing",
  ];

  return (
    <div className="space-y-8 pb-12">
      <SettingsSectionHeader
        title="AI Voice Agent Management System"
        subtitle="A comprehensive workspace to create, manage, and optimize AI voice agents with routing hints, telephony linkage, and lightweight testing."
      >
        <div className="flex flex-wrap gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={() => setRefOpen(true)}>
            Field reference
          </Button>
          <Button onClick={openNew}>
            <Plus className="h-4 w-4 mr-2" />
            New agent
          </Button>
        </div>
      </SettingsSectionHeader>

      <Card className="border-dashed bg-muted/20">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Core capabilities</CardTitle>
          <CardDescription>Everything below persists in this browser (Zustand + localStorage).</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-2 sm:grid-cols-2 text-sm text-muted-foreground list-disc pl-5">
            {coreFeatures.map((f) => (
              <li key={f} className="leading-snug">
                {f}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Dialog open={refOpen} onOpenChange={setRefOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Agent settings — reference</DialogTitle>
          </DialogHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[140px]">Setting</TableHead>
                <TableHead className="w-[160px]">Options</TableHead>
                <TableHead>Description</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {FIELD_REFERENCE.map((row) => (
                <TableRow key={row.setting}>
                  <TableCell className="font-medium align-top">{row.setting}</TableCell>
                  <TableCell className="text-muted-foreground align-top text-xs">{row.options}</TableCell>
                  <TableCell className="text-sm align-top">{row.description}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DialogContent>
      </Dialog>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {normalizedAgents.map((agent) => {
          const vLines = linesForAgent(agent.id, voiceInventory);
          const wLines = linesForAgent(agent.id, whatsappInventory);
          return (
            <Card key={agent.id} className="glass flex flex-col">
              <CardHeader className="space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar className="h-12 w-12 border border-border">
                      {agent.avatarUrl ? <AvatarImage src={agent.avatarUrl} alt="" /> : null}
                      <AvatarFallback className="bg-primary/15 text-primary">
                        <Bot className="h-6 w-6" />
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <CardTitle className="text-lg leading-tight truncate">{agent.name}</CardTitle>
                      <p className="text-xs text-muted-foreground truncate">{agent.department}</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <Badge variant={agent.active ? "default" : "secondary"}>
                      {agent.active ? "Active" : "Inactive"}
                    </Badge>
                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wide">On</span>
                      <Switch
                        checked={agent.active}
                        onCheckedChange={(v) => setActive(agent, v)}
                        aria-label={agent.active ? "Deactivate agent" : "Activate agent"}
                      />
                    </div>
                  </div>
                </div>
                <CardDescription className="text-xs flex flex-wrap gap-1 items-center">
                  <Badge variant="outline" className="capitalize">
                    {agent.personalityPreset}
                  </Badge>
                  <span className="text-muted-foreground">·</span>
                  <span>{roleLabels[agent.workflowRole]}</span>
                  <span className="text-muted-foreground">·</span>
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
                {(agent.whatsappSender || agent.primaryPhone || vLines.length || wLines.length) && (
                  <div className="text-[11px] text-muted-foreground space-y-1">
                    {agent.primaryPhone && (
                      <p className="font-mono truncate">
                        <span className="text-foreground/80">Manual phone hint:</span> {agent.primaryPhone}
                      </p>
                    )}
                    {agent.whatsappSender && (
                      <p className="font-mono truncate">
                        <span className="text-foreground/80">Manual WA hint:</span> {agent.whatsappSender}
                      </p>
                    )}
                    {vLines.length > 0 && (
                      <p>
                        <span className="text-foreground/80">Voice lines:</span> {vLines.length} linked
                      </p>
                    )}
                    {wLines.length > 0 && (
                      <p>
                        <span className="text-foreground/80">WhatsApp lines:</span> {wLines.length} linked
                      </p>
                    )}
                  </div>
                )}
                <VoicePreviewButton language={agent.language} personalityPreset={agent.personalityPreset} />
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
          );
        })}
      </div>

      <Dialog open={open} onOpenChange={(v) => !v && (setOpen(false), setEditing(null))}>
        <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing?.name ? "Edit voice agent" : "Create voice agent"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="grid gap-6 py-2">
              <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-medium">Voice testing</p>
                    <p className="text-xs text-muted-foreground">
                      Play a short sample to sanity-check language and pacing before go-live.
                    </p>
                  </div>
                  <VoicePreviewButton language={editing.language} personalityPreset={editing.personalityPreset} />
                </div>
              </div>

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
                  <Label>Agent avatar (image URL)</Label>
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
                    list="dept-suggestions"
                    placeholder="e.g. Support"
                  />
                  <datalist id="dept-suggestions">
                    {departmentSuggestions.map((d) => (
                      <option key={d} value={d} />
                    ))}
                  </datalist>
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
                <div className="space-y-2 sm:col-span-2">
                  <Label>Voice selection</Label>
                  <Select
                    value={VOICE_PRESET_IDS.includes(editing.voiceId) ? editing.voiceId : "custom"}
                    onValueChange={(v) => {
                      if (v === "custom") {
                        setEditing({
                          ...editing,
                          voiceId: VOICE_PRESET_IDS.includes(editing.voiceId) ? "" : editing.voiceId,
                        });
                      } else {
                        setEditing({ ...editing, voiceId: v });
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a voice" />
                    </SelectTrigger>
                    <SelectContent>
                      {VOICE_OPTIONS.map((o) => (
                        <SelectItem key={o.id} value={o.id}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {!VOICE_PRESET_IDS.includes(editing.voiceId) ? (
                    <Input
                      className="mt-2 font-mono text-sm"
                      value={editing.voiceId}
                      onChange={(e) => setEditing({ ...editing, voiceId: e.target.value })}
                      placeholder="Custom TTS voice id (provider-specific)"
                    />
                  ) : null}
                </div>
                <div className="space-y-2">
                  <Label>Primary phone hint (E.164, optional)</Label>
                  <Input
                    value={editing.primaryPhone}
                    onChange={(e) => setEditing({ ...editing, primaryPhone: e.target.value })}
                    placeholder="+880…"
                    className="font-mono text-sm"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Display / routing hint. Prefer linking numbers in the tables below when available.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>WhatsApp sender hint (optional)</Label>
                  <Input
                    value={editing.whatsappSender}
                    onChange={(e) => setEditing({ ...editing, whatsappSender: e.target.value })}
                    placeholder="whatsapp:+14155238886"
                    className="font-mono text-sm"
                  />
                </div>
              </div>

              <div className="space-y-2 border-t pt-4">
                <Label className="text-base">Assign phone numbers (telephony inventory)</Label>
                <p className="text-xs text-muted-foreground">
                  Numbers come from Settings → Telephony. Assigning links inbound routing to this agent.
                </p>
                {voiceInventory.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">No voice numbers in inventory yet.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Number</TableHead>
                        <TableHead>Provider</TableHead>
                        <TableHead>Assigned to</TableHead>
                        <TableHead className="text-right w-[120px]">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {voiceInventory.map((row) => {
                        const owner = row.voiceAgentId ? agentNameById.get(row.voiceAgentId) ?? "—" : "Unassigned";
                        const isMine = row.voiceAgentId === editing.id;
                        return (
                          <TableRow key={`${row.providerKind}-${row.id}`}>
                            <TableCell className="font-mono text-xs">{row.e164}</TableCell>
                            <TableCell className="text-xs">{row.providerLabel}</TableCell>
                            <TableCell className="text-xs">{owner}</TableCell>
                            <TableCell className="text-right">
                              {isMine ? (
                                <Button type="button" variant="ghost" size="sm" onClick={() => unlinkNumber(row)}>
                                  <Unlink className="h-3 w-3 mr-1" />
                                  Unassign
                                </Button>
                              ) : (
                                <Button
                                  type="button"
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => linkNumber(row, editing.id)}
                                >
                                  {row.voiceAgentId && row.voiceAgentId !== editing.id ? (
                                    <>
                                      <Link2 className="h-3 w-3 mr-1" />
                                      Reassign here
                                    </>
                                  ) : (
                                    <>
                                      <Link2 className="h-3 w-3 mr-1" />
                                      Assign here
                                    </>
                                  )}
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </div>

              <div className="space-y-2 border-t pt-4">
                <Label className="text-base">Assign WhatsApp numbers</Label>
                <p className="text-xs text-muted-foreground">From Twilio WhatsApp inventory entries.</p>
                {whatsappInventory.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">No WhatsApp numbers in inventory yet.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Number / label</TableHead>
                        <TableHead>Assigned to</TableHead>
                        <TableHead className="text-right w-[120px]">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {whatsappInventory.map((row) => {
                        const owner = row.voiceAgentId ? agentNameById.get(row.voiceAgentId) ?? "—" : "Unassigned";
                        const isMine = row.voiceAgentId === editing.id;
                        return (
                          <TableRow key={`${row.providerKind}-${row.id}`}>
                            <TableCell>
                              <div className="font-mono text-xs">{row.e164}</div>
                              <div className="text-[11px] text-muted-foreground">{row.label}</div>
                            </TableCell>
                            <TableCell className="text-xs">{owner}</TableCell>
                            <TableCell className="text-right">
                              {isMine ? (
                                <Button type="button" variant="ghost" size="sm" onClick={() => unlinkNumber(row)}>
                                  <Unlink className="h-3 w-3 mr-1" />
                                  Unassign
                                </Button>
                              ) : (
                                <Button
                                  type="button"
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => linkNumber(row, editing.id)}
                                >
                                  {row.voiceAgentId && row.voiceAgentId !== editing.id ? (
                                    <>
                                      <Link2 className="h-3 w-3 mr-1" />
                                      Reassign here
                                    </>
                                  ) : (
                                    <>
                                      <Link2 className="h-3 w-3 mr-1" />
                                      Assign here
                                    </>
                                  )}
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-3 border-t pt-4">
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
                <Label>Gemini / system instruction</Label>
                <Textarea
                  rows={4}
                  value={editing.systemInstructions}
                  onChange={(e) => setEditing({ ...editing, systemInstructions: e.target.value })}
                  placeholder="How to use CRM fields, escalation, brand rules…"
                />
              </div>
              <div className="space-y-2">
                <Label>Knowledge base selection (comma-separated)</Label>
                <Input value={kbInput} onChange={(e) => setKbInput(e.target.value)} placeholder="Policies, FAQs" />
              </div>
              <div className="space-y-2">
                <Label>CRM / ERP access (comma-separated)</Label>
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
                <Label>Fallback human agent</Label>
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
                <div>
                  <Label>Active</Label>
                  <p className="text-[11px] text-muted-foreground">Inactive agents stay in the list but won’t be preferred for new routing.</p>
                </div>
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
