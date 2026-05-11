"use client";

import Link from "next/link";
import { useConversationStore } from "@/store/conversationStore";
import { useVoicePlatformStore } from "@/store/voicePlatformStore";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MessageSquare, Phone } from "lucide-react";

export default function ConversationsHubPage() {
  const { conversations } = useConversationStore();
  const { callHistory, pipelineLogs, escalations } = useVoicePlatformStore();

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Conversations & call history</h1>
          <p className="text-muted-foreground mt-1 max-w-3xl text-sm">
            Unified operational view: omnichannel threads from Supabase, AI call legs with transcripts
            and confidence, and escalation markers for QA.
          </p>
        </div>
        <Button variant="secondary" asChild>
          <Link href="/inbox">
            <MessageSquare className="h-4 w-4 mr-2" />
            Open omnichannel inbox
          </Link>
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="glass">
          <CardHeader>
            <CardTitle className="text-base">Live conversation index</CardTitle>
            <CardDescription>Synced from Supabase Realtime when `conversations` is enabled.</CardDescription>
          </CardHeader>
          <CardContent>
            {conversations.length === 0 ? (
              <p className="text-sm text-muted-foreground">No rows yet — seed data from Inbox or CRM webhooks.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {conversations.slice(0, 8).map((c) => (
                  <li key={c.id} className="flex justify-between gap-2 border-b border-border/60 pb-2">
                    <span className="font-medium">{c.customerName}</span>
                    <Badge variant="outline">{c.channel}</Badge>
                    <span className="text-muted-foreground truncate max-w-[40%]">{c.lastMessage}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="glass">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Phone className="h-4 w-4" />
              AI voice call history
            </CardTitle>
            <CardDescription>Duration, agent, escalation, and provider stamp.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Caller</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>Agent</TableHead>
                  <TableHead>Conf.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {callHistory.slice(0, 6).map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono text-xs">{row.caller}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{row.channel}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">{row.agentName}</TableCell>
                    <TableCell className="text-xs">
                      {row.avgConfidence}%
                      {row.escalation && (
                        <Badge variant="destructive" className="ml-2 text-[10px]">
                          ESC
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card className="glass">
        <CardHeader>
          <CardTitle className="text-base">Recent pipeline & escalations</CardTitle>
          <CardDescription>Latest Gemini/TTS hops and human handover triggers.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 text-xs">
          <div>
            <p className="font-medium text-sm mb-2">Pipeline</p>
            <ul className="space-y-1 text-muted-foreground font-mono">
              {[...pipelineLogs].reverse().slice(0, 6).map((p) => (
                <li key={p.id}>
                  {p.step}: {p.detail.slice(0, 80)}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="font-medium text-sm mb-2">Escalations</p>
            <ul className="space-y-1 text-muted-foreground">
              {[...escalations].reverse().slice(0, 5).map((e) => (
                <li key={e.id}>{e.reason}</li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
