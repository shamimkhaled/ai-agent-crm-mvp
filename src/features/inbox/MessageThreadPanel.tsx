"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ConversationMessageRow } from "@/types/inbox";
import { motion } from "framer-motion";

type Props = {
  customerName: string;
  messages: ConversationMessageRow[];
  loading: boolean;
  lowConfidence: boolean;
  aiConfidence: number;
};

export function MessageThreadPanel({
  customerName,
  messages,
  loading,
  lowConfidence,
  aiConfidence,
}: Props) {
  return (
    <ScrollArea className="flex-1 min-h-0 p-4 bg-background/50">
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading thread…</p>
      ) : (
        <div className="flex flex-col gap-3 pr-2">
          {messages.map((m) => {
            const isAi = m.role === "ai";
            const isAgent = m.role === "agent";
            return (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex items-start gap-2 ${isAi || isAgent ? "justify-end" : ""}`}
              >
                {!isAi && !isAgent && (
                  <Avatar className="w-8 h-8 mt-1 shrink-0">
                    <AvatarFallback>{customerName.substring(0, 2)}</AvatarFallback>
                  </Avatar>
                )}
                <div
                  className={
                    isAi
                      ? "bg-primary/15 border border-primary/25 p-3 rounded-2xl rounded-tr-none max-w-[78%] text-sm leading-relaxed"
                      : isAgent
                        ? "bg-teal-500/10 border border-teal-500/25 p-3 rounded-2xl rounded-tr-none max-w-[78%] text-sm leading-relaxed"
                        : "bg-muted p-3 rounded-2xl rounded-tl-none max-w-[78%] text-sm leading-relaxed"
                  }
                >
                  {isAgent && (
                    <p className="text-[10px] uppercase tracking-wide text-teal-600 dark:text-teal-400 mb-1">
                      Human agent
                    </p>
                  )}
                  {isAi && (
                    <p className="text-[10px] uppercase tracking-wide text-primary mb-1">AI</p>
                  )}
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                </div>
                {(isAi || isAgent) && (
                  <Avatar className="w-8 h-8 mt-1 shrink-0">
                    <AvatarFallback className={isAi ? "bg-primary text-primary-foreground" : ""}>
                      {isAi ? "AI" : "A"}
                    </AvatarFallback>
                  </Avatar>
                )}
              </motion.div>
            );
          })}
        </div>
      )}
      {lowConfidence && (
        <div className="mx-auto my-4 text-center">
          <span className="text-xs text-muted-foreground bg-destructive/10 text-destructive px-3 py-1 rounded-full border border-destructive/20">
            AI confidence {aiConfidence}% — human review recommended
          </span>
        </div>
      )}
    </ScrollArea>
  );
}
