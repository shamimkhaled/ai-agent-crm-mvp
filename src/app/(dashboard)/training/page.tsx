"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { BrainCircuit, MessageSquare, Play, Sparkles, Check, X, RotateCcw } from "lucide-react";

export default function AiTrainingPage() {
  const [testPrompt, setTestPrompt] = useState("");
  const [testing, setTesting] = useState(false);
  const [results, setResults] = useState<{role:string, text:string}[]>([]);

  const runTest = () => {
     if(!testPrompt) return;
     setTesting(true);
     setResults([...results, { role: 'user', text: testPrompt }]);
     setTimeout(() => {
        setResults(prev => [...prev, { role: 'ai', text: "Based on fine-tuning, I can safely reject parameters outside standard bounds. (Test Output)" }]);
        setTesting(false);
        setTestPrompt("");
     }, 1000);
  };

  return (
    <div className="space-y-6 pb-12">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">AI Training & Fine-Tuning</h1>
          <p className="text-muted-foreground mt-1">
            Test real-world prompt scenarios and evaluate Gemini model outputs.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
         {/* Config Panel */}
         <div className="space-y-6">
            <Card className="glass border-primary/20">
               <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Sparkles className="w-5 h-5 text-primary"/> Base Model Settings</CardTitle>
               </CardHeader>
               <CardContent className="space-y-4">
                  <div className="space-y-2">
                     <p className="font-medium text-sm">System Metaprompt</p>
                     <Textarea defaultValue="You are an admin level AI dealing strictly with B2B requests..." className="h-[120px] font-mono text-xs" />
                  </div>
                  <div className="space-y-4 pt-2">
                     <div>
                        <div className="flex justify-between mb-2">
                           <span className="text-sm font-medium">Temperature</span>
                           <span className="text-xs text-muted-foreground">0.7</span>
                        </div>
                        <Slider defaultValue={[70]} max={100} step={1} />
                     </div>
                     <div>
                        <div className="flex justify-between mb-2">
                           <span className="text-sm font-medium">Top-K</span>
                           <span className="text-xs text-muted-foreground">40</span>
                        </div>
                        <Slider defaultValue={[40]} max={100} step={1} />
                     </div>
                  </div>
               </CardContent>
               <CardFooter>
                  <Button variant="outline" className="w-full">Save Calibration</Button>
               </CardFooter>
            </Card>

            <Card className="glass">
               <CardHeader>
                  <CardTitle className="text-lg">Recent Evals</CardTitle>
               </CardHeader>
               <CardContent className="space-y-3">
                  <div className="flex items-start justify-between border-b pb-3 border-border/50">
                     <div className="space-y-1">
                        <p className="text-sm font-medium">Pricing Objection Handling</p>
                        <p className="text-xs text-muted-foreground line-clamp-1">Expected AI to deflect discount requests over 15%</p>
                     </div>
                     <Badge variant="outline" className="text-green-500 border-green-500 bg-green-500/10">Passed</Badge>
                  </div>
                  <div className="flex items-start justify-between">
                     <div className="space-y-1">
                        <p className="text-sm font-medium">Bangla Name Entity Extraction</p>
                        <p className="text-xs text-muted-foreground line-clamp-1">Complex names failure on STT boundary</p>
                     </div>
                     <Badge variant="outline" className="text-destructive border-destructive bg-destructive/10">Failed</Badge>
                  </div>
               </CardContent>
            </Card>
         </div>

         {/* Testing Arena */}
         <Card className="glass flex flex-col">
            <CardHeader className="border-b border-border/50 pb-4 shrink-0">
               <CardTitle className="flex items-center gap-2"><BrainCircuit className="w-5 h-5"/> Playground Sandbox</CardTitle>
               <CardDescription>Simulate the AI mapping context.</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 overflow-auto p-4 space-y-4">
               {results.map((res, i) => (
                  <div key={i} className={`flex ${res.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                     <div className={`max-w-[80%] rounded-xl p-3 text-sm ${res.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                        {res.text}
                     </div>
                  </div>
               ))}
               {results.length === 0 && (
                  <div className="h-full flex items-center justify-center text-muted-foreground flex-col gap-2 opacity-50">
                     <MessageSquare className="w-12 h-12" />
                     <p>Start a simulation to evaluate the responses.</p>
                  </div>
               )}
            </CardContent>
            <CardFooter className="shrink-0 border-t border-border/50 pt-4 bg-background/50">
               <div className="flex w-full gap-2 relative">
                  <Input 
                     placeholder="Test a scenario..." 
                     value={testPrompt}
                     onChange={e => setTestPrompt(e.target.value)}
                     onKeyDown={e => e.key === 'Enter' && runTest()}
                  />
                  <Button onClick={runTest} disabled={testing || !testPrompt}>
                     <Play className="w-4 h-4" />
                  </Button>
               </div>
            </CardFooter>
         </Card>
      </div>
    </div>
  );
}
