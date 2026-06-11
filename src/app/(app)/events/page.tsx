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
import { createClient } from "@/lib/supabase/server";
import { EventSearch } from "@/features/events/event-search";
import { EventCard, type EventSummary } from "@/features/events/event-card";

export const metadata: Metadata = { title: "Events — Social Hub" };

export default async function EventsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Upcoming events
  const { data: upcoming } = await supabase
    .from("events")
    .select(
      "id, title, headliner, artist_names, category, venue_name, venue_city, venue_country, starts_at, image_url, min_price_cents, currency, is_sold_out, tags",
    )
    .gte("starts_at", new Date().toISOString())
    .order("starts_at", { ascending: true })
    .limit(30);

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
  let interestCounts: Record<string, { interested: number; going: number }> = {};
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
            {upcoming?.length ?? 0} upcoming
          </Badge>
        </div>

        {!upcoming || upcoming.length === 0 ? (
          <Card className="border-dashed">
            <CardHeader>
              <CardTitle className="text-base">No events listed yet</CardTitle>
              <CardDescription>
                Events appear here as promoters and our sync pipeline add them.
                Search for a city or artist to find what&apos;s on.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <EventSearch initialEvents={enrichedUpcoming} />
        )}
      </section>
    </div>
  );
}
