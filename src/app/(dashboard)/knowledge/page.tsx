"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
  BookOpen, Upload, Search, Zap, FileText, Activity,
  CheckCircle2, Clock, Loader2, AlertTriangle, Trash2,
  Database, Eye, RefreshCw, Brain,
} from "lucide-react";

interface KbDocument {
  id: string;
  title: string;
  status: string;
  mime_type: string;
  storage_path: string;
  created_at: string;
  chunk_count?: number;
}

interface SearchResult {
  content: string;
  similarity?: number;
  meta?: Record<string, unknown>;
}

const STATUS_ICONS = {
  ready:      { icon: <CheckCircle2 size={12} />, color: "text-[hsl(var(--emerald))]", bg: "bg-[hsl(var(--emerald))/10]" },
  processing: { icon: <Loader2 size={12} className="animate-spin" />, color: "text-[hsl(var(--cyan))]", bg: "bg-[hsl(var(--cyan))/10]" },
  partial:    { icon: <AlertTriangle size={12} />, color: "text-[hsl(var(--amber))]", bg: "bg-[hsl(var(--amber))/10]" },
  error:      { icon: <AlertTriangle size={12} />, color: "text-[hsl(var(--rose))]", bg: "bg-[hsl(var(--rose))/10]" },
};

function DocCard({
  doc,
  onIngest,
  onDelete,
  ingesting,
}: {
  doc: KbDocument;
  onIngest: (doc: KbDocument) => void;
  onDelete: (id: string) => void;
  ingesting: boolean;
}) {
  const status = STATUS_ICONS[doc.status as keyof typeof STATUS_ICONS] ?? STATUS_ICONS.processing;
  const isConnector = doc.storage_path.startsWith("connector:");

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[hsl(var(--surface-2))] hover:bg-[hsl(var(--surface-3))] transition-colors group"
    >
      {/* Icon */}
      <div className={cn(
        "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
        isConnector ? "bg-[hsl(var(--violet))/10]" : "bg-[hsl(var(--cyan))/10]"
      )}>
        {isConnector ? (
          <Database size={14} className="text-[hsl(var(--violet))]" />
        ) : (
          <FileText size={14} className="text-[hsl(var(--cyan))]" />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{doc.title}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <div className={cn("flex items-center gap-1 text-[10px] font-mono", status.color)}>
            {status.icon}
            {doc.status}
          </div>
          {doc.chunk_count !== undefined && (
            <span className="text-[10px] font-mono text-muted-foreground">
              {doc.chunk_count} chunks
            </span>
          )}
          <span className="text-[10px] font-mono text-muted-foreground">
            {new Date(doc.created_at).toLocaleDateString()}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs gap-1 hover:text-[hsl(var(--cyan))]"
          onClick={() => onIngest(doc)}
          disabled={ingesting}
          title="Re-process & generate embeddings"
        >
          {ingesting ? <Loader2 size={11} className="animate-spin" /> : <Zap size={11} />}
          Embed
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 text-destructive hover:text-destructive"
          onClick={() => onDelete(doc.id)}
          title="Delete document"
        >
          <Trash2 size={11} />
        </Button>
      </div>
    </motion.div>
  );
}

export default function KnowledgePage() {
  const [docs, setDocs] = useState<KbDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [ingestingId, setIngestingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [totalChunks, setTotalChunks] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const loadDocs = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("kb_documents")
      .select("*")
      .order("created_at", { ascending: false });

    const docList = (data ?? []) as KbDocument[];

    // Fetch chunk counts
    const withCounts = await Promise.all(
      docList.map(async (doc) => {
        const { count } = await supabase
          .from("kb_chunks")
          .select("*", { count: "exact", head: true })
          .eq("document_id", doc.id);
        return { ...doc, chunk_count: count ?? 0 };
      })
    );

    setDocs(withCounts);
    setTotalChunks(withCounts.reduce((sum, d) => sum + (d.chunk_count ?? 0), 0));
    setLoading(false);
  }, []);

  useEffect(() => { void loadDocs(); }, [loadDocs]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);

    const supabase = createClient();
    const filePath = `uploads/${Date.now()}_${file.name}`;

    // 1. Upload to Supabase Storage
    const { error: uploadErr } = await supabase.storage
      .from("knowledge_base")
      .upload(filePath, file);

    if (uploadErr) {
      toast({ title: "Upload failed", description: uploadErr.message, variant: "destructive" });
      setUploading(false);
      return;
    }

    // 2. Create kb_documents row
    const { data: docRow, error: docErr } = await supabase
      .from("kb_documents")
      .insert({
        title: file.name,
        storage_path: filePath,
        mime_type: file.type || "text/plain",
        status: "processing",
      })
      .select("id")
      .single();

    if (docErr || !docRow) {
      toast({ title: "Document record failed", description: docErr?.message, variant: "destructive" });
      setUploading(false);
      return;
    }

    // 3. Trigger ingestion pipeline
    const res = await fetch("/api/knowledge/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        document_id: (docRow as KbDocument).id,
        storage_path: filePath,
      }),
    });
    const json = await res.json() as { stats?: { chunks_inserted: number } };

    toast({
      title: "Document ingested",
      description: `${json.stats?.chunks_inserted ?? 0} chunks with embeddings stored`,
    });

    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
    void loadDocs();
  };

  const handleIngest = async (doc: KbDocument) => {
    setIngestingId(doc.id);
    const res = await fetch("/api/knowledge/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        document_id: doc.id,
        storage_path: doc.storage_path,
      }),
    });
    const json = await res.json() as { error?: string; stats?: { chunks_inserted: number } };
    setIngestingId(null);
    if (!res.ok) {
      toast({ title: "Ingest failed", description: json.error ?? "Error", variant: "destructive" });
    } else {
      toast({ title: "Re-ingested", description: `${json.stats?.chunks_inserted ?? 0} chunks updated` });
      void loadDocs();
    }
  };

  const handleDelete = async (id: string) => {
    const supabase = createClient();
    await supabase.from("kb_chunks").delete().eq("document_id", id);
    await supabase.from("kb_documents").delete().eq("id", id);
    toast({ title: "Document deleted" });
    setDocs((prev) => prev.filter((d) => d.id !== id));
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setSearchResults([]);

    const supabase = createClient();
    const { data } = await supabase
      .from("kb_chunks")
      .select("content,meta")
      .or(
        searchQuery.toLowerCase().split(" ").filter(Boolean)
          .map((w) => `content.ilike.%${w}%`)
          .join(",")
      )
      .limit(8);

    setSearchResults((data as SearchResult[]) ?? []);
    setSearching(false);
  };

  return (
    <div className="space-y-6 pb-16">
      {/* Header */}
      <motion.div
        className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: "Syne, sans-serif" }}>Knowledge Base</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            RAG pipeline — documents & connector data → embeddings → voice AI retrieval
          </p>
        </div>
        <Button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="bg-[hsl(var(--cyan))] text-[hsl(var(--surface-0))] hover:bg-[hsl(var(--cyan))/90] gap-2 font-semibold"
        >
          {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
          {uploading ? "Processing…" : "Upload Document"}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".txt,.md,.json,.csv,.html,.pdf"
          className="hidden"
          onChange={handleUpload}
        />
      </motion.div>

      {/* Stats row */}
      <motion.div
        className="grid grid-cols-2 sm:grid-cols-4 gap-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
      >
        {[
          { label: "Documents", value: docs.length, icon: <FileText size={14} />, color: "cyan" },
          { label: "Total Chunks", value: totalChunks.toLocaleString(), icon: <Activity size={14} />, color: "violet" },
          { label: "Embeddings", value: "768-dim", icon: <Brain size={14} />, color: "emerald" },
          { label: "Ready", value: docs.filter((d) => d.status === "ready").length, icon: <CheckCircle2 size={14} />, color: "amber" },
        ].map((s) => (
          <div key={s.label} className={cn(
            "glass rounded-xl p-4 flex items-center gap-3",
            s.color === "cyan" && "border-[hsl(var(--cyan))/20]",
            s.color === "violet" && "border-[hsl(var(--violet))/20]",
            s.color === "emerald" && "border-[hsl(var(--emerald))/20]",
            s.color === "amber" && "border-[hsl(var(--amber))/20]",
          )}>
            <div className={cn(
              "w-8 h-8 rounded-lg flex items-center justify-center",
              s.color === "cyan" && "bg-[hsl(var(--cyan))/10] text-[hsl(var(--cyan))]",
              s.color === "violet" && "bg-[hsl(var(--violet))/10] text-[hsl(var(--violet))]",
              s.color === "emerald" && "bg-[hsl(var(--emerald))/10] text-[hsl(var(--emerald))]",
              s.color === "amber" && "bg-[hsl(var(--amber))/10] text-[hsl(var(--amber))]",
            )}>
              {s.icon}
            </div>
            <div>
              <p className="metric-value text-lg text-foreground">{s.value}</p>
              <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">{s.label}</p>
            </div>
          </div>
        ))}
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Document list */}
        <motion.div
          className="glass rounded-xl overflow-hidden"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BookOpen size={15} className="text-[hsl(var(--cyan))]" />
              <h3 className="text-sm font-semibold" style={{ fontFamily: "Syne, sans-serif" }}>Documents</h3>
            </div>
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-muted-foreground" onClick={loadDocs}>
              <RefreshCw size={11} /> Refresh
            </Button>
          </div>

          <div className="p-3 space-y-2 max-h-[480px] overflow-y-auto">
            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-12 rounded-xl bg-[hsl(var(--surface-2))] animate-pulse" />
                ))}
              </div>
            ) : docs.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 gap-3 text-center">
                <BookOpen size={24} className="text-muted-foreground/40" />
                <div>
                  <p className="text-sm text-muted-foreground">No documents yet</p>
                  <p className="text-xs text-muted-foreground/60 mt-0.5">Upload .txt, .md, .json, or .csv files</p>
                </div>
              </div>
            ) : (
              <AnimatePresence mode="popLayout">
                {docs.map((doc) => (
                  <DocCard
                    key={doc.id}
                    doc={doc}
                    onIngest={handleIngest}
                    onDelete={handleDelete}
                    ingesting={ingestingId === doc.id}
                  />
                ))}
              </AnimatePresence>
            )}
          </div>

          {/* Pipeline info */}
          <div className="px-5 py-3 border-t border-border bg-[hsl(var(--surface-0))]">
            <p className="text-[10px] font-mono text-muted-foreground flex items-center gap-1.5">
              <Zap size={9} className="text-[hsl(var(--cyan))]" />
              Upload → auto-chunked → Gemini text-embedding-004 → pgvector → semantic retrieval
            </p>
          </div>
        </motion.div>

        {/* Semantic search tester */}
        <motion.div
          className="glass rounded-xl overflow-hidden"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <div className="px-5 py-4 border-b border-border flex items-center gap-2">
            <Search size={15} className="text-[hsl(var(--violet))]" />
            <h3 className="text-sm font-semibold" style={{ fontFamily: "Syne, sans-serif" }}>
              Knowledge Search Tester
            </h3>
            <Badge className="text-[10px] font-mono bg-[hsl(var(--violet))/10] text-[hsl(var(--violet))] border-[hsl(var(--violet))/30] ml-auto">
              RAG Debug
            </Badge>
          </div>

          <div className="p-4 space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-mono text-muted-foreground uppercase">Test Query</Label>
              <div className="flex gap-2">
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  placeholder="Can you tell me order number 2415 details?"
                  className="bg-[hsl(var(--surface-2))] border-border flex-1"
                />
                <Button
                  onClick={handleSearch}
                  disabled={searching || !searchQuery.trim()}
                  className="bg-[hsl(var(--violet))/20] text-[hsl(var(--violet))] hover:bg-[hsl(var(--violet))/30] border border-[hsl(var(--violet))/30] gap-1.5"
                >
                  {searching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                  Search
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground font-mono">
                Simulates what AI retrieves when a caller asks this question
              </p>
            </div>

            <div className="space-y-2 max-h-[380px] overflow-y-auto">
              {searching ? (
                <div className="flex items-center justify-center h-24 gap-2 text-muted-foreground">
                  <Loader2 size={16} className="animate-spin" />
                  <span className="text-sm">Searching knowledge base…</span>
                </div>
              ) : searchResults.length > 0 ? (
                searchResults.map((result, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="rounded-xl bg-[hsl(var(--surface-2))] p-3 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Eye size={11} className="text-[hsl(var(--violet))]" />
                        <span className="text-[10px] font-mono text-[hsl(var(--violet))]">Chunk {i + 1}</span>
                      </div>
                      {result.similarity !== undefined && (
                        <Badge className="text-[9px] font-mono bg-[hsl(var(--emerald))/10] text-[hsl(var(--emerald))] border-[hsl(var(--emerald))/30]">
                          {(result.similarity * 100).toFixed(1)}% match
                        </Badge>
                      )}
                      {Boolean(result.meta?.connector_name) && (
                        <Badge variant="outline" className="text-[9px] font-mono text-muted-foreground border-border">
                          {String(result.meta?.connector_name ?? "")}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-foreground leading-relaxed">{result.content}</p>
                  </motion.div>
                ))
              ) : searchQuery && !searching ? (
                <div className="flex flex-col items-center justify-center h-24 gap-2 text-center">
                  <AlertTriangle size={20} className="text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">No chunks found for this query</p>
                  <p className="text-xs text-muted-foreground/60">Upload documents or sync a connector first</p>
                </div>
              ) : (
                <div className="rounded-xl bg-[hsl(var(--surface-0))] p-4 text-xs text-muted-foreground space-y-2 font-mono">
                  <p className="text-[hsl(var(--cyan))] font-semibold">// Why did AI say that?</p>
                  <p>Use this tester to debug what the AI retrieves before answering a caller.</p>
                  <p>Try: &quot;order number 2415&quot; or &quot;payment due&quot; or &quot;delivery status&quot;</p>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </div>

      {/* Upload guidelines */}
      <motion.div
        className="glass rounded-xl p-5"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
      >
        <div className="flex items-center gap-2 mb-3">
          <Activity size={14} className="text-[hsl(var(--amber))]" />
          <h3 className="text-sm font-semibold" style={{ fontFamily: "Syne, sans-serif" }}>Ingestion Pipeline</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            {
              step: "1. Upload",
              desc: "Upload .txt, .md, .json, .csv documents. Files are stored in Supabase Storage.",
              icon: <Upload size={16} />, color: "cyan",
            },
            {
              step: "2. Chunk + Embed",
              desc: "Documents are split into smart chunks (1000 chars, 100 overlap). Each chunk gets a Gemini text-embedding-004 vector.",
              icon: <Zap size={16} />, color: "violet",
            },
            {
              step: "3. AI Retrieval",
              desc: "During live calls, caller questions are embedded and cosine-similarity matched to find the most relevant chunks before Gemini answers.",
              icon: <Brain size={16} />, color: "emerald",
            },
          ].map((s) => (
            <div key={s.step} className="space-y-2">
              <div className={cn(
                "w-8 h-8 rounded-lg flex items-center justify-center",
                s.color === "cyan" && "bg-[hsl(var(--cyan))/10] text-[hsl(var(--cyan))]",
                s.color === "violet" && "bg-[hsl(var(--violet))/10] text-[hsl(var(--violet))]",
                s.color === "emerald" && "bg-[hsl(var(--emerald))/10] text-[hsl(var(--emerald))]",
              )}>
                {s.icon}
              </div>
              <p className="text-xs font-semibold text-foreground font-mono">{s.step}</p>
              <p className="text-xs text-muted-foreground leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
