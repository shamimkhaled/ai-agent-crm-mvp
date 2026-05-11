"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Fingerprint } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"login" | "signup" | "forgot">("login");

  const supabase = createClient();

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        toast({ variant: "destructive", title: "Login Failed", description: error.message });
      } else {
        toast({ title: "Welcome back!", description: "Initializing workspace..." });
        window.location.href = "/dashboard";
      }
    } else if (mode === "signup") {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: email.split("@")[0] || "User",
            role: "Admin",
          },
        },
      });
      if (error) {
        toast({ variant: "destructive", title: "Signup Failed", description: error.message });
      } else {
        toast({ title: "Account Created!", description: "You can now sign in with these credentials." });
        setMode("login");
      }
    } else {
      const { error } = await supabase.auth.resetPasswordForEmail(email);
      if (error) {
         toast({ variant: "destructive", title: "Error", description: error.message });
      } else {
         toast({ title: "Email Sent", description: "Check your inbox for the password reset link." });
         setMode("login");
      }
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-muted/20">
      <div className="absolute inset-0 bg-grid-white/[0.02] bg-[size:60px_60px]" />
      
      <Card className="w-full max-w-md glass relative z-10 border-primary/20 shadow-2xl shadow-primary/10">
        <CardHeader className="space-y-3 text-center pb-8">
           <div className="mx-auto bg-primary/10 p-3 rounded-full w-fit">
              <Fingerprint className="w-8 h-8 text-primary" />
           </div>
           <CardTitle className="text-2xl font-bold tracking-tight">AI CRM Workspace</CardTitle>
           <CardDescription>
              {mode === "login" 
                 ? "Sign in to access your AI voice agents."
                 : mode === "signup" 
                 ? "Create your first admin account to get started."
                 : "Enter your email to receive a password reset link."}
           </CardDescription>
        </CardHeader>
        
        <form onSubmit={handleAuth}>
          <CardContent className="space-y-4">
             <div className="space-y-2">
               <Label htmlFor="email">Work Email</Label>
               <Input 
                  id="email" 
                  type="email" 
                  placeholder="admin@company.com" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required 
                />
             </div>
             
             {mode !== "forgot" && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Password</Label>
                    {mode === "login" && (
                      <button 
                         type="button"
                         onClick={() => setMode("forgot")}
                         className="text-xs text-primary hover:underline"
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <Input 
                     id="password" 
                     type="password" 
                     placeholder="••••••••" 
                     value={password}
                     onChange={(e) => setPassword(e.target.value)}
                     required 
                   />
                </div>
             )}
          </CardContent>
          
          <CardFooter className="flex flex-col gap-4 mt-2">
             <Button type="submit" className="w-full font-medium" disabled={loading}>
               {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
               {mode === "login" ? "Sign In" : mode === "signup" ? "Create Account" : "Send Reset Link"}
             </Button>
             
             <div className="text-sm text-muted-foreground">
                {mode === "login" ? (
                  <>
                    Don't have an account?{" "}
                    <button type="button" onClick={() => setMode("signup")} className="text-primary hover:underline">
                      Sign Up
                    </button>
                  </>
                ) : (
                  <button type="button" onClick={() => setMode("login")} className="text-primary hover:underline">
                    Back to Login
                  </button>
                )}
             </div>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
