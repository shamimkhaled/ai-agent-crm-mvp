"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UploadCloud, FileText, Trash2, Loader2, Search, Layers, MessageSquare } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/hooks/use-toast";

type StorageFile = { name: string; metadata?: unknown; created_at: string; updated_at?: string };

const FAQ_SEED = [
  { id: "1", q: "What are business hours?", a: "Sat–Thu 9am–6pm Asia/Dhaka; Fri reduced staff." },
  { id: "2", q: "How do returns work?", a: "Garments: 7-day exchange with tags; see policy PDF in storage." },
];

export default function KnowledgeBasePage() {
  const [files, setFiles] = useState<StorageFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [faqs, setFaqs] = useState(FAQ_SEED);
  const [newQ, setNewQ] = useState("");
  const [newA, setNewA] = useState("");
  const [retrievalQ, setRetrievalQ] = useState("Summarize our return policy in one sentence.");
  const [retrievalOut, setRetrievalOut] = useState("");
  const [retrievalBusy, setRetrievalBusy] = useState(false);
  const supabase = createClient();
  const { toast } = useToast();

  const fetchFiles = async () => {
    setLoading(true);
    const { data } = await supabase.storage.from("knowledge_base").list();
    if (data) setFiles(data as StorageFile[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchFiles();
  }, []);

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const { error } = await supabase.storage.from("knowledge_base").upload(`${Date.now()}_${file.name}`, file);
    if (error) {
      toast({ title: "Upload failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Uploaded", description: "Queued for chunking / embedding in production." });
      fetchFiles();
    }
    setUploading(false);
  };

  const handleDelete = async (fileName: string) => {
    const { error } = await supabase.storage.from("knowledge_base").remove([fileName]);
    if (error) toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    else fetchFiles();
  };

  const runRetrievalTest = async () => {
    if (!retrievalQ.trim()) return;
    setRetrievalBusy(true);
    setRetrievalOut("");
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            {
              role: "user",
              content: `${retrievalQ}\n\nContext: you may use uploaded knowledge base + CRM mapping from the product demo.`,
            },
          ],
        }),
      });
      const data = await res.json();
      setRetrievalOut(data.result ?? "No response");
    } catch {
      setRetrievalOut("Request failed.");
    } finally {
      setRetrievalBusy(false);
    }
  };

  return (
    <div className="space-y-6 pb-12 max-w-6xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Knowledge base</h1>
        <p className="text-muted-foreground mt-1 text-sm max-w-3xl leading-relaxed">
          Documents (PDF, DOCX, TXT, CSV, Excel) feed retrieval-augmented answers. FAQs add structured
          facts. The AI test tab calls Gemini the same way voice STT text would after you wire RAG.
        </p>
      </div>

      <Tabs defaultValue="documents" className="space-y-6">
        <TabsList className="grid w-full max-w-lg grid-cols-3">
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="faqs">FAQs</TabsTrigger>
          <TabsTrigger value="test">AI retrieval test</TabsTrigger>
        </TabsList>

        <TabsContent value="documents" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-1 space-y-6">
              <Card className="glass border-dashed border-2 border-primary/20 bg-primary/5 hover:bg-primary/10 transition-colors relative text-center">
                <input
                  type="file"
                  accept=".pdf,.doc,.docx,.txt,.csv,.xlsx"
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  onChange={handleUpload}
                  disabled={uploading}
                />
                <CardContent className="py-12 flex flex-col items-center justify-center space-y-4 pointer-events-none">
                  <div className="p-4 bg-background rounded-full shadow-sm">
                    {uploading ? (
                      <Loader2 className="w-8 h-8 text-primary animate-spin" />
                    ) : (
                      <UploadCloud className="w-8 h-8 text-primary" />
                    )}
                  </div>
                  <div className="space-y-1">
                    <h3 className="font-medium text-lg">
                      {uploading ? "Uploading…" : "Drag & drop or click"}
                    </h3>
                    <p className="text-sm text-muted-foreground">PDF, DOCX, TXT, CSV, XLSX</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="glass">
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Layers className="w-4 h-4" /> Chunk pipeline (preview)
                  </CardTitle>
                  <CardDescription>Visual status for investor demos — wire workers in production.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs">
                      <span>Parse & chunk</span>
                      <span className="text-primary">Done</span>
                    </div>
                    <Progress value={100} className="h-1.5" />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs">
                      <span>Embeddings</span>
                      <span className="text-muted-foreground">Queue</span>
                    </div>
                    <Progress value={files.length ? 60 : 10} className="h-1.5" />
                  </div>
                  <div className="flex justify-between text-sm pt-2">
                    <span className="text-muted-foreground">Files in bucket</span>
                    <span className="font-mono">{files.length}</span>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="md:col-span-2 space-y-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <FileText className="w-5 h-5" /> Searchable library
              </h3>
              {loading ? (
                <div className="p-8 text-center">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" />
                </div>
              ) : (
                files.map((file, idx) => (
                  <Card key={idx} className="glass flex flex-row items-center justify-between p-4 flex-wrap gap-4">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded bg-muted flex items-center justify-center">
                        <FileText className="w-5 h-5 text-muted-foreground" />
                      </div>
                      <div>
                        <h4 className="font-medium text-sm break-all max-w-[220px] sm:max-w-md">{file.name}</h4>
                        <span className="text-xs text-muted-foreground">
                          Uploaded {new Date(file.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="border-primary/50 text-primary bg-primary/5">
                        Indexed
                      </Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(file.name)}
                        className="text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </Card>
                ))
              )}
              {!loading && files.length === 0 && (
                <div className="p-8 text-center border rounded-xl border-dashed border-border text-muted-foreground text-sm">
                  No files yet — upload a policy PDF to light up the pipeline.
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="faqs" className="space-y-4">
          <Card className="glass">
            <CardHeader>
              <CardTitle className="text-base">FAQ manager</CardTitle>
              <CardDescription>Short answers the AI can quote verbatim on voice or chat.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <label className="text-sm font-medium">Question</label>
                  <Input value={newQ} onChange={(e) => setNewQ(e.target.value)} placeholder="Shipping time to Chittagong?" />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <label className="text-sm font-medium">Answer</label>
                  <Textarea rows={3} value={newA} onChange={(e) => setNewA(e.target.value)} />
                </div>
                <Button
                  type="button"
                  onClick={() => {
                    if (!newQ.trim() || !newA.trim()) return;
                    setFaqs((f) => [...f, { id: Date.now().toString(), q: newQ.trim(), a: newA.trim() }]);
                    setNewQ("");
                    setNewA("");
                    toast({ title: "FAQ added", description: "Persist to Supabase table in production." });
                  }}
                >
                  Add FAQ
                </Button>
              </div>
              <ul className="divide-y divide-border rounded-lg border">
                {faqs.map((f) => (
                  <li key={f.id} className="p-4 space-y-1">
                    <p className="font-medium text-sm">{f.q}</p>
                    <p className="text-sm text-muted-foreground">{f.a}</p>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="test" className="space-y-4">
          <Card className="glass">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Search className="w-4 h-4" /> AI answer test
              </CardTitle>
              <CardDescription>Uses the same Gemini route as live voice text turns.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                rows={4}
                value={retrievalQ}
                onChange={(e) => setRetrievalQ(e.target.value)}
                placeholder="Ask a question that should use your docs + CRM context…"
              />
              <Button type="button" onClick={runRetrievalTest} disabled={retrievalBusy}>
                {retrievalBusy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <MessageSquare className="h-4 w-4 mr-2" />}
                Run test
              </Button>
              {retrievalOut && (
                <div className="rounded-lg border bg-muted/30 p-4 text-sm whitespace-pre-wrap">{retrievalOut}</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
