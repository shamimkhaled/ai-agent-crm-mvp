"use client";

import { useEffect, useRef } from "react";
import { useCallStore } from "@/store/callStore";
import { Card, CardContent } from "@/components/ui/card";
import { motion, AnimatePresence } from "framer-motion";

export function TranscriptStream() {
  const { transcript, isSimulating } = useCallStore();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcript]);

  if (!isSimulating && transcript.length === 0) {
    return (
      <Card className="glass h-[500px] flex items-center justify-center">
         <p className="text-muted-foreground">Waiting for incoming call...</p>
      </Card>
    );
  }

  return (
    <Card className="glass h-[500px] overflow-hidden flex flex-col">
      <div className="bg-muted/30 border-b p-3">
        <h3 className="font-medium text-sm">Live Transcript</h3>
      </div>
      <CardContent className="flex-1 overflow-y-auto p-4" ref={scrollRef}>
        <div className="space-y-4">
          <AnimatePresence>
            {transcript.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex flex-col ${
                  msg.speaker === 'AI' ? 'items-start' : 'items-end'
                }`}
              >
                <span className="text-[10px] text-muted-foreground mb-1 ml-1">
                  {msg.speaker}
                </span>
                <div
                  className={`px-4 py-2 rounded-2xl max-w-[80%] ${
                    msg.speaker === 'AI'
                      ? 'bg-primary/20 text-foreground rounded-tl-sm border border-primary/30'
                      : 'bg-muted text-foreground rounded-tr-sm'
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          {isSimulating && transcript.length > 0 && transcript[transcript.length - 1].speaker === 'Caller' && (
             <div className="flex items-start">
               <span className="text-[10px] text-muted-foreground mb-1 mr-2 self-center">AI</span>
               <div className="px-4 py-3 rounded-2xl bg-primary/10 border border-primary/20 rounded-tl-sm flex space-x-1">
                 <motion.div className="w-1.5 h-1.5 bg-primary rounded-full" animate={{ y: [0, -3, 0] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0 }} />
                 <motion.div className="w-1.5 h-1.5 bg-primary rounded-full" animate={{ y: [0, -3, 0] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0.2 }} />
                 <motion.div className="w-1.5 h-1.5 bg-primary rounded-full" animate={{ y: [0, -3, 0] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0.4 }} />
               </div>
             </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
