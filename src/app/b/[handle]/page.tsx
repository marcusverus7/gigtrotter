import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Eye, Globe } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { GigTrotterMark } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { AnonBoardMap } from "@/features/anon/anon-board-map";
import { createServiceClient } from "@/lib/supabase/server";
import { isMapboxConfigured } from "@/lib/env";

/**
 * /b/<handle> — the unauthenticated public anonymous board.
 *
 * Renders city-fuzzed pins from the `anon_board(handle)` SQL function. The
 * function is SECURITY DEFINER so we can read past+open experiences without
 * the viewer being logged in. Future events are excluded by the function
 * (and also by the experiences time-shift policy as a defence in depth).
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string }>;
}): Promise<Metadata> {
  const { handle } = await params;
  return {
    title: `Anonymous board · ${handle}`,
    description: "A life in pins — taste, not identity.",
    robots: { index: false, follow: false }, // anon boards don't get indexed
  };
}

export default async function AnonBoardPage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  // Use the service client so this route works for fully anonymous viewers.
  const supabase = createServiceClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("anon_handle, anon_revoked, anon_views")
    .eq("anon_handle", handle)
    .maybeSingle();

  if (!profile || profile.anon_revoked) notFound();

  const { data: pins } = await supabase.rpc("anon_board", { handle });

  // Bump view count — only on initial page load.
  await supabase.rpc("bump_anon_view", { handle });

  const kindCounts: Record<string, number> = {};
  for (const p of pins ?? []) {
    const k = (p as { kind: string }).kind;
    kindCounts[k] = (kindCounts[k] ?? 0) + 1;
  }

  return (
    <main className="bg-aurora min-h-screen">
      <header className="container flex items-center justify-between py-6">
        <Link href="/">
          <GigTrotterMark />
        </Link>
        <Button asChild variant="outline" size="sm">
          <Link href="/signup">Make your own</Link>
        </Button>
      </header>

      <div className="container space-y-6 pb-24">
        <div className="space-y-2 text-center">
          <Badge variant="open">Anonymous board</Badge>
          <h1 className="font-mono text-2xl tracking-tight">{handle}</h1>
          <p className="text-sm text-muted-foreground">
            Taste, not identity. City-level pins. Dates to month.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Pins" value={pins?.length ?? 0} />
          <Stat label="Gigs" value={kindCounts.ticket ?? 0} />
          <Stat label="Flights" value={kindCounts.flight ?? 0} />
          <Stat label="Stays" value={kindCounts.stay ?? 0} />
        </div>

        {isMapboxConfigured ? (
          <AnonBoardMap pins={pins ?? []} />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Map unavailable</CardTitle>
              <CardDescription>
                The host hasn&apos;t configured Mapbox yet.
              </CardDescription>
            </CardHeader>
          </Card>
        )}

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <Globe className="h-5 w-5 text-secondary" />
              <CardTitle className="text-base">
                What you&apos;re seeing
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              Every pin here is real — but blurred to the city centroid, with
              dates rounded to the month. No venue names, no exact addresses,
              no friend graph.
            </p>
            <p>
              GigTrotter calls this the anonymous identity layer — designed
              for dating profiles, bios, and forums. Make your own at{" "}
              <Link href="/" className="text-primary underline">
                gigtrotter
              </Link>
              .
            </p>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          <Eye className="mr-1 inline h-3 w-3" />
          {profile.anon_views} view{profile.anon_views === 1 ? "" : "s"}
        </p>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-card/60 p-4 text-center">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 font-mono text-3xl tnum">{value}</div>
    </div>
  );
}
