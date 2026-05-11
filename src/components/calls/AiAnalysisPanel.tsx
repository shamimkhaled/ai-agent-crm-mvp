"use client";

import { useCallStore } from "@/store/callStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { AlertCircle, Database, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AiAnalysisPanel() {
  const { isSimulating, activeCall } = useCallStore();

  if (!isSimulating || !activeCall) {
    return (
      <Card className="glass h-full">
        <CardContent className="h-full flex items-center justify-center text-muted-foreground p-6 text-center">
          Monitoring line... No active calls right now.
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
                <span className="font-medium">{activeCall.dealerCode || 'N/A'}</span>
              </div>
              <div className="bg-muted p-2 rounded flex flex-col">
                <span className="text-xs text-muted-foreground">Type</span>
                <span className="font-medium">{activeCall.isDealer ? 'Dealer' : 'Customer'}</span>
              </div>
           </div>
        </div>

        <div>
          <div className="flex justify-between items-end mb-2">
            <h4 className="text-sm font-medium text-muted-foreground">AI Confidence</h4>
            <span className={`text-sm font-bold ${isLowConfidence ? 'text-destructive' : 'text-primary'}`}>
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
          <Button variant={isLowConfidence ? 'default' : 'secondary'} className="w-full">
            Take Over Call
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
