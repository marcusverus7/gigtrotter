/**
 * Skiddle events API → FeedEvent. PURE — fixture-tested.
 *
 * Skiddle covers the grassroots and club tier Ticketmaster under-indexes.
 * `date` + `starttime` are the venue's local wall clock (UK/IE), with no
 * offset, so the same zone conversion the Bandsintown mapper uses applies.
 */

import type { FeedEvent } from "@/lib/events/feed-types";
import { zonedWallClockToUtc } from "@/lib/events/ticketmaster/map";

export type SkiddleEvent = {
  id?: string;
  eventname?: string;
  date?: string; // yyyy-mm-dd
  starttime?: string; // HH:mm:ss
  endtime?: string;
  openingtimes?: { doorsopen?: string; lastentry?: string };
  description?: string;
  link?: string;
  imageurl?: string;
  largeimageurl?: string;
  entryprice?: string; // "£12.50" or "12.50" or "Free"
  goingtosell?: boolean;
  tickets?: boolean;
  EventCode?: string; // LIVE, CLUB, FEST, COMEDY, THEATRE ...
  artists?: Array<{ name?: string }>;
  venue?: {
    id?: number;
    name?: string;
    town?: string;
    country?: string; // "GB"
    latitude?: number | string;
    longitude?: number | string;
  };
};

export function parseSkiddlePrice(v: string | null | undefined): number | null {
  if (!v) return null;
  const m = /(\d+(?:\.\d{1,2})?)/.exec(v.replace(/,/g, ""));
  return m ? Math.round(parseFloat(m[1]) * 100) : null;
}

export function categoriseSkiddle(code: string | undefined): FeedEvent["category"] {
  switch ((code ?? "").toUpperCase()) {
    case "FEST":
      return "festival";
    case "CLUB":
      return "club_night";
    case "COMEDY":
      return "comedy";
    case "THEATRE":
      return "theatre";
    case "LIVE":
      return "concert";
    default:
      return "other";
  }
}

export function mapSkiddleEvent(ev: SkiddleEvent, tz = "Europe/London"): FeedEvent | null {
  if (!ev.id || !ev.eventname || !ev.date) return null;
  const time = (ev.starttime ?? "19:00:00").slice(0, 5);
  const startsAt = zonedWallClockToUtc(ev.date, time, tz);
  if (!startsAt) return null;
  const doors = ev.openingtimes?.doorsopen ? zonedWallClockToUtc(ev.date, ev.openingtimes.doorsopen.slice(0, 5), tz) : null;
  const artistNames = (ev.artists ?? []).map((a) => a.name?.trim()).filter((n): n is string => !!n);
  const minPrice = parseSkiddlePrice(ev.entryprice);
  const soldOut = ev.tickets === false && ev.goingtosell === false;
  return {
    source: "skiddle",
    externalId: String(ev.id),
    title: ev.eventname.trim(),
    headliner: artistNames[0] ?? null,
    artistNames,
    category: categoriseSkiddle(ev.EventCode),
    venue: ev.venue?.name
      ? {
          name: ev.venue.name,
          city: ev.venue.town ?? null,
          country: ev.venue.country ?? "GB",
          lat: ev.venue.latitude != null ? Number(ev.venue.latitude) : null,
          lng: ev.venue.longitude != null ? Number(ev.venue.longitude) : null,
        }
      : null,
    startsAt,
    endsAt: null,
    doorsAt: doors,
    timezone: tz,
    onSaleAt: null,
    imageUrl: ev.largeimageurl ?? ev.imageurl ?? null,
    minPriceCents: minPrice,
    maxPriceCents: null,
    currency: "GBP",
    isSoldOut: soldOut,
    externalUrl: ev.link ?? null,
    ticketLinks: ev.link
      ? [{ provider: "skiddle", label: "Buy on Skiddle", url: ev.link, minPriceCents: minPrice, maxPriceCents: null, currency: "GBP", isSoldOut: soldOut }]
      : [],
    tags: [],
  };
}
