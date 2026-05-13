"use client";

import { useCallStore } from "@/store/callStore";
import type { CallSessionRow } from "@/hooks/useLiveVoiceDashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { AlertCircle, Database, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  mode?: "simulator" | "live";
  liveSession?: CallSessionRow | null;
};

export function AiAnalysisPanel({ mode = "simulator", liveSession }: Props) {
  const { isSimulating, activeCall } = useCallStore();

  if (mode === "live" && liveSession) {
    const score = liveSession.ai_confidence ?? 0;
    const isLow = score > 0 && score < 60;
    return (
      <Card className="glass h-full flex flex-col border-primary/15">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Database className="h-4 w-4" /> Live AI engine
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 flex-1">
          <div>
            <h4 className="text-xs font-medium mb-2 text-muted-foreground">Detected intent</h4>
            <Badge variant="outline" className="text-sm border-primary/40">
              {liveSession.intent_label || "—"}
            </Badge>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="bg-muted p-2 rounded flex flex-col">
              <span className="text-[10px] text-muted-foreground">Dealer hint</span>
              <span className="font-mono text-xs">{liveSession.dealer_code_hint || "—"}</span>
            </div>
            <div className="bg-muted p-2 rounded flex flex-col">
              <span className="text-[10px] text-muted-foreground">Dashboard</span>
              <span className="font-medium text-xs">{liveSession.dashboard_state || "—"}</span>
            </div>
          </div>
          <div>
            <div className="flex justify-between items-end mb-2">
              <h4 className="text-xs font-medium text-muted-foreground">AI confidence</h4>
              <span className={`text-sm font-bold ${isLow ? "text-destructive" : "text-primary"}`}>
                {liveSession.ai_confidence != null ? `${liveSession.ai_confidence}%` : "—"}
              </span>
            </div>
            {liveSession.ai_confidence != null && (
              <Progress value={liveSession.ai_confidence} className="h-2" />
            )}
            {(isLow || liveSession.escalation) && (
              <div className="flex items-center text-destructive text-xs mt-2">
                <AlertCircle className="w-3 h-3 mr-1 shrink-0" /> Escalation / handover signal
              </div>
            )}
          </div>
          <div className="mt-auto pt-3 border-t border-border flex items-center gap-2 text-xs text-muted-foreground">
            <CheckCircle2 className="h-3 w-3 text-emerald-500" />
            Gemini + CRM context on server; Twilio plays TTS to caller.
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!isSimulating || !activeCall) {
    return (
      <Card className="glass h-full">
        <CardContent className="h-full flex items-center justify-center text-muted-foreground p-6 text-center text-sm">
          Start the simulator or select a live call for AI analytics.
        </CardContent>
      </Card>
    );
  }

  const isLowConfidence = activeCall.confidenceScore < 60;

  return (
    <Card className="glass h-full flex flex-col">
      <CardHeader>
        <CardTitle>AI Decision Engine</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-6 flex-1">
        <div>
          <h4 className="text-sm font-medium mb-2 text-muted-foreground">Detected Intent</h4>
          <Badge variant="outline" className="text-base py-1 border-primary/50 text-foreground">
            {activeCall.intent}
          </Badge>
        </div>

        <div>
          <h4 className="text-sm font-medium mb-2 text-muted-foreground">Extracted Entities</h4>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="bg-muted p-2 rounded flex flex-col">
              <span className="text-xs text-muted-foreground">Dealer ID</span>
              <span className="font-medium">{activeCall.dealerCode || "N/A"}</span>
            </div>
            <div className="bg-muted p-2 rounded flex flex-col">
              <span className="text-xs text-muted-foreground">Type</span>
              <span className="font-medium">{activeCall.isDealer ? "Dealer" : "Customer"}</span>
            </div>
          </div>
        </div>

        <div>
          <div className="flex justify-between items-end mb-2">
            <h4 className="text-sm font-medium text-muted-foreground">AI Confidence</h4>
            <span className={`text-sm font-bold ${isLowConfidence ? "text-destructive" : "text-primary"}`}>
              {activeCall.confidenceScore}%
            </span>
          </div>
          <Progress value={activeCall.confidenceScore} className="h-2" />
          {isLowConfidence && (
            <div className="flex items-center text-destructive text-sm mt-2">
              <AlertCircle className="w-4 h-4 mr-1" /> Handover Recommended
            </div>
          )}
        </div>

        <div className="mt-auto pt-4 border-t border-border">
          <Button variant={isLowConfidence ? "default" : "secondary"} className="w-full">
            Take Over Call
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
