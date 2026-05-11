"use client";

import { useVoicePlatformStore } from "@/store/voicePlatformStore";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SettingsSectionHeader } from "@/components/settings/SettingsSectionHeader";

export default function CallRoutingPage() {
  const { routing, setRouting, agents } = useVoicePlatformStore();

  return (
    <div className="space-y-8 pb-12">
      <SettingsSectionHeader
        title="Call routing"
        subtitle="Tell the platform which AI voice agent picks up for each situation: default line, after-hours, language, or a named department. Human handover sends low-confidence calls to your CRM queue."
      />

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="glass">
          <CardHeader>
            <CardTitle className="text-base">Default & fallback</CardTitle>
            <CardDescription>Baseline agent selection when no rule matches.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Default agent</Label>
              <Select
                value={routing.defaultAgentId}
                onValueChange={(v) => setRouting({ defaultAgentId: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {agents.map((a) => (
                    <SelectItem key={a.id} value={a.id} disabled={!a.active}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Fallback agent</Label>
              <Select
                value={routing.fallbackAgentId}
                onValueChange={(v) => setRouting({ fallbackAgentId: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {agents.map((a) => (
                    <SelectItem key={a.id} value={a.id} disabled={!a.active}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card className="glass">
          <CardHeader>
            <CardTitle className="text-base">Business hours</CardTitle>
            <CardDescription>Different agents for in-hours vs after-hours coverage.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>In-hours agent</Label>
              <Select
                value={routing.businessHoursAgentId}
                onValueChange={(v) => setRouting({ businessHoursAgentId: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {agents.map((a) => (
                    <SelectItem key={a.id} value={a.id} disabled={!a.active}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>After-hours agent</Label>
              <Select
                value={routing.afterHoursAgentId}
                onValueChange={(v) => setRouting({ afterHoursAgentId: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {agents.map((a) => (
                    <SelectItem key={a.id} value={a.id} disabled={!a.active}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card className="glass md:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Language-based routing</CardTitle>
            <CardDescription>Map locale detection output to an agent.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            {(["en", "bn", "auto"] as const).map((lang) => (
              <div key={lang} className="space-y-2">
                <Label className="uppercase">{lang}</Label>
                <Select
                  value={routing.byLanguage[lang] ?? routing.defaultAgentId}
                  onValueChange={(v) =>
                    setRouting({ byLanguage: { ...routing.byLanguage, [lang]: v } })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {agents.map((a) => (
                      <SelectItem key={a.id} value={a.id} disabled={!a.active}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="glass md:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Human handover</CardTitle>
            <CardDescription>CRM ticket queue when AI escalates or the caller asks for a person.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Target department</Label>
              <Input
                value={routing.handoverDepartment}
                onChange={(e) => setRouting({ handoverDepartment: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Queue / skill name</Label>
              <Input
                value={routing.handoverQueue}
                onChange={(e) => setRouting({ handoverQueue: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2 space-y-2">
              <Label>Department → agent overrides (one per line: Dept=agentId)</Label>
              <Textarea
                rows={4}
                className="font-mono text-xs"
                defaultValue={Object.entries(routing.byDepartment)
                  .map(([k, v]) => `${k}=${v}`)
                  .join("\n")}
                onBlur={(e) => {
                  const lines = e.target.value.split("\n").filter(Boolean);
                  const map: Record<string, string> = {};
                  for (const line of lines) {
                    const [d, id] = line.split("=").map((s) => s.trim());
                    if (d && id) map[d] = id;
                  }
                  setRouting({ byDepartment: map });
                }}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
