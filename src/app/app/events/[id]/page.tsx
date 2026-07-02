import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  ArrowLeft,
  Calendar,
  MapPin,
  MessageSquare,
  Music,
  Shield,
  Tag,
  Users,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { createClient } from "@/lib/supabase/server";
import { InterestButtons } from "@/features/events/interest-buttons";
import { TicketLinks } from "@/features/events/ticket-links";
import { AddToWalletButton } from "@/features/events/add-to-wallet-button";

export const metadata: Metadata = { title: "Event" };

function DiscussionCTA({ eventId, hasWalletItem, isPurchased }: { eventId: string; hasWalletItem: boolean; isPurchased: boolean }) {
  if (!hasWalletItem) return null;
  return (
    <Link
      href={`/app/events/${eventId}/discussion`}
      className="flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 p-4 transition-colors hover:bg-primary/10"
    >
      <div className="flex items-center gap-3">
        <MessageSquare className="h-5 w-5 text-primary" />
        <div>
          <p className="text-sm font-medium">Join the discussion</p>
          <p className="text-xs text-muted-foreground">
            {isPurchased
              ? "Share photos, react, and chat with other attendees."
              : "View posts from verified attendees. Purchase through GigTrotter to unlock full access."}
          </p>
        </div>
      </div>
      {isPurchased ? (
        <Badge variant="verified" className="gap-0.5 text-[9px]">
          <Shield className="h-2.5 w-2.5 fill-current" />
          Full access
        </Badge>
      ) : (
        <Badge variant="outline" className="text-[9px]">View only</Badge>
      )}
    </Link>
  );
}

const CATEGORY_LABELS: Record<string, string> = {
  concert: "Concert",
  festival: "Festival",
  club_night: "Club night",
  theatre: "Theatre",
  comedy: "Comedy",
  sport: "Sport",
  other: "Event",
};

