"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, LogOut, Save } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuthStore } from "@/store/authStore";
import { mapSupabaseUser } from "@/lib/auth/mapSupabaseUser";

export default function ProfilePage() {
  const router = useRouter();
  const { toast } = useToast();
  const setAuthUser = useAuthStore((s) => s.setUser);
  const authUser = useAuthStore((s) => s.user);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userMetadata, setUserMetadata] = useState<Record<string, unknown>>({});
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");

  useEffect(() => {
    async function loadUser() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        setEmail(user.email || "");
        setFullName((user.user_metadata?.full_name as string) || "");
        setUserMetadata(user.user_metadata || {});
        setAuthUser(mapSupabaseUser(user));
      }
      setLoading(false);
    }
    void loadUser();
  }, [setAuthUser]);

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const supabase = createClient();

    const { error } = await supabase.auth.updateUser({
      data: { full_name: fullName },
    });

    if (error) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } else {
      toast({ title: "Profile updated", description: "Your details have been saved." });
      const {
        data: { user: u },
      } = await supabase.auth.getUser();
      if (u) {
        setAuthUser(mapSupabaseUser(u));
        setUserMetadata(u.user_metadata || {});
      }
    }
    setSaving(false);
  };

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    useAuthStore.getState().logout();
    router.push("/auth/login");
    router.refresh();
  };

  const displayName = fullName.trim() || email.split("@")[0] || "Account";
  const avatarUrl =
    typeof userMetadata.avatar_url === "string" ? userMetadata.avatar_url : undefined;

  if (loading) {
    return (
      <div className="flex h-[calc(100vh-6rem)] items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-12">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Profile</h1>
          <p className="text-muted-foreground mt-1">
            Signed-in Supabase account. Update your display name; email is managed by your auth
            provider.
          </p>
        </div>
        <Button variant="destructive" onClick={handleLogout} className="shrink-0">
          <LogOut className="w-4 h-4 mr-2" /> Log out
        </Button>
      </div>

      <Card className="glass">
        <CardHeader className="flex flex-row items-center gap-4">
          <Avatar className="w-16 h-16 border-2 border-primary/20">
            {avatarUrl ? <AvatarImage src={avatarUrl} alt="" /> : null}
            <AvatarFallback className="text-xl bg-primary/10 text-primary">
              {displayName.substring(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div>
            <CardTitle>{displayName}</CardTitle>
            <CardDescription className="text-muted-foreground">
              {[email, authUser?.role].filter(Boolean).join(" · ")}
            </CardDescription>
          </div>
        </CardHeader>
        <form onSubmit={handleUpdate}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input disabled value={email} className="bg-muted text-muted-foreground" />
              <p className="text-[10px] text-muted-foreground">Change email in Supabase Auth / your IdP.</p>
            </div>
            <div className="space-y-2">
              <Label>Full name</Label>
              <Input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Your name"
              />
            </div>
          </CardContent>
          <CardFooter>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
              Save changes
            </Button>
          </CardFooter>
        </form>
      </Card>

      <Card className="glass border-destructive/20 relative overflow-hidden">
        <div className="absolute inset-0 bg-destructive/5" />
        <CardHeader className="relative">
          <CardTitle className="text-destructive">Danger zone</CardTitle>
          <CardDescription>Irreversible actions.</CardDescription>
        </CardHeader>
        <CardContent className="relative">
          <Button variant="destructive" className="w-full sm:w-auto" type="button">
            Request account deletion
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
