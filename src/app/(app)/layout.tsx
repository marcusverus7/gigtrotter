import { redirect } from "next/navigation";
import Link from "next/link";
import {
  Compass,
  Eye,
  Globe2,
  Settings,
  Ticket,
  Upload,
} from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { GigTrotterMark } from "@/components/brand";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { signOut } from "@/features/auth/actions";

const nav = [
  { href: "/app", label: "Wallet", icon: Ticket },
  { href: "/app/map", label: "Map", icon: Globe2 },
  { href: "/app/capture", label: "Capture", icon: Upload },
  { href: "/app/anon", label: "Anon board", icon: Eye },
  { href: "/app/discover", label: "Discover", icon: Compass },
  { href: "/app/settings", label: "Settings", icon: Settings },
];

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!isSupabaseConfigured) {
    // Without Supabase, the auth gate can't run — surface the same notice the
    // login page shows, no infinite redirect.
    return (
      <main className="container py-16">
        <div className="mx-auto max-w-md space-y-3 rounded-lg border border-border bg-card p-6">
          <h1 className="text-lg font-semibold">Configure Supabase</h1>
          <p className="text-sm text-muted-foreground">
            The app requires Supabase. Add your project keys to{" "}
            <code className="font-mono">.env.local</code> and reload.
          </p>
          <Button asChild>
            <Link href="/">← back to landing</Link>
          </Button>
        </div>
      </main>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("username, display_name, avatar_url, anon_handle")
    .eq("id", user.id)
    .single();

  const initials =
    (profile?.display_name ?? profile?.username ?? user.email ?? "?")
      .slice(0, 2)
      .toUpperCase();

  return (
    <div className="relative flex min-h-screen flex-col bg-background md:flex-row">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-[-10%] top-[-10%] h-[60vh] w-[60vh] rounded-full bg-primary/10 blur-[120px]" />
        <div className="absolute right-[-10%] bottom-[20%] h-[50vh] w-[50vh] rounded-full bg-secondary/8 blur-[120px]" />
      </div>
      {/* Sidebar — md+ */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-border/40 bg-card/30 p-4 backdrop-blur-xl md:flex">
        <Link href="/app" className="px-2">
          <GigTrotterMark />
        </Link>
        <nav className="mt-8 flex flex-col gap-0.5">
          {nav.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="group flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-all hover:bg-primary/10 hover:text-foreground"
            >
              <n.icon className="h-4 w-4 transition-colors group-hover:text-primary" />
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto space-y-3">
          <Separator />
          <div className="flex items-center gap-3 px-2">
            <Avatar className="h-9 w-9">
              <AvatarImage src={profile?.avatar_url ?? undefined} alt="" />
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                {profile?.display_name ?? profile?.username}
              </p>
              <p className="truncate font-mono text-xs text-muted-foreground">
                {profile?.anon_handle}
              </p>
            </div>
          </div>
          <form action={signOut}>
            <Button variant="ghost" size="sm" className="w-full justify-start">
              Sign out
            </Button>
          </form>
        </div>
      </aside>

      <div className="flex flex-1 flex-col overflow-x-hidden">
        {/* Top bar — mobile only */}
        <header className="flex items-center justify-between border-b border-border/40 bg-card/30 p-4 backdrop-blur-xl md:hidden">
          <Link href="/app">
            <GigTrotterMark />
          </Link>
          <Avatar className="h-8 w-8">
            <AvatarImage src={profile?.avatar_url ?? undefined} alt="" />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8 md:py-12">{children}</main>

        {/* Bottom tab bar — mobile only */}
        <nav className="sticky bottom-0 z-40 flex justify-around border-t border-border/40 bg-card/80 p-2 backdrop-blur-xl md:hidden">
          {nav.slice(0, 5).map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="flex flex-1 flex-col items-center gap-0.5 rounded-md p-2 text-xs text-muted-foreground transition-colors hover:text-primary"
            >
              <n.icon className="h-5 w-5" />
              {n.label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
