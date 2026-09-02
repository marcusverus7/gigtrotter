import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowLeft,
  Calendar,
  Heart,
  Music,
  ShoppingBag,
  Users,
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
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { EventCard } from "@/features/events/event-card";

export const metadata: Metadata = { title: "Artist" };

export default async function ArtistPage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name } = await params;
  const artistName = decodeURIComponent(name).replace(/[^a-zA-Z0-9 '\-]/g, "").slice(0, 200);
  const supabase = await createClient();
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const pattern = `%${artistName}%`;

  // Upcoming events featuring this artist
  const { data: events } = await supabase
    .from("events")
    .select(
      "id, title, headliner, artist_names, category, venue_name, venue_city, venue_country, starts_at, image_url, min_price_cents, currency, is_sold_out, tags",
    )
    .or(`headliner.ilike.${pattern},venue_name.ilike.${pattern}`)
    .gte("starts_at", new Date().toISOString())
    .order("starts_at", { ascending: true })
    .limit(20);

  // Past events from the user's wallet
  const { data: pastItems } = await supabase
    .from("wallet_items")
    .select("id, title, starts_at, subtitle")
    .eq("user_id", user.id)
    .or(`title.ilike.${pattern},subtitle.ilike.${pattern}`)
    .order("starts_at", { ascending: false })
    .limit(10);

  // Followers count (from follows table)
  const { count: followerCount } = await supabase
    .from("follows")
    .select("id", { count: "exact", head: true })
    .eq("name", artistName);

  // Is current user following?
  const { data: myFollow } = await supabase
    .from("follows")
    .select("id")
    .eq("user_id", user.id)
    .eq("name", artistName)
    .maybeSingle();

  // Merch by this artist
  const { data: merch } = await supabase
    .from("merch_items")
    .select("id, title, images, price_cents, currency")
    .ilike("artist_name", `%${artistName}%`)
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
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/20">
              <Music className="h-7 w-7 text-primary" />
            </div>
            <div>
              <CardTitle className="text-2xl">{artistName}</CardTitle>
              <CardDescription className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  {followerCount ?? 0} followers
                </span>
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {events?.length ?? 0} upcoming
                </span>
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          {myFollow ? (
            <Badge variant="verified" className="text-xs">
              <Heart className="mr-1 h-3 w-3 fill-current" /> Following
            </Badge>
          ) : (
            <p className="text-xs text-muted-foreground">
              Follow this artist on the Discover page to get alerts when new events are listed.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Upcoming events */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Upcoming events
        </h2>
        {!events || events.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No upcoming events found for {artistName}.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {events.map((event: any) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        )}
      </section>

      {/* User's history with this artist */}
      {pastItems && pastItems.length > 0 ? (
        <section className="space-y-3">
          <Separator />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Your history with {artistName}
          </h2>
          <div className="space-y-2">
            {pastItems.map((item: any) => (
              <Link
                key={item.id}
                href={`/app/item/${item.id}`}
                className="flex items-center justify-between rounded-lg border border-border bg-card p-3 transition-colors hover:border-primary/40"
              >
                <p className="text-sm font-medium">{item.title}</p>
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

      {/* Merch */}
      {merch && merch.length > 0 ? (
        <section className="space-y-3">
          <Separator />
          <div className="flex items-center gap-2">
            <ShoppingBag className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Merch
            </h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {merch.map((m: any) => (
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
