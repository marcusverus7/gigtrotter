import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  ArrowLeft,
  Calendar,
  Globe2,
  MapPin,
  Music,
  ShoppingBag,
} from "lucide-react";

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
import { EventCard } from "@/features/events/event-card";

export const metadata: Metadata = { title: "Venue" };

export default async function VenueDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: venue } = await supabase
    .from("venues")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!venue) notFound();

  // Upcoming events at this venue
  const { data: events } = await supabase
    .from("events")
    .select(
      "id, title, headliner, artist_names, category, venue_name, venue_city, venue_country, starts_at, image_url, min_price_cents, currency, is_sold_out, tags",
    )
    .eq("venue_id", id)
    .gte("starts_at", new Date().toISOString())
    .order("starts_at", { ascending: true })
    .limit(20);

  // Past events / wallet items at this venue
  const { data: pastItems } = await supabase
    .from("wallet_items")
    .select("id, title, starts_at, kind")
    .eq("venue_id", id)
    .eq("user_id", user.id)
    .order("starts_at", { ascending: false })
    .limit(10);

  // Merch available at this venue
  const { data: merchItems } = await supabase
    .from("merch_items")
    .select("id, title, images, price_cents, currency, artist_name")
    .eq("venue_id", id)
    .eq("published", true)
    .limit(6);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/app/events">
          <ArrowLeft /> Back to events
        </Link>
      </Button>

      <Card className="overflow-hidden border-primary/30">
        <CardHeader className="bg-gradient-to-br from-primary/15 via-card to-secondary/10">
          <div className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            <Badge variant="outline">Venue</Badge>
          </div>
          <CardTitle className="mt-2 text-2xl">{venue.name}</CardTitle>
          <CardDescription className="text-base">
            {[venue.city, venue.country].filter(Boolean).join(", ")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-6">
          {venue.lat && venue.lng ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Globe2 className="h-3 w-3" />
              {venue.lat.toFixed(4)}, {venue.lng.toFixed(4)}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Upcoming events */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Upcoming at {venue.name}
          </h2>
          <Badge variant="outline" className="text-[10px]">
            {events?.length ?? 0}
          </Badge>
        </div>
        {!events || events.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No upcoming events listed for this venue yet.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {events.map((event: any) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        )}
      </section>

      {/* Your history at this venue */}
      {pastItems && pastItems.length > 0 ? (
        <section className="space-y-3">
          <Separator />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Your history here
          </h2>
          <div className="space-y-2">
            {pastItems.map((item: any) => (
              <Link
                key={item.id}
                href={`/app/item/${item.id}`}
                className="flex items-center justify-between rounded-lg border border-border bg-card p-3 transition-colors hover:border-primary/40"
              >
                <div className="flex items-center gap-3">
                  <Music className="h-4 w-4 text-muted-foreground" />
                  <p className="text-sm font-medium">{item.title}</p>
                </div>
                {item.starts_at ? (
                  <span className="text-xs text-muted-foreground">
                    {new Intl.DateTimeFormat(undefined, {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    }).format(new Date(item.starts_at))}
                  </span>
                ) : null}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {/* Venue merch */}
      {merchItems && merchItems.length > 0 ? (
        <section className="space-y-3">
          <Separator />
          <div className="flex items-center gap-2">
            <ShoppingBag className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Merch at {venue.name}
            </h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {merchItems.map((m: any) => (
              <Link
                key={m.id}
                href={`/app/merch/${m.id}`}
                className="rounded-lg border border-border bg-card p-3 transition-colors hover:border-primary/40"
              >
                {m.images?.[0] ? (
                  <img
                    src={m.images[0]}
                    alt=""
                    className="aspect-square w-full rounded-md object-cover"
                  />
                ) : null}
                <p className="mt-2 text-sm font-medium">{m.title}</p>
                <p className="font-mono text-xs text-muted-foreground">
                  {new Intl.NumberFormat("en-GB", {
                    style: "currency",
                    currency: m.currency,
                  }).format(m.price_cents / 100)}
                </p>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
