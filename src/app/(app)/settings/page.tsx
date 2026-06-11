import { redirect } from "next/navigation";

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
import { createClient } from "@/lib/supabase/server";
import {
  exportMyData,
  deleteMyAccount,
} from "@/features/auth/actions";
import {
  regenerateAnonHandle,
  toggleAnonRevoked,
} from "@/features/profile/actions";
import { publicEnv } from "@/lib/env";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/login");

  const anonUrl = `${publicEnv.siteUrl}/b/${profile.anon_handle}`;

  async function downloadExport() {
    "use server";
    // Phase 8 will email the archive; for now we just touch the DB.
    await exportMyData();
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Identity, privacy, and your data.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>How friends find you.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Row label="Username" value={`@${profile.username}`} />
          <Row label="Display name" value={profile.display_name ?? "—"} />
          <Row label="Email" value={user.email ?? "—"} />
          <Row label="Plan" value={profile.plan === "plus" ? "GigTrotter+" : "Free"} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle>Anonymous board</CardTitle>
              <CardDescription>
                Your taste, not your identity. City-fuzzed pins, revocable in
                one tap.
              </CardDescription>
            </div>
            <Badge variant={profile.anon_revoked ? "outline" : "open"}>
              {profile.anon_revoked ? "Revoked" : "Live"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <Row
            label="Handle"
            value={
              <code className="font-mono text-sm">{profile.anon_handle}</code>
            }
          />
          <Row
            label="Public URL"
            value={
              <a
                href={anonUrl}
                className="text-primary hover:underline"
                target="_blank"
                rel="noreferrer"
              >
                {anonUrl}
              </a>
            }
          />
          <Row label="Views" value={String(profile.anon_views)} />
          <Separator />
          <div className="flex flex-wrap gap-2">
            <form action={regenerateAnonHandle}>
              <Button type="submit" variant="outline" size="sm">
                Regenerate handle
              </Button>
            </form>
            <form action={toggleAnonRevoked}>
              <Button
                type="submit"
                variant={profile.anon_revoked ? "default" : "destructive"}
                size="sm"
              >
                {profile.anon_revoked ? "Re-activate board" : "Revoke board"}
              </Button>
            </form>
          </div>
          <p className="text-xs text-muted-foreground">
            Regenerating creates a new hash — old links break instantly.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your data</CardTitle>
          <CardDescription>
            GDPR — export everything you&apos;ve put in, or delete it.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <form action={downloadExport}>
            <Button type="submit" variant="outline" size="sm">
              Export data (JSON)
            </Button>
          </form>
          <form action={deleteMyAccount}>
            <Button type="submit" variant="destructive" size="sm">
              Delete account
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}
