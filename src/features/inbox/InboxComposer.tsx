"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileText, Loader2, Send } from "lucide-react";

type Props = {
  disabled: boolean;
  onSend: (text: string, senderRole: "customer" | "agent") => Promise<{ ok: boolean; error?: string }>;
};

export function InboxComposer({ disabled, onSend }: Props) {
  const [text, setText] = useState("");
  const [role, setRole] = useState<"customer" | "agent">("customer");
  const [pending, setPending] = useState(false);

  const submit = async () => {
    const t = text.trim();
    if (!t || pending || disabled) return;
    setPending(true);
    const res = await onSend(t, role);
    setPending(false);
    if (res.ok) setText("");
  };

  return (
    <div className="p-4 border-t border-border bg-muted/20 space-y-2">
      <div className="flex flex-wrap gap-2 text-xs">
        <Button
          type="button"
          size="sm"
          variant={role === "customer" ? "default" : "outline"}
          onClick={() => setRole("customer")}
        >
          As customer
        </Button>
        <Button
          type="button"
          size="sm"
          variant={role === "agent" ? "default" : "outline"}
          onClick={() => setRole("agent")}
        >
          As agent
        </Button>
        <span className="text-muted-foreground self-center">
          {role === "customer" ? "Triggers Gemini on the server." : "Human reply only (no AI)."}
        </span>
      </div>
      <div className="flex gap-2 items-center">
        <Button variant="ghost" size="icon" type="button" className="text-muted-foreground shrink-0">
          <FileText className="w-5 h-5" />
        </Button>
        <Input
          className="flex-1 bg-background"
          placeholder={role === "customer" ? "Customer message…" : "Agent message…"}
          value={text}
          disabled={pending || disabled}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
          }}
        />
        <Button size="icon" type="button" disabled={pending || disabled} onClick={() => void submit()}>
          {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </Button>
      </div>
    </div>
  );
}
