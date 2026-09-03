/**
 * Bandsintown public API -> FeedEvent. PURE — fixture-tested.
 *
 * The one landmine: `datetime` is the venue's LOCAL wall clock with no
 * offset ("2026-11-14T19:30:00"). Treating it as UTC is the same hour-shift
 * bug this repo has fixed twice elsewhere, so the conversion goes through the
 * venue's IANA `timezone` and is tested in both halves of the year.
 */

import type { FeedEvent } from "@/lib/events/feed-types";
import { zonedWallClockToUtc } from "@/lib/events/ticketmaster/map";

export type BitEvent = {
  id?: string;
  url?: string;
  datetime?: string; // venue-local wall clock, no offset
  on_sale_datetime?: string; // same convention
  title?: string;
  artist?: { name?: string; image_url?: string };
  venue?: {
    name?: string;
    city?: string;
    country?: string;
    latitude?: string;
    longitude?: string;
    timezone?: string;
  };
  offers?: { type?: string; url?: string; status?: string }[];
  sold_out?: boolean;
};

function localToUtc(local: string | undefined, tz: string | null): string | null {
  if (!local) return null;
  // Already carries an offset? Pass through.
  if (/(?:Z|[+-]\d{2}:?\d{2})$/.test(local)) return new Date(local).toISOString();
  const m = local.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  if (!m) return null;
  return zonedWallClockToUtc(m[1], m[2], tz ?? "Europe/London");
}

export function mapBitEvent(artistName: string, ev: BitEvent): FeedEvent | null {
  if (!ev.id) return null;
  const tz = ev.venue?.timezone ?? null;
  const startsAt = localToUtc(ev.datetime, tz);
  if (!startsAt) return null; // undated has no surface in the app

  const ticketOffer = ev.offers?.find((o) => o.type === "Tickets" && o.url);
  return {
    source: "bandsintown",
    externalId: ev.id,
    title: ev.title?.trim() || `${artistName} live`,
    headliner: artistName,
    artistNames: [artistName],
    category: "concert",
    venue: ev.venue?.name
      ? {
          name: ev.venue.name,
          city: ev.venue.city ?? null,
          country: ev.venue.country ?? null,
          lat: ev.venue.latitude ? Number(ev.venue.latitude) : null,
          lng: ev.venue.longitude ? Number(ev.venue.longitude) : null,
        }
      : null,
    startsAt,
    endsAt: null,
    doorsAt: null,
    timezone: tz,
    onSaleAt: localToUtc(ev.on_sale_datetime, tz),
    imageUrl: ev.artist?.image_url ?? null,
    minPriceCents: null,
    maxPriceCents: null,
    currency: "GBP",
    isSoldOut: ev.sold_out === true || ticketOffer?.status === "sold out",
    externalUrl: ev.url ?? null,
    ticketLinks: ticketOffer?.url
      ? [
          {
            provider: "bandsintown",
            label: "Tickets via Bandsintown",
            url: ticketOffer.url,
            minPriceCents: null,
            maxPriceCents: null,
            currency: "GBP",
            isSoldOut: ticketOffer.status === "sold out",
          },
        ]
      : [],
    tags: [],
  };
}

/**
 * "Same gig, two providers" test: same local calendar date in the venue's
 * zone. Pure so it is testable; the sync uses it to attach a Bandsintown
 * ticket link to an existing Ticketmaster row instead of inserting a twin.
 */
export function sameLocalDate(
  aUtcIso: string,
  bUtcIso: string,
  timeZone: string | null,
): boolean {
  const tz = timeZone ?? "Europe/London";
  const fmt = (iso: string) => {
    try {
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: tz,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(iso));
    } catch {
      return iso.slice(0, 10);
    }
  };
  return fmt(aUtcIso) === fmt(bUtcIso);
}
