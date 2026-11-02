import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Globe2, Music } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GigTrotterMark } from "@/components/brand";
import { stripLikeWildcards } from "@/lib/supabase/filters";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { EventCard, type EventSummary } from "@/features/events/event-card";

export const metadata: Metadata = { title: "Upcoming gigs" };

const PAGE_SIZE = 30;

const EVENT_COLS =
  "id, title, headliner, artist_names, category, venue_name, venue_city, venue_country, starts_at, image_url, min_price_cents, currency, is_sold_out, tags";

/**
 * Public, signed-out browse. Approved events only (RLS), no interest counts,
 * no friends. The cards link to the public event page; sign-in happens
 * there, carrying the event along.
 */
export default async function PublicEventsPage({
  searchParams,
}: {
  searchParams: Promise<{ city?: string }>;
}) {
  const user = await getSessionUser();
  const { city } = await searchParams;
  if (user) redirect(city ? `/app/events?city=${encodeURIComponent(city)}` : "/app/events");

  const supabase = await createClient();
  const nowIso = new Date().toISOString();
  const cityFilter = city ? stripLikeWildcards(city) : "";

  let upcomingQuery = supabase
    .from("events")
    .select(EVENT_COLS)
    .gte("starts_at", nowIso)
    .order("starts_at", { ascending: true })
    .limit(PAGE_SIZE);
  let countQuery = supabase.from("events").select("id", { count: "exact", head: true }).gte("starts_at", nowIso);
  if (cityFilter) {
    upcomingQuery = upcomingQuery.ilike("venue_city", cityFilter);
    countQuery = countQuery.ilike("venue_city", cityFilter);
  }

  const [{ data: upcoming }, { count }, { data: cityRows }] = await Promise.all([
    upcomingQuery,
    countQuery,
    supabase
      .from("events")
      .select("venue_city")
      .gte("starts_at", nowIso)
      .not("venue_city", "is", null)
      .order("starts_at", { ascending: true })
      .limit(1000),
  ]);
  const cityCounts = new Map<string, number>();
  for (const r of cityRows ?? []) {
    if (!r.venue_city) continue;
    cityCounts.set(r.venue_city, (cityCounts.get(r.venue_city) ?? 0) + 1);
  }
  const cities = [...cityCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 12)
    .map(([name]) => name);
  const events = (upcoming ?? []) as EventSummary[];

  return (
    <main className="relative min-h-screen bg-background text-foreground">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Link href="/">
          <GigTrotterMark />
        </Link>
        <nav className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href="/login?next=%2Fapp%2Fevents">Sign in</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/signup">Get started</Link>
          </Button>
        </nav>
      </header>

      <div className="mx-auto max-w-6xl space-y-6 px-6 pb-20">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Globe2 className="h-4 w-4 text-primary" />
            Upcoming gigs
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">
            {cityFilter ? `What's on in ${cityFilter}` : "What's on"}
          </h1>
          <p className="text-sm text-muted-foreground">
            <Badge variant="outline" className="mr-2 font-mono tnum">
              {count ?? events.length}
            </Badge>
            upcoming {count === 1 ? "event" : "events"}
            {cityFilter ? " in this city" : " across every listed city"}. Sign in to save one, see who&apos;s
            going and keep your tickets together.
          </p>
        </div>

        {cities.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" variant={cityFilter ? "outline" : "secondary"}>
              <Link href="/events">Everywhere</Link>
            </Button>
            {cities.map((c) => (
              <Button key={c} asChild size="sm" variant={cityFilter === c ? "secondary" : "outline"}>
                <Link href={`/events?city=${encodeURIComponent(c)}`}>{c}</Link>
              </Button>
            ))}
          </div>
        ) : null}

        {events.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-10 text-center">
            <Music className="mx-auto h-8 w-8 text-muted-foreground/40" />
            <p className="mt-2 text-sm text-muted-foreground">Nothing listed here yet.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {events.map((e) => (
              <EventCard key={e.id} event={e} href={`/events/${e.id}`} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
