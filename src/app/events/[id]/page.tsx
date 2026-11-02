import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Calendar, ExternalLink, MapPin, Music, Tag, Ticket } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { GigTrotterMark } from "@/components/brand";
import { LocalDateTime } from "@/components/local-datetime";
import { affiliateUrl } from "@/lib/affiliate";
import { formatMoney } from "@/lib/tickets/pricing";
import { createClient, getSessionUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Event" };

/**
 * The public, signed-out event page. Everything here is readable with the
 * anon key under RLS: `events: public read` only returns rows whose status
 * is 'approved', ticket links and tiers are public, and `tier_availability`
 * is granted to anon. Nothing personal is read — no interests, no names, no
 * orders, no tickets — so there is nothing to leak. Signing in to buy or save
 * keeps the event: the link carries ?next= back to the app page.
 */

const PUBLIC_COLS =
  "id, title, headliner, artist_names, category, description, venue_id, venue_name, venue_city, venue_country, starts_at, doors_at, image_url, min_price_cents, max_price_cents, currency, is_sold_out, tags, promoter_id";

const CATEGORY_LABELS: Record<string, string> = {
  concert: "Concert",
  festival: "Festival",
  club_night: "Club night",
  theatre: "Theatre",
  comedy: "Comedy",
  sport: "Sport",
  other: "Event",
};

type PublicEvent = {
  id: string;
  title: string;
  headliner: string | null;
  artist_names: string[] | null;
  category: string;
  description: string | null;
  venue_id: string | null;
  venue_name: string | null;
  venue_city: string | null;
  venue_country: string | null;
  starts_at: string | null;
  doors_at: string | null;
  image_url: string | null;
  min_price_cents: number | null;
  max_price_cents: number | null;
  currency: string;
  is_sold_out: boolean;
  tags: string[] | null;
  promoter_id: string | null;
};

type TicketLink = {
  id: string;
  provider: string;
  provider_label: string;
  url: string;
  min_price_cents: number | null;
  max_price_cents: number | null;
  currency: string;
  is_sold_out: boolean;
  sort_order: number;
};

export default async function PublicEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  // A signed-in person gets the full page (interest buttons, friends, buy box).
  const user = await getSessionUser();
  if (user) redirect(`/app/events/${id}`);

  const supabase = await createClient();
  const [{ data: event }, { data: links }, { data: tierRows }, { data: availRows }] =
    await Promise.all([
      supabase.from("events").select(PUBLIC_COLS).eq("id", id).maybeSingle(),
      supabase
        .from("event_ticket_links")
        .select("id, provider, provider_label, url, min_price_cents, max_price_cents, currency, is_sold_out, sort_order")
        .eq("event_id", id)
        .order("sort_order"),
      supabase
        .from("ticket_tiers")
        .select("id, name, price_cents, currency, status")
        .eq("event_id", id)
        .in("status", ["on_sale", "sold_out"])
        .order("sort_order"),
      supabase.rpc("tier_availability", { target_event: id }),
    ]);
  if (!event) notFound();
  const e = event as unknown as PublicEvent;
  const ticketLinks = ((links ?? []) as TicketLink[]).slice().sort((a, b) => a.sort_order - b.sort_order);
  const remaining = new Map<string, number>(
    ((availRows ?? []) as Array<{ tier_id: string; remaining: number }>).map((a) => [a.tier_id, Number(a.remaining)]),
  );
  const tiers = ((tierRows ?? []) as Array<{ id: string; name: string; price_cents: number; currency: string; status: string }>).map(
    (t) => ({ ...t, remaining: remaining.get(t.id) ?? 0 }),
  );
  const soldHere = !!e.promoter_id && tiers.length > 0;
  const anyLeft = tiers.some((t) => t.remaining > 0);

  const next = encodeURIComponent(`/app/events/${e.id}`);
  const place = [e.venue_name, e.venue_city, e.venue_country].filter(Boolean).join(" · ");
  const isFuture = e.starts_at ? new Date(e.starts_at).getTime() > Date.now() : false;
  const timeTba = (e.tags ?? []).includes("time_tba");

  return (
    <main className="relative min-h-screen bg-background text-foreground">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
        <Link href="/">
          <GigTrotterMark />
        </Link>
        <nav className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href={`/login?next=${next}`}>Sign in</Link>
          </Button>
          <Button asChild size="sm">
            <Link href={`/signup?next=${next}`}>Get started</Link>
          </Button>
        </nav>
      </header>

      <div className="mx-auto max-w-3xl space-y-6 px-6 pb-20">
        <Button asChild variant="ghost" size="sm">
          <Link href="/events">
            <ArrowLeft /> All events
          </Link>
        </Button>

        {e.image_url ? (
          <div className="overflow-hidden rounded-xl border border-border">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={e.image_url} alt={e.title} className="aspect-[2/1] w-full object-cover" />
          </div>
        ) : null}

        <Card className="overflow-hidden border-primary/30">
          <CardHeader className="bg-gradient-to-br from-primary/15 via-card to-secondary/10">
            <div className="flex flex-wrap gap-1.5">
              <Badge variant="outline" className="capitalize">
                <Music className="mr-1 h-3 w-3" />
                {CATEGORY_LABELS[e.category] ?? "Event"}
              </Badge>
              {e.is_sold_out ? (
                <Badge variant="destructive">Sold out</Badge>
              ) : isFuture ? (
                <Badge variant="friends">Upcoming</Badge>
              ) : (
                <Badge variant="verified">Past</Badge>
              )}
            </div>
            <CardTitle className="mt-2 text-2xl leading-tight">{e.title}</CardTitle>
            {e.headliner && e.headliner !== e.title ? (
              <p className="text-base text-muted-foreground">{e.headliner}</p>
            ) : null}
          </CardHeader>

          <CardContent className="space-y-6 pt-6">
            <div className="grid gap-4 sm:grid-cols-2">
              {e.starts_at ? (
                <div className="flex items-start gap-3">
                  <Calendar className="mt-0.5 h-5 w-5 text-primary" />
                  <div>
                    <LocalDateTime
                      className="block text-sm font-medium"
                      iso={e.starts_at}
                      options={{ weekday: "long", day: "numeric", month: "long", year: "numeric" }}
                    />
                    <p className="text-xs text-muted-foreground">
                      {timeTba ? (
                        "Time to be announced"
                      ) : (
                        <LocalDateTime iso={e.starts_at} options={{ hour: "2-digit", minute: "2-digit" }} />
                      )}
                      {e.doors_at && !timeTba ? (
                        <>
                          {" · Doors "}
                          <LocalDateTime iso={e.doors_at} options={{ hour: "2-digit", minute: "2-digit" }} />
                        </>
                      ) : null}
                    </p>
                  </div>
                </div>
              ) : null}
              {place ? (
                <div className="flex items-start gap-3">
                  <MapPin className="mt-0.5 h-5 w-5 text-primary" />
                  <div>
                    <p className="text-sm font-medium">{e.venue_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {[e.venue_city, e.venue_country].filter(Boolean).join(", ")}
                    </p>
                  </div>
                </div>
              ) : null}
            </div>

            {e.min_price_cents ? (
              <div className="flex items-center gap-2">
                <Tag className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm">
                  <span className="font-mono font-medium">{formatMoney(e.min_price_cents, e.currency)}</span>
                  {e.max_price_cents && e.max_price_cents !== e.min_price_cents ? (
                    <>
                      {" – "}
                      <span className="font-mono font-medium">{formatMoney(e.max_price_cents, e.currency)}</span>
                    </>
                  ) : null}
                </p>
              </div>
            ) : null}

            {e.artist_names && e.artist_names.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {e.artist_names.map((name) => (
                  <Badge key={name} variant="outline" className="text-xs">
                    <Music className="mr-1 h-3 w-3" />
                    {name}
                  </Badge>
                ))}
              </div>
            ) : null}

            {e.description ? (
              <p className="whitespace-pre-line text-sm text-muted-foreground">{e.description}</p>
            ) : null}

            <Separator />

            {/* Tickets sold through GigTrotter: facts only; buying needs an account. */}
            {soldHere ? (
              <div className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
                <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  <Ticket className="h-4 w-4" />
                  Tickets on GigTrotter
                </h3>
                <ul className="space-y-1 text-sm">
                  {tiers.map((t) => (
                    <li key={t.id} className="flex items-center justify-between">
                      <span>{t.name}</span>
                      <span className="font-mono">
                        {t.price_cents > 0 ? formatMoney(t.price_cents, t.currency) : "Free"}
                        {t.remaining <= 0 ? <span className="ml-2 text-xs text-muted-foreground">sold out</span> : null}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-muted-foreground">
                  The promoter receives the full face value. A booking fee is shown before you pay.
                </p>
                <Button asChild className="w-full" disabled={!anyLeft}>
                  <Link href={`/login?next=${next}`}>
                    {anyLeft ? "Sign in to buy" : "Sign in to join the waiting list"}
                  </Link>
                </Button>
              </div>
            ) : null}

            {/* Seller links: plain anchors, no click tracking without a session. */}
            {ticketLinks.length > 0 ? (
              <div className="space-y-2">
                <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  <Ticket className="h-4 w-4" />
                  Get tickets
                </h3>
                {ticketLinks.map((l) => (
                  <a
                    key={l.id}
                    href={affiliateUrl(l.provider, l.url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex min-h-[44px] w-full items-center justify-between rounded-md border border-border px-4 py-2 text-left text-sm hover:border-primary/50"
                  >
                    <span>
                      <span className="font-medium">{l.provider_label}</span>
                      {l.min_price_cents ? (
                        <span className="ml-2 text-xs text-muted-foreground">
                          {l.max_price_cents && l.max_price_cents !== l.min_price_cents
                            ? `${formatMoney(l.min_price_cents, l.currency)} – ${formatMoney(l.max_price_cents, l.currency)}`
                            : `From ${formatMoney(l.min_price_cents, l.currency)}`}
                        </span>
                      ) : null}
                    </span>
                    <span className="flex items-center gap-2">
                      {l.is_sold_out ? (
                        <Badge variant="destructive" className="text-[10px]">
                          Sold out
                        </Badge>
                      ) : null}
                      <ExternalLink className="h-4 w-4 text-muted-foreground" />
                    </span>
                  </a>
                ))}
                <p className="text-center text-[10px] text-muted-foreground">
                  These tickets are sold by the named provider under its own terms.
                </p>
              </div>
            ) : !soldHere ? (
              <p className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                No ticket links yet. Check the venue&apos;s own site, or sign in to be told when they go on sale.
              </p>
            ) : null}

            <div className="rounded-lg border border-border bg-muted/20 p-4 text-sm">
              <p className="font-medium">Save it, see who&apos;s going, keep the ticket in one place.</p>
              <p className="mt-1 text-muted-foreground">
                Sign in to mark yourself interested or going, see which friends are going, and keep every ticket,
                from any seller, in your wallet.
              </p>
              <div className="mt-3 flex gap-2">
                <Button asChild size="sm">
                  <Link href={`/login?next=${next}`}>Sign in</Link>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link href={`/signup?next=${next}`}>Make an account</Link>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
