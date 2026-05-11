"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Database, Plug, Key, SearchCode, RefreshCcw, Save } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRouter } from "next/navigation";

export default function ConnectorSetupPage() {
  const router = useRouter();

  return (
    <div className="space-y-6 pb-12 max-w-5xl mx-auto">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.push('/connectors')} className="text-muted-foreground hover:text-foreground">
          ← Back to Connectors
        </Button>
      </div>
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Odoo ERP Configuration</h1>
        <p className="text-muted-foreground mt-1">
          Map custom fields and establish secure Supabase data syncing rules.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <Card className="glass">
             <CardHeader>
                <CardTitle className="flex items-center gap-2"><Plug className="w-5 h-5"/> Connection String</CardTitle>
             </CardHeader>
             <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                   <div className="space-y-2">
                     <Label>Base Subdomain URL</Label>
                     <Input placeholder="company.odoo.com" defaultValue="garments-bd.odoo.com" />
                   </div>
                   <div className="space-y-2">
                     <Label>Database Name</Label>
                     <Input placeholder="Production DB" defaultValue="odoo_prod" />
                   </div>
                </div>
                <div className="space-y-2">
                   <Label>Access Token (XML-RPC Key)</Label>
                   <Input type="password" defaultValue="abcdef123456789" />
                </div>
             </CardContent>
             <CardFooter>
                <Button className="w-full sm:w-auto"><RefreshCcw className="w-4 h-4 mr-2"/> Test Active Connection</Button>
             </CardFooter>
          </Card>

          <Card className="glass border-primary/20">
             <CardHeader>
                <CardTitle className="flex items-center gap-2"><SearchCode className="w-5 h-5"/> Custom Schema Mapping</CardTitle>
                <CardDescription>Map your external fields so AI can index Context vectors properly.</CardDescription>
             </CardHeader>
             <CardContent className="space-y-4">
                <div className="border rounded-md p-4 bg-muted/20 space-y-4">
                   <div className="flex items-center justify-between text-sm">
                      <span className="font-semibold">Map: "Customer Orders"</span>
                      <Badge variant="outline">Sync Every 1H</Badge>
                   </div>
                   <div className="grid grid-cols-5 gap-4 items-center">
                     <div className="col-span-2">
                        <Label className="text-xs text-muted-foreground">Original ERP Field</Label>
                        <div className="flex items-center mt-1 p-2 bg-muted rounded font-mono text-xs">res.partner.display_name</div>
                     </div>
                     <div className="col-span-1 flex justify-center mt-4">
                        <ArrowRight className="w-4 h-4 text-muted-foreground" />
                     </div>
                     <div className="col-span-2 space-y-1">
                        <Label className="text-xs text-muted-foreground">Supabase AI Schema</Label>
                        <Select defaultValue="name">
                           <SelectTrigger><SelectValue placeholder="Target" /></SelectTrigger>
                           <SelectContent>
                              <SelectItem value="name">customer_name</SelectItem>
                              <SelectItem value="code">dealer_code</SelectItem>
                           </SelectContent>
                        </Select>
                     </div>
                   </div>

                   <div className="grid grid-cols-5 gap-4 items-center">
                     <div className="col-span-2">
                        <div className="flex items-center mt-1 p-2 bg-muted rounded font-mono text-xs">sale.order.price_total</div>
                     </div>
                     <div className="col-span-1 flex justify-center mt-4">
                        <ArrowRight className="w-4 h-4 text-muted-foreground" />
                     </div>
                     <div className="col-span-2 space-y-1">
                        <Select defaultValue="order">
                           <SelectTrigger><SelectValue placeholder="Target" /></SelectTrigger>
                           <SelectContent>
                              <SelectItem value="name">customer_name</SelectItem>
                              <SelectItem value="order">order_value_bdt</SelectItem>
                           </SelectContent>
                        </Select>
                     </div>
                   </div>
                </div>
                <Button variant="outline" size="sm" className="w-full border-dashed">+ Add Binding Rule</Button>
             </CardContent>
             <CardFooter>
                <Button variant="default"><Save className="w-4 h-4 mr-2"/> Apply Mapping</Button>
             </CardFooter>
          </Card>
        </div>

        <div className="md:col-span-1">
          <Card className="glass h-full">
            <CardHeader>
               <CardTitle className="text-sm">Live Sync Logs</CardTitle>
               <CardDescription className="text-xs">Monitored by Supabase Hooks</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 font-mono text-[10px] text-muted-foreground">
               <div className="flex flex-col gap-1 border-b border-border/50 pb-2">
                  <span className="text-primary font-bold">SUCCESS (200)</span>
                  <span>[01:45 PM] Fetched 12 modified partner objects. Vectorized mapped keys via trigger.</span>
               </div>
               <div className="flex flex-col gap-1 border-b border-border/50 pb-2">
                  <span className="text-primary font-bold">SUCCESS (200)</span>
                  <span>[01:00 PM] Background cron job initiated.</span>
               </div>
               <div className="flex flex-col gap-1 pb-2">
                  <span className="text-destructive font-bold">WARN (429)</span>
                  <span>[12:45 PM] Odoo limits reached. Retrying payload in 300s.</span>
               </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
