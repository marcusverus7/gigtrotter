import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarPlus, Globe2, Music, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { pgTextArray, stripLikeWildcards } from "@/lib/supabase/filters";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { EventSearch } from "@/features/events/event-search";
import { EventCard, type EventSummary } from "@/features/events/event-card";

export const metadata: Metadata = { title: "Events — Social Hub" };

/** Rows fetched for the browse grid. The badge shows the real total. */
const PAGE_SIZE = 30;

const EVENT_COLS =
  "id, title, headliner, artist_names, category, venue_name, venue_city, venue_country, starts_at, image_url, min_price_cents, currency, is_sold_out, tags";

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ city?: string }>;
}) {
  const supabase = await createClient();
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const { city } = await searchParams;

  const nowIso = new Date().toISOString();

  // Upcoming events (optionally narrowed to one city), the city list for the
  // filter chips, and what the user follows — all independent, one round trip.
  let upcomingQuery = supabase
    .from("events")
    .select(EVENT_COLS)
    .gte("starts_at", nowIso)
    .order("starts_at", { ascending: true })
    .limit(PAGE_SIZE);
  let countQuery = supabase
    .from("events")
    .select("id", { count: "exact", head: true })
    .gte("starts_at", nowIso);
  // .ilike sends this value as the PATTERN, so a wildcard in the query string
  // would widen the filter while the chip still claimed one city. Stripped,
  // not escaped — see stripLikeWildcards for why escaping does nothing here.
  const cityFilter = city ? stripLikeWildcards(city) : "";
  if (cityFilter) {
    upcomingQuery = upcomingQuery.ilike("venue_city", cityFilter);
    countQuery = countQuery.ilike("venue_city", cityFilter);
  }

  const [{ data: upcoming }, { count: upcomingCount }, { data: cityRows }, { data: follows }] =
    await Promise.all([
      upcomingQuery,
      countQuery,
      // Ordered by date and taking the largest page PostgREST will return:
      // an unordered 400-row sample sorted alphabetically put Aberdeen and
      // Aylesbury on the chips and hid London and Manchester entirely. Cities
      // are ranked by how much is on soonest, which is what a chip is for.
      supabase
        .from("events")
        .select("venue_city")
        .gte("starts_at", nowIso)
        .not("venue_city", "is", null)
        .order("starts_at", { ascending: true })
        .limit(1000),
      supabase.from("follows").select("kind, name").eq("user_id", user.id).limit(200),
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

  // "For you": upcoming events for artists/venues the user follows.
  const followedArtists = (follows ?? []).filter((f) => f.kind === "artist").map((f) => f.name);
  const followedVenues = (follows ?? []).filter((f) => f.kind === "venue").map((f) => f.name);
  let forYou: EventSummary[] = [];
  if (followedArtists.length > 0 || followedVenues.length > 0) {
    const [byArtist, byVenue] = await Promise.all([
      followedArtists.length > 0
        ? supabase
            .from("events")
            .select(EVENT_COLS)
            .overlaps("artist_names", pgTextArray(followedArtists))
            .gte("starts_at", nowIso)
            .order("starts_at", { ascending: true })
            .limit(6)
        : Promise.resolve({ data: [] as EventSummary[] }),
      followedVenues.length > 0
        ? supabase
            .from("events")
            .select(EVENT_COLS)
            .in("venue_name", followedVenues)
            .gte("starts_at", nowIso)
            .order("starts_at", { ascending: true })
            .limit(6)
        : Promise.resolve({ data: [] as EventSummary[] }),
    ]);
    const merged = new Map<string, EventSummary>();
    for (const e of [...(byArtist.data ?? []), ...(byVenue.data ?? [])] as EventSummary[]) {
      merged.set(e.id, e);
    }
    forYou = [...merged.values()]
      .sort((a, b) => (a.starts_at ?? "").localeCompare(b.starts_at ?? ""))
      .slice(0, 6);
  }

  // Events where friends are going
  const { data: friendIds } = await supabase.rpc("accepted_friend_ids");
  const friendIdList: string[] = Array.isArray(friendIds)
    ? friendIds.map((f: any) => f.friend_id ?? f)
    : [];

  let friendEvents: any[] = [];
  if (friendIdList.length > 0) {
    const { data: fInterests } = await supabase
      .from("event_interests")
      .select("event_id, user_id, interest_type")
      .in("user_id", friendIdList.slice(0, 50))
      .eq("interest_type", "going");

    if (fInterests && fInterests.length > 0) {
      const eventIds = [...new Set(fInterests.map((i) => i.event_id))];
      const { data: fEvents } = await supabase
        .from("events")
        .select(
          "id, title, headliner, artist_names, category, venue_name, venue_city, venue_country, starts_at, image_url, min_price_cents, currency, is_sold_out, tags",
        )
        .in("id", eventIds.slice(0, 20))
        .gte("starts_at", new Date().toISOString())
        .order("starts_at", { ascending: true });

      friendEvents = (fEvents ?? []).map((e) => ({
        ...e,
        friends_going: fInterests
          .filter((i) => i.event_id === e.id)
          .map((i) => i.user_id),
      }));
    }
  }

  // Interest counts for upcoming events
  const upcomingIds = (upcoming ?? []).map((e) => e.id);
  const interestCounts: Record<string, { interested: number; going: number }> = {};
  if (upcomingIds.length > 0) {
    const { data: interests } = await supabase
      .from("event_interests")
      .select("event_id, interest_type")
      .in("event_id", upcomingIds);

    if (interests) {
      for (const i of interests) {
        if (!interestCounts[i.event_id]) {
          interestCounts[i.event_id] = { interested: 0, going: 0 };
        }
        interestCounts[i.event_id][i.interest_type as "interested" | "going"]++;
      }
    }
  }

  const enrichedUpcoming: EventSummary[] = (upcoming ?? []).map((e) => ({
    ...e,
    interested_count: interestCounts[e.id]?.interested ?? 0,
    going_count: interestCounts[e.id]?.going ?? 0,
  }));

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Globe2 className="h-4 w-4 text-primary" />
          Discover · connect · go
        </div>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Events</h1>
        <p className="text-sm text-muted-foreground">
          Find gigs, festivals, and nights out. See who&apos;s going, grab
          tickets, and add it to your wallet.
        </p>
        <div className="mt-3">
          <Button asChild size="sm">
            <Link href="/app/events/submit">
              <CalendarPlus className="mr-1 h-4 w-4" /> Submit an event
            </Link>
          </Button>
        </div>
      </header>

      {/* For you — artists and venues the user follows */}
      {forYou.length > 0 ? (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Music className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              For you
            </h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {forYou.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        </section>
      ) : null}

      {/* Friends going section */}
      {friendEvents.length > 0 ? (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-secondary" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Friends are going
            </h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {friendEvents.slice(0, 6).map((event: any) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        </section>
      ) : null}

      {/* Search */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Music className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Browse events
          </h2>
          <Badge variant="outline" className="text-[10px]">
            {/* The real total, not the page size — this printed "30 upcoming"
                for every city with at least 30 events. */}
            {upcomingCount ?? upcoming?.length ?? 0} upcoming
          </Badge>
        </div>

        {/* City chips — plain links so the filter works with zero client JS,
            inside the WebView shells included. */}
        {cities.length > 1 ? (
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" variant={!cityFilter ? "default" : "outline"} className="h-8">
              <Link href="/app/events">All</Link>
            </Button>
            {cities.map((c) => (
              <Button
                key={c}
                asChild
                size="sm"
                variant={cityFilter.toLowerCase() === c.toLowerCase() ? "default" : "outline"}
                className="h-8"
              >
                <Link href={`/app/events?city=${encodeURIComponent(c)}`}>{c}</Link>
              </Button>
            ))}
          </div>
        ) : null}

        {/* The search box renders either way. The empty state told people to
            "search for a city or artist" while the search box was inside the
            non-empty branch, so the one instruction on screen was the one
            thing they could not do. */}
        <EventSearch initialEvents={enrichedUpcoming} initialCity={cityFilter} />

        {!upcoming || upcoming.length === 0 ? (
          <Card className="border-dashed">
            <CardHeader>
              <CardTitle className="text-base">
                {cityFilter ? `Nothing listed in ${cityFilter} yet` : "No events listed yet"}
              </CardTitle>
              <CardDescription>
                {cityFilter
                  ? "Try another city, or search above for an artist."
                  : "Events appear here as promoters and our sync pipeline add them. Search above for a city or artist to find what's on."}
              </CardDescription>
            </CardHeader>
          </Card>
        ) : null}
      </section>
    </div>
  );
}
