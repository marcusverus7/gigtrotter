import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink, Eye, RefreshCw, ShieldOff } from "lucide-react";

export const metadata: Metadata = { title: "Anon board" };

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import {
  regenerateAnonHandle,
  toggleAnonRevoked,
} from "@/features/profile/actions";
import { publicEnv } from "@/lib/env";
import { LifetimeStats } from "@/features/stats/lifetime-stats";

export default async function AnonBoardSettingsPage() {
  const supabase = await createClient();
  const user = await getSessionUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("anon_handle, anon_revoked, anon_views")
    .eq("id", user.id)
    .single();

  // Count how many experiences would be visible on the anon board.
  const { count: openCount } = await supabase
    .from("experiences")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("audience", "open")
    .lt("ends_at", new Date().toISOString());

  if (!profile) return null;
  const url = `${publicEnv.siteUrl}/b/${profile.anon_handle}`;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Anonymous board</h1>
        <p className="text-sm text-muted-foreground">
          Your taste, not your identity. City-fuzzed pins. Dates to month. One
          tap to revoke.
        </p>
      </header>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle>Your public board</CardTitle>
              <CardDescription>
                Share the link on dating profiles, bios, anywhere.
              </CardDescription>
            </div>
            <Badge variant={profile.anon_revoked ? "outline" : "open"}>
              {profile.anon_revoked ? "Revoked" : "Live"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <code className="block break-all rounded-md border border-border bg-muted px-3 py-2 font-mono text-sm">
            {url}
          </code>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={`/b/${profile.anon_handle}`} target="_blank">
                <ExternalLink /> Open public view
              </Link>
            </Button>
            <form action={regenerateAnonHandle}>
              <Button type="submit" variant="outline" size="sm">
                <RefreshCw /> Regenerate
              </Button>
            </form>
            <form action={toggleAnonRevoked}>
              <Button
                type="submit"
                variant={profile.anon_revoked ? "default" : "destructive"}
                size="sm"
              >
                <ShieldOff /> {profile.anon_revoked ? "Re-activate" : "Revoke"}
              </Button>
            </form>
          </div>
          <Separator />
          <div className="grid grid-cols-2 gap-4">
            <Stat
              label="Views"
              value={profile.anon_views}
              icon={Eye}
            />
            <Stat label="Public pins" value={openCount ?? 0} icon={Eye} />
          </div>
        </CardContent>
      </Card>

      <LifetimeStats userId={user.id} />
    </div>
  );
}

function Stat({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="mt-1 font-mono text-3xl tnum">{value}</div>
    </div>
  );
}