export default async function EventDetailPage({
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

  const { data: event } = await supabase
    .from("events")
    .select(
      "*, venues(name, city, country, lat, lng), event_ticket_links(id, provider, provider_label, url, min_price_cents, max_price_cents, currency, is_sold_out, is_affiliate, sort_order)",
    )
    .eq("id", id)
    .maybeSingle();

  if (!event) notFound();

  // User's interest
  const { data: myInterest } = await supabase
    .from("event_interests")
    .select("interest_type")
    .eq("event_id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  // Interest counts
  const { data: interests } = await supabase
    .from("event_interests")
    .select("interest_type, user_id")
    .eq("event_id", id);

  const interestedCount =
    interests?.filter((i) => i.interest_type === "interested").length ?? 0;
  const goingCount =
    interests?.filter((i) => i.interest_type === "going").length ?? 0;

  // Friends going
  const { data: friendIds } = await supabase.rpc("accepted_friend_ids");
  const friendIdSet = new Set(
    Array.isArray(friendIds)
      ? friendIds.map((f: any) => f.friend_id ?? f)
      : [],
  );
  const friendsGoing = (interests ?? [])
    .filter((i) => i.interest_type === "going" && friendIdSet.has(i.user_id))
    .map((i) => i.user_id);

  // Load friend profiles
  let friendProfiles: { display_name: string | null; username: string }[] = [];
  if (friendsGoing.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name, username")
      .in("id", friendsGoing.slice(0, 10));
    friendProfiles = profiles ?? [];
  }

  const venue = event.venue_name
    ? [event.venue_name, event.venue_city, event.venue_country]
        .filter(Boolean)
        .join(" · ")
    : event.venues?.name
      ? [event.venues.name, event.venues.city, event.venues.country]
          .filter(Boolean)
          .join(" · ")
      : null;

  const ticketLinks = (event.event_ticket_links ?? []).sort(
    (a: any, b: any) => a.sort_order - b.sort_order,
  );

  const startsAt = event.starts_at ? new Date(event.starts_at) : null;
  const isFuture = startsAt ? startsAt.getTime() > Date.now() : false;

  // Check if user has this event in wallet (for discussion access)
  const { data: userWalletItem } = await supabase
    .from("wallet_items")
    .select("id, purchased_via_platform")
    .eq("user_id", user.id)
    .eq("title", event.title)
    .eq("starts_at", event.starts_at)
    .maybeSingle();

  // Linked merch
  const { data: merchLinks } = await supabase
    .from("merch_gig_links")
    .select(
      "merch_item_id, merch_items(id, title, images, artist_name, price_cents, currency)",
    )
    .eq("artist_name", event.headliner ?? "___none___");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/app/events">
          <ArrowLeft /> Back to events
        </Link>
      </Button>

      {/* Hero image */}
      {event.image_url ? (
        <div className="overflow-hidden rounded-xl border border-border">
          <img
            src={event.image_url}
            alt={event.title}
            className="aspect-[2/1] w-full object-cover"
          />
        </div>
      ) : null}

      {/* Event info card */}
      <Card className="overflow-hidden border-primary/30">
        <CardHeader className="bg-gradient-to-br from-primary/15 via-card to-secondary/10">
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="outline" className="capitalize">
              <Music className="mr-1 h-3 w-3" />
              {CATEGORY_LABELS[event.category] ?? "Event"}
            </Badge>
            {event.is_sold_out ? (
              <Badge variant="destructive">Sold out</Badge>
            ) : isFuture ? (
              <Badge variant="friends">Upcoming</Badge>
            ) : (
              <Badge variant="verified">Past</Badge>
            )}
          </div>
          <CardTitle className="mt-2 text-2xl leading-tight">
            {event.title}
          </CardTitle>
          {event.headliner && event.headliner !== event.title ? (
            <p className="text-base text-muted-foreground">
              {event.headliner}
            </p>
          ) : null}
        </CardHeader>

        <CardContent className="space-y-6 pt-6">
          {/* When & where */}
          <div className="grid gap-4 sm:grid-cols-2">
            {startsAt ? (
              <div className="flex items-start gap-3">
                <Calendar className="mt-0.5 h-5 w-5 text-primary" />
                <div>
                  <p className="text-sm font-medium">
                    {new Intl.DateTimeFormat(undefined, {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    }).format(startsAt)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Intl.DateTimeFormat(undefined, {
                      hour: "2-digit",
                      minute: "2-digit",
                    }).format(startsAt)}
                    {event.doors_at
                      ? ` · Doors ${new Intl.DateTimeFormat(undefined, {
                          hour: "2-digit",
                          minute: "2-digit",
                        }).format(new Date(event.doors_at))}`
                      : ""}
                  </p>
                </div>
              </div>
            ) : null}
            {venue ? (
              <div className="flex items-start gap-3">
                <MapPin className="mt-0.5 h-5 w-5 text-primary" />
                <div>
                  {event.venue_id ? (
                    <Link href={`/app/venues/${event.venue_id}`} className="text-sm font-medium hover:text-primary transition-colors">
                      {event.venue_name ?? event.venues?.name}
                    </Link>
                  ) : (
                    <p className="text-sm font-medium">{event.venue_name ?? event.venues?.name}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {[event.venue_city ?? event.venues?.city, event.venue_country ?? event.venues?.country]
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                </div>
              </div>
            ) : null}
          </div>

          {/* Price hint */}
          {event.min_price_cents ? (
            <div className="flex items-center gap-2">
              <Tag className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm">
                <span className="font-mono font-medium">
                  {new Intl.NumberFormat("en-GB", {
                    style: "currency",
                    currency: event.currency,
                    maximumFractionDigits: 0,
                  }).format(event.min_price_cents / 100)}
                </span>
                {event.max_price_cents && event.max_price_cents !== event.min_price_cents ? (
                  <>
                    {" – "}
                    <span className="font-mono font-medium">
                      {new Intl.NumberFormat("en-GB", {
                        style: "currency",
                        currency: event.currency,
                        maximumFractionDigits: 0,
                      }).format(event.max_price_cents / 100)}
                    </span>
                  </>
                ) : null}
              </p>
            </div>
          ) : null}

          {/* Artists */}
          {event.artist_names && event.artist_names.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {event.artist_names.map((name: string) => (
                <Link key={name} href={`/app/artists/${encodeURIComponent(name)}`}>
                  <Badge variant="outline" className="text-xs hover:border-primary/60 transition-colors cursor-pointer">
                    <Music className="mr-1 h-3 w-3" />
                    {name}
                  </Badge>
                </Link>
              ))}
            </div>
          ) : null}

          {/* Description */}
          {event.description ? (
            <p className="whitespace-pre-line text-sm text-muted-foreground">
              {event.description}
            </p>
          ) : null}

          <Separator />

          {/* Social: interested / going */}
          <div className="space-y-3">
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Users className="h-4 w-4" />
                {goingCount} going
              </span>
              <span>{interestedCount} interested</span>
            </div>

            <InterestButtons
              eventId={id}
              currentInterest={
                (myInterest?.interest_type as "interested" | "going") ?? null
              }
            />

            {friendProfiles.length > 0 ? (
              <div className="rounded-lg border border-secondary/30 bg-secondary/5 p-3">
                <p className="text-xs font-medium text-secondary">
                  <Users className="mr-1 inline h-3 w-3" />
                  {friendProfiles.length} friend
                  {friendProfiles.length > 1 ? "s" : ""} going
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {friendProfiles
                    .map((p) => p.display_name ?? p.username)
                    .join(", ")}
                </p>
              </div>
            ) : null}
          </div>

          {/* Add to wallet */}
          {isFuture ? <AddToWalletButton eventId={id} /> : null}

          <Separator />

          {/* Ticket links with tracking */}
          <TicketLinks links={ticketLinks} eventId={id} />

          {/* Discussion CTA */}
          <Separator />
          <DiscussionCTA
            eventId={id}
            hasWalletItem={!!userWalletItem}
            isPurchased={userWalletItem?.purchased_via_platform === true}
          />

          {/* Tags */}
          {event.tags && event.tags.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {event.tags.map((tag: string) => (
                <Badge key={tag} variant="outline" className="text-[10px]">
                  {tag}
                </Badge>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Linked merch */}
      {merchLinks && merchLinks.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Merch from this artist
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {merchLinks.map((link: any) =>
              link.merch_items ? (
                <Link
                  key={link.merch_item_id}
                  href={`/app/merch/${link.merch_item_id}`}
                  className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:border-primary/40"
                >
                  {link.merch_items.images?.[0] ? (
                    <img
                      src={link.merch_items.images[0]}
                      alt=""
                      className="h-12 w-12 rounded-md object-cover"
                    />
                  ) : null}
                  <div>
                    <p className="text-sm font-medium">
                      {link.merch_items.title}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Intl.NumberFormat("en-GB", {
                        style: "currency",
                        currency: link.merch_items.currency,
                      }).format(link.merch_items.price_cents / 100)}
                    </p>
                  </div>
                </Link>
              ) : null,
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}
