"use client";

import { useVoicePlatformStore } from "@/store/voicePlatformStore";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SettingsSectionHeader } from "@/components/settings/SettingsSectionHeader";

export default function PipelineLogsPage() {
  const { pipelineLogs, escalations } = useVoicePlatformStore();
  const reversed = [...pipelineLogs].reverse();

  return (
    <div className="space-y-8 pb-12">
      <SettingsSectionHeader
        title="Voice pipeline logs"
        subtitle="Every hop from media in → STT → intent → CRM/ERP → Gemini → TTS → audio out. Run the Live calls simulator or Investor demo to populate rows; ship the same events to Supabase for long-term QA."
      />

      <Card className="glass">
        <CardHeader>
          <CardTitle className="text-base">Pipeline trace</CardTitle>
          <CardDescription>Newest first.</CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[480px] rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">Time</TableHead>
                  <TableHead>Call</TableHead>
                  <TableHead>Step</TableHead>
                  <TableHead>Detail</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reversed.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-muted-foreground text-center py-8">
                      Run a simulator call on Live Calls to populate traces.
                    </TableCell>
                  </TableRow>
                ) : (
                  reversed.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-mono text-xs whitespace-nowrap">
                        {new Date(row.at).toLocaleTimeString()}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{row.callId}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{row.step}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-md">
                        {row.detail}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>

      <Card className="glass border-destructive/20">
        <CardHeader>
          <CardTitle className="text-base text-destructive">Escalation events</CardTitle>
          <CardDescription>Human handover triggers from low confidence or explicit requests.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            {escalations.length === 0 ? (
              <li className="text-muted-foreground">No escalations in this session.</li>
            ) : (
              [...escalations].reverse().map((e) => (
                <li key={e.id} className="flex flex-wrap gap-2 border-b border-border/60 pb-2">
                  <span className="text-muted-foreground font-mono text-xs">
                    {new Date(e.at).toLocaleString()}
                  </span>
                  <Badge variant="destructive">{e.callId}</Badge>
                  {e.reason}
                </li>
              ))
            )}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
