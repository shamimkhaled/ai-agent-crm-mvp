"use client";

import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const liveCalls = [
  { id: '1', name: 'Rahim Uddin', phone: '+8801700000000', dealerCode: '1212', intent: 'Order Tracking', duration: '02:14', status: 'In Progress' },
  { id: '2', name: 'Karim Rahman', phone: '+8801911111111', dealerCode: '3340', intent: 'Product Info', duration: '00:45', status: 'In Progress' },
  { id: '3', name: 'Unknown', phone: '+8801822222222', intent: 'Complaint', duration: '03:10', status: 'Escalated' },
];

export function LiveCallFeed() {
  return (
    <Card className="glass h-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Live AI Calls</CardTitle>
          <div className="flex space-x-2">
            <span className="flex h-3 w-3 mt-1.5">
              <span className="animate-ping absolute inline-flex h-3 w-3 rounded-full bg-teal-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-teal-500"></span>
            </span>
            <span className="text-sm text-muted-foreground mr-2">3 Active</span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {liveCalls.map((call, index) => (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              key={call.id}
              className="flex items-center justify-between p-3 rounded-xl bg-muted/30 border hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center space-x-4">
                <Avatar>
                  <AvatarFallback>{call.name.substring(0, 2)}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-medium leading-none">{call.name}</p>
                  <div className="flex items-center mt-1 space-x-2">
                    <p className="text-xs text-muted-foreground">{call.phone}</p>
                    {call.dealerCode && (
                      <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4">
                        D-{call.dealerCode}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
              <div className="text-right flex flex-col items-end">
                <Badge 
                  variant={call.status === 'Escalated' ? 'destructive' : 'default'}
                  className={call.status === 'In Progress' ? 'bg-primary text-primary-foreground hover:bg-primary/90' : ''}
                >
                  {call.intent}
                </Badge>
                <span className="text-xs text-muted-foreground mt-1 tabular-nums">
                  {call.duration}
                </span>
              </div>
            </motion.div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
