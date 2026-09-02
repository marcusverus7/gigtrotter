import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Sparkles } from "lucide-react";

export const metadata: Metadata = { title: "Memories" };

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createClient, getSessionUser } from "@/lib/supabase/server";

/**
 * /app/memories — the long-arc surface.
 *
 * Lists every year the user has pins in. Each becomes a year-in-review
 * entrance. "On this day" rolls up here too so the user always has
 * somewhere to wander when they don't have an active item.
 */
export default async function MemoriesPage() {
  const supabase = await createClient();
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const { data: rows } = await supabase
    .from("experiences")
    .select("starts_at, kind")
    .eq("user_id", user.id)
    .order("starts_at", { ascending: false });

  // Bucket by year.
  const byYear = new Map<
    number,
    { count: number; gigs: number; flights: number; stays: number }
  >();
  for (const r of (rows ?? []) as Array<{ starts_at: string; kind: string }>) {
    const y = new Date(r.starts_at).getFullYear();
    const cur =
      byYear.get(y) ?? { count: 0, gigs: 0, flights: 0, stays: 0 };
    cur.count += 1;
    if (r.kind === "ticket") cur.gigs += 1;
    if (r.kind === "flight") cur.flights += 1;
    if (r.kind === "stay") cur.stays += 1;
    byYear.set(y, cur);
  }
  const years = Array.from(byYear.entries()).sort((a, b) => b[0] - a[0]);
  const currentYear = new Date().getFullYear();

  const { data: onThisDay } = await supabase.rpc("on_this_day", {
    target_user: user.id,
  });
  // `id` is the experience id; the wallet item it points at is a separate
  // column, and that is what /app/item/<id> resolves.
  const todayList = ((onThisDay ?? []) as Array<{
    id: string;
    wallet_item_id: string | null;
    title: string;
    starts_at: string;
  }>).filter(
    (m): m is typeof m & { wallet_item_id: string } => m.wallet_item_id !== null,
  );

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header>
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">
          The compounding asset
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Memories</h1>
        <p className="text-sm text-muted-foreground">
          Your life, organised by year. Every year with pins gets a
          year-in-review.
        </p>
      </header>

      {todayList.length > 0 ? (
        <Card className="border-secondary/30 bg-secondary/5">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-secondary" />
              <CardTitle className="text-base">On this day</CardTitle>
            </div>
            <CardDescription>{todayList.length} memories.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1">
              {todayList.slice(0, 6).map((m) => {
                const y = new Date(m.starts_at).getFullYear();
                return (
                  <li key={m.id}>
                    <Link
                      href={`/app/item/${m.wallet_item_id}`}
                      className="group flex items-center justify-between gap-3 rounded-md p-2 transition-colors hover:bg-accent/30"
                    >
                      <span className="truncate text-sm font-medium">
                        {m.title}
                      </span>
                      <span className="font-mono text-xs text-muted-foreground tnum">
                        {y}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          By year
        </h2>
        {years.length === 0 ? (
          <Card className="border-dashed">
            <CardHeader>
              <CardTitle className="text-base">No memories yet</CardTitle>
              <CardDescription>
                Your years populate as you confirm pins. Run the camera-roll
                backfill scan to seed many at once.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild>
                <Link href="/app/capture/backfill">Backfill scan</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {years.map(([year, info]) => (
              <Link key={year} href={`/app/review/${year}`}>
                <Card className="group h-full overflow-hidden transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-[0_20px_60px_-15px_rgba(124,58,237,0.35)]">
                  <CardHeader className="bg-gradient-to-br from-primary/10 via-card to-secondary/5 pb-3">
                    <div className="flex items-center justify-between">
                      <div className="font-mono text-4xl font-bold tracking-tighter tnum">
                        {year}
                      </div>
                      {year === currentYear ? (
                        <Badge variant="inner" className="text-[10px]">
                          In progress
                        </Badge>
                      ) : null}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2 pt-4">
                    <div className="flex gap-4 font-mono text-xs">
                      <div>
                        <div className="text-muted-foreground">Pins</div>
                        <div className="text-base font-bold tnum text-foreground">
                          {info.count}
                        </div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Gigs</div>
                        <div className="text-base font-bold tnum text-foreground">
                          {info.gigs}
                        </div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Flights</div>
                        <div className="text-base font-bold tnum text-foreground">
                          {info.flights}
                        </div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Stays</div>
                        <div className="text-base font-bold tnum text-foreground">
                          {info.stays}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 pt-2 text-xs text-primary opacity-0 transition-opacity group-hover:opacity-100">
                      Open the reel <ArrowRight className="h-3 w-3" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
