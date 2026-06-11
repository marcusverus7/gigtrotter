import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Download } from "lucide-react";

export const metadata: Metadata = { title: "Import" };

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { IMPORT_SOURCES, type ImportSource } from "@/features/imports/sources";

/**
 * /app/import — concert-archive + ticketing imports.
 *
 * Each source becomes a card. State is one of:
 *   live  — fully wired
 *   soon  — UI + DB ready; API creds parked
 *   stub  — manual flow (file upload) for now
 *
 * Connecting writes an integrations row (or for stubs, an import_jobs row
 * we update as the user provides files). Either path ends in captures rows
 * feeding the same pipeline that powers the share-sheet route.
 */
export default async function ImportHubPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: integrations }, { data: jobs }] = await Promise.all([
    supabase.from("integrations").select("source").eq("user_id", user.id),
    supabase
      .from("import_jobs")
      .select("source, status, imported, found, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const connectedSet = new Set((integrations ?? []).map((i) => i.source));
  const recent = jobs ?? [];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Download className="h-4 w-4 text-primary" />
          Bring your past with you.
        </div>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Import</h1>
        <p className="text-sm text-muted-foreground">
          Pull your history in from setlist.fm, Songkick, Spotify, Last.fm,
          Eventbrite, your Wallet apps, or a one-shot Gmail sweep. Each
          source feeds the same parser the share sheet does — confirm cards
          land in <span className="font-medium">Capture</span>.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
        {IMPORT_SOURCES.map((s) => (
          <SourceCard
            key={s.id}
            source={s}
            connected={connectedSet.has(s.id)}
          />
        ))}
      </div>

      {recent.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent jobs</CardTitle>
            <CardDescription>What we&apos;ve pulled lately.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border text-sm">
              {recent.map((j, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between py-2"
                >
                  <span className="font-medium capitalize">
                    {String(j.source).replace("_", " ")}
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="font-mono text-xs text-muted-foreground tnum">
                      {j.imported}/{j.found}
                    </span>
                    <Badge
                      variant={
                        j.status === "done"
                          ? "verified"
                          : j.status === "failed"
                            ? "destructive"
                            : "outline"
                      }
                      className="text-[10px]"
                    >
                      {j.status}
                    </Badge>
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function SourceCard({
  source,
  connected,
}: {
  source: ImportSource;
  connected: boolean;
}) {
  const Icon = source.icon;
  return (
    <Card className="group h-full overflow-hidden transition-all hover:-translate-y-0.5 hover:border-primary/40">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="h-5 w-5" />
          </div>
          {connected ? (
            <Badge variant="verified" className="text-[10px]">
              Connected
            </Badge>
          ) : source.state === "live" ? (
            <Badge variant="inner" className="text-[10px]">
              Live
            </Badge>
          ) : source.state === "soon" ? (
            <Badge variant="outline" className="text-[10px]">
              Soon
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[10px]">
              Manual
            </Badge>
          )}
        </div>
        <CardTitle className="mt-2 text-base">{source.name}</CardTitle>
        <CardDescription className="text-xs">{source.blurb}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1 rounded-md border border-border bg-muted/20 p-3 text-xs">
          <p>
            <span className="text-muted-foreground">You get: </span>
            {source.yields}
          </p>
          <p>
            <span className="text-muted-foreground">Needs: </span>
            {source.needs}
          </p>
        </div>
        <Button
          size="sm"
          variant={source.state === "live" ? "default" : "outline"}
          disabled={source.state !== "live"}
          className="w-full"
        >
          {connected
            ? "Re-sync"
            : source.state === "live"
              ? "Connect"
              : source.state === "soon"
                ? "Coming soon"
                : "Upload manually"}
        </Button>
      </CardContent>
    </Card>
  );
}
