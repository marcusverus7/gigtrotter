import { BuyTickets, type TierView } from "@/features/ticketing/buy-tickets";
import { stripeConfigured } from "@/lib/stripe/client";
import { DEFAULT_FEES } from "@/lib/tickets/pricing";
import { createServiceClient } from "@/lib/supabase/server";
import { WantOneButton } from "@/features/events/want-one-button";
import { LocalDateTime } from "@/components/local-datetime";
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
  Ticket,
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
import { createClient, getSessionUser } from "@/lib/supabase/server";
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
  const user = await getSessionUser();
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

  // Public totals come from an aggregate RPC (migration 0026): the rows
  // themselves are visible only to their owner and their friends, so counting
  // what RLS returns would undercount. Until 0026 is applied the RPC is
  // absent, and the visible rows are the best available number.
  const { data: counts } = await supabase.rpc("event_interest_counts", { target_event: id });
  const agg = Array.isArray(counts) ? counts[0] : counts;
  const interestedCount =
    Number(agg?.interested ?? NaN) ||
    (interests?.filter((i) => i.interest_type === "interested").length ?? 0);
  const goingCount =
    Number(agg?.going ?? NaN) ||
    (interests?.filter((i) => i.interest_type === "going").length ?? 0);

  // Tickets sold through GigTrotter (migration 0029). Absent table → empty.
  const [{ data: tierRows }, { data: availRows }] = await Promise.all([
    supabase
      .from("ticket_tiers")
      .select("id, name, description, price_cents, currency, max_per_order, status")
      .eq("event_id", id)
      .neq("status", "draft")
      .order("sort_order"),
    supabase.rpc("tier_availability", { target_event: id }),
  ]);
  const remainingByTier = new Map<string, number>(
    ((availRows ?? []) as Array<{ tier_id: string; remaining: number }>).map((a) => [a.tier_id, Number(a.remaining)]),
  );
  const tiers: TierView[] = ((tierRows ?? []) as Array<{ id: string; name: string; description: string | null; price_cents: number; currency: string; max_per_order: number; status: string }>).map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    priceCents: t.price_cents,
    currency: t.currency,
    remaining: remainingByTier.get(t.id) ?? 0,
    maxPerOrder: t.max_per_order,
    status: t.status,
  }));
  let fees = DEFAULT_FEES;
  if (tiers.length > 0 && event.promoter_id) {
    const { data: acct } = await createServiceClient()
      .from("promoter_accounts")
      .select("fee_bps, fee_fixed_cents")
      .eq("user_id", event.promoter_id)
      .maybeSingle();
    if (acct) fees = { bps: acct.fee_bps, fixedCents: acct.fee_fixed_cents };
  }
  const isPromoter = !!event.promoter_id && event.promoter_id === user.id;

  // Waitlist (sold-out events only) — tolerant of the table not existing yet.
  let wanted = false;
  let waitlistCount = 0;
  if (event.is_sold_out) {
    const [{ data: mine }, { data: cnt }] = await Promise.all([
      supabase.from("event_waitlist").select("event_id").eq("event_id", id).eq("user_id", user.id).maybeSingle(),
      supabase.rpc("event_waitlist_count", { target_event: id }),
    ]);
    wanted = !!mine;
    waitlistCount = Number(cnt ?? 0) || 0;
  }

  // Friends going
  const { data: friendRows } = await supabase
    .from("friendships")
    .select("user_a, user_b")
    .or(`user_a.eq.${user.id},user_b.eq.${user.id}`)
    .eq("state", "accepted");
  // There is no accepted_friend_ids RPC in any migration; the call returned
  // 404 for every request, so "friends going" was always empty.
  const friendIds = (friendRows ?? []).map((f) => (f.user_a === user.id ? f.user_b : f.user_a));
  const friendIdSet = new Set(friendIds);
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
                  {/* Client-side, like the time beneath it. Formatted on the
                      server this was Vercel's UTC forever — never a hydration
                      flash — so a 00:30 BST gig showed the previous day's
                      date directly above its own correct start time. */}
                  <LocalDateTime
                    className="block text-sm font-medium"
                    iso={event.starts_at}
                    options={{
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    <LocalDateTime
                      iso={event.starts_at}
                      options={{ hour: "2-digit", minute: "2-digit" }}
                    />
                    {event.doors_at ? (
                      <>
                        {" · Doors "}
                        <LocalDateTime
                          iso={event.doors_at}
                          options={{ hour: "2-digit", minute: "2-digit" }}
                        />
                      </>
                    ) : null}
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

          {/* Sold here: the buy box comes first, the outbound links after. */}
          {isFuture && tiers.length > 0 ? (
            <BuyTickets eventId={id} tiers={tiers} fees={fees} paymentsOn={stripeConfigured()} />
          ) : null}
          {isPromoter ? (
            <Button asChild variant="outline" size="sm">
              <Link href={`/app/events/${id}/tickets`}>
                <Ticket className="mr-1 h-4 w-4" /> Sell tickets for this event
              </Link>
            </Button>
          ) : null}

          {/* Add to wallet */}
          {isFuture && tiers.length === 0 ? <AddToWalletButton eventId={id} /> : null}

          {/* Sold out: join the want-a-ticket list (migration 0028) */}
          {isFuture && event.is_sold_out ? (
            <WantOneButton eventId={id} initialWanted={wanted} initialCount={waitlistCount} />
          ) : null}

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
