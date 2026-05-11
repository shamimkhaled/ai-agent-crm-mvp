"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Search, MapPin, Phone, Building2, TrendingUp, MoreHorizontal } from "lucide-react";

const initialDealers = [
  { id: "1212", name: "Rahim Traders", location: "Dhaka", type: "Distributor", status: "active", revenue: "৳2.4M", phone: "+8801700112233" },
  { id: "3340", name: "Bismillah Garments", location: "Chittagong", type: "Retailer", status: "active", revenue: "৳850K", phone: "+8801811223344" },
  { id: "8891", name: "Hasib & Sons", location: "Sylhet", type: "Wholesaler", status: "inactive", revenue: "৳120K", phone: "+8801922334455" },
  { id: "4455", name: "New Market Clothings", location: "Dhaka", type: "Retailer", status: "warning", revenue: "৳450K", phone: "+8801733445566" },
];

export default function DealersPage() {
  const [dealers, setDealers] = useState(initialDealers);
  const [search, setSearch] = useState("");

  const filtered = dealers.filter(d => 
    d.name.toLowerCase().includes(search.toLowerCase()) || 
    d.id.includes(search) ||
    d.location.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6 pb-12">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dealers & Retailers</h1>
          <p className="text-muted-foreground mt-1">
            Manage your synchronized B2B network data accessible by the AI Agents.
          </p>
        </div>
        <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
          <Building2 className="w-4 h-4 mr-2" /> Add Dealer
        </Button>
      </div>

      <Card className="glass">
         <CardHeader className="flex flex-row items-center justify-between p-4 border-b border-border/50">
           <div className="flex items-center space-x-2">
             <div className="relative">
               <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
               <Input 
                 placeholder="Search PO/Dealer Code..." 
                 className="pl-9 w-[300px] bg-background/50" 
                 value={search}
                 onChange={e => setSearch(e.target.value)}
               />
             </div>
           </div>
           <Button variant="outline" size="sm">Export CSV</Button>
         </CardHeader>
         <CardContent className="p-0">
           <Table>
              <TableHeader className="bg-muted/30">
                <TableRow>
                   <TableHead>Code</TableHead>
                   <TableHead>Entity Name</TableHead>
                   <TableHead>Location</TableHead>
                   <TableHead>Category</TableHead>
                   <TableHead>Q3 Revenue</TableHead>
                   <TableHead>Status</TableHead>
                   <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                 {filtered.map(dealer => (
                    <TableRow key={dealer.id}>
                       <TableCell className="font-mono text-xs">{dealer.id}</TableCell>
                       <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                             {dealer.name}
                          </div>
                          <span className="text-xs text-muted-foreground flex gap-1 items-center mt-1"><Phone className="w-3 h-3"/> {dealer.phone}</span>
                       </TableCell>
                       <TableCell>
                          <span className="flex gap-1 items-center text-sm text-muted-foreground"><MapPin className="w-3 h-3"/> {dealer.location}</span>
                       </TableCell>
                       <TableCell>{dealer.type}</TableCell>
                       <TableCell>
                          <span className="flex gap-1 items-center text-sm font-medium"><TrendingUp className="w-3 h-3 text-primary"/>{dealer.revenue}</span>
                       </TableCell>
                       <TableCell>
                          <Badge variant={dealer.status === 'active' ? 'default' : dealer.status === 'warning' ? 'secondary' : 'outline'} className={dealer.status === 'active' ? 'bg-primary hover:bg-primary/80' : ''}>
                             {dealer.status}
                          </Badge>
                       </TableCell>
                       <TableCell>
                          <Button variant="ghost" size="icon"><MoreHorizontal className="w-4 h-4"/></Button>
                       </TableCell>
                    </TableRow>
                 ))}
                 {filtered.length === 0 && (
                    <TableRow>
                       <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                          No dealers match your search query.
                       </TableCell>
                    </TableRow>
                 )}
              </TableBody>
           </Table>
         </CardContent>
      </Card>
    </div>
  );
}
