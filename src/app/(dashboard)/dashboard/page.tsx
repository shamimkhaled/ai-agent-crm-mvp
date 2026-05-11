"use client";

import { useAuthStore } from "@/store/authStore";
import { MetricsCards } from "@/components/dashboard/MetricsCards";
import { LiveCallFeed } from "@/components/dashboard/LiveCallFeed";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts";
import { motion } from "framer-motion";

const data = [
  { name: "Mon", calls: 400, escalations: 24 },
  { name: "Tue", calls: 300, escalations: 18 },
  { name: "Wed", calls: 550, escalations: 30 },
  { name: "Thu", calls: 450, escalations: 20 },
  { name: "Fri", calls: 700, escalations: 45 },
  { name: "Sat", calls: 200, escalations: 10 },
  { name: "Sun", calls: 100, escalations: 5 },
];

export default function Dashboard() {
  const { user } = useAuthStore();

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
        >
          <h1 className="text-3xl font-bold tracking-tight">Overview</h1>
          <p className="text-muted-foreground">
            Welcome back{user ? `, ${user.name}` : ""}.
          </p>
        </motion.div>
      </div>

      <MetricsCards />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <motion.div 
          className="lg:col-span-2"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card className="glass h-full">
            <CardHeader>
              <CardTitle>AI Call Volume vs Escalations</CardTitle>
            </CardHeader>
            <CardContent className="h-[350px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip 
                    cursor={{ fill: 'rgba(255, 255, 255, 0.05)' }} 
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                  />
                  <Bar dataKey="calls" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="escalations" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div 
          className="lg:col-span-1"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <LiveCallFeed />
        </motion.div>
      </div>
    </div>
  );
}
