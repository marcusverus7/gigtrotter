/**
 * Ticketmaster Discovery API v2 -> FeedEvent. PURE: no network, no
 * server-only import — the test runner exercises this directly against a
 * recorded fixture.
 *
 * Field-mapping decisions worth remembering:
 * - `dates.status.code === "cancelled"` drops the event entirely. "offsale"
 *   does NOT mean sold out — it means sales have ended — so sold-out defaults
 *   to false rather than guessing.
 * - A TBA time (`timeTBA`/`noSpecificTime`) still gets an instant: 19:00 in
 *   the venue's own zone, tagged `time_tba`, because an event with a null
 *   start never surfaces anywhere in the app.
 * - Prices arrive in major units; the app stores minor units everywhere.
 */

import type { EventCategory } from "@/lib/supabase/types";

import type { FeedEvent } from "@/lib/events/feed-types";

// The subset of the Discovery API response we actually read. Deliberately
// loose (everything optional): provider payloads drift, and a missing field
// must degrade to null, not throw.
export type TmEvent = {
  id?: string;
  name?: string;
  url?: string;
  dates?: {
    start?: { dateTime?: string; localDate?: string; timeTBA?: boolean; noSpecificTime?: boolean };
    end?: { dateTime?: string };
    doors?: { dateTime?: string };
    timezone?: string;
    status?: { code?: string };
  };
  sales?: { public?: { startDateTime?: string } };
  priceRanges?: { min?: number; max?: number; currency?: string }[];
  images?: { url?: string; ratio?: string; width?: number }[];
  classifications?: {
    segment?: { name?: string };
    genre?: { name?: string };
    subGenre?: { name?: string };
  }[];
  _embedded?: {
    venues?: {
      name?: string;
      city?: { name?: string };
      country?: { countryCode?: string };
      location?: { latitude?: string; longitude?: string };
      timezone?: string;
    }[];
    attractions?: { name?: string }[];
  };
};

export type TmPage = {
  _embedded?: { events?: TmEvent[] };
  page?: { totalPages?: number; number?: number };
};

/** Major units -> integer minor units; null on anything unparseable. */
export function toMinorUnits(major: number | undefined | null): number | null {
  if (typeof major !== "number" || !Number.isFinite(major)) return null;
  return Math.round(major * 100);
}

/**
 * A wall-clock time in an IANA zone -> UTC ISO instant.
 *
 * Node has no zone-aware constructor, so this uses the standard two-step:
 * format a first-guess instant in the target zone, measure how far off the
 * wall clock landed, and correct by the difference. Exact for every real
 * offset (including 30/45-minute zones); only pathological inputs inside a
 * DST gap can be a step off, which for "19:00 on a gig date" does not occur.
 */
export function zonedWallClockToUtc(
  localDate: string, // YYYY-MM-DD
  localTime: string, // HH:mm
  timeZone: string,
): string | null {
  const [y, m, d] = localDate.split("-").map(Number);
  const [hh, mm] = localTime.split(":").map(Number);
  if ([y, m, d, hh, mm].some((n) => !Number.isFinite(n))) return null;
  try {
    const guess = Date.UTC(y, m - 1, d, hh, mm);
    const dtf = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    const parts = Object.fromEntries(
      dtf.formatToParts(new Date(guess)).map((p) => [p.type, p.value]),
    );
    const asIf = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
    );
    return new Date(guess - (asIf - guess)).toISOString();
  } catch {
    return null; // unknown zone
  }
}

export function categoriseTm(ev: TmEvent): EventCategory {
  const c = ev.classifications?.[0];
  const segment = c?.segment?.name?.toLowerCase() ?? "";
  const genre = c?.genre?.name?.toLowerCase() ?? "";
  if (segment === "music") return genre.includes("festival") ? "festival" : "concert";
  if (segment === "arts & theatre") return genre.includes("comedy") ? "comedy" : "theatre";
  if (segment === "sports") return "sport";
  if (genre.includes("comedy")) return "comedy";
  return "other";
}

export function pickTmImage(ev: TmEvent): string | null {
  const images = ev.images ?? [];
  const wide = images
    .filter((i) => i.ratio === "16_9" && i.url)
    .sort((a, b) => (b.width ?? 0) - (a.width ?? 0));
  return wide[0]?.url ?? images.find((i) => i.url)?.url ?? null;
}

/** One event; null when it should be skipped (cancelled or hopeless). */
export function mapTmEvent(ev: TmEvent): FeedEvent | null {
  if (!ev.id || !ev.name) return null;
  if (ev.dates?.status?.code === "cancelled") return null;

  const tz = ev.dates?.timezone ?? ev._embedded?.venues?.[0]?.timezone ?? null;
  const tags: string[] = [];

  let startsAt = ev.dates?.start?.dateTime ?? null;
  if (!startsAt && ev.dates?.start?.localDate) {
    // Date known, time not announced. 19:00 local is a placeholder the UI can
    // live with; the tag records that it is one.
    startsAt = zonedWallClockToUtc(ev.dates.start.localDate, "19:00", tz ?? "Europe/London");
    if (startsAt) tags.push("time_tba");
  }

  const c = ev.classifications?.[0];
  for (const name of [c?.genre?.name, c?.subGenre?.name]) {
    const t = name?.toLowerCase().trim();
    if (t && t !== "undefined" && t !== "other" && !tags.includes(t)) tags.push(t);
  }

  const venueRaw = ev._embedded?.venues?.[0];
  const price = ev.priceRanges?.[0];
  const currency = price?.currency ?? "GBP";
  const minPriceCents = toMinorUnits(price?.min);
  const maxPriceCents = toMinorUnits(price?.max);
  const artistNames = (ev._embedded?.attractions ?? [])
    .map((a) => a.name)
    .filter((n): n is string => !!n);

  return {
    source: "ticketmaster",
    externalId: ev.id,
    title: ev.name,
    headliner: artistNames[0] ?? null,
    artistNames,
    category: categoriseTm(ev),
    venue: venueRaw?.name
      ? {
          name: venueRaw.name,
          city: venueRaw.city?.name ?? null,
          country: venueRaw.country?.countryCode ?? null,
          lat: venueRaw.location?.latitude ? Number(venueRaw.location.latitude) : null,
          lng: venueRaw.location?.longitude ? Number(venueRaw.location.longitude) : null,
        }
      : null,
    startsAt,
    endsAt: ev.dates?.end?.dateTime ?? null,
    doorsAt: ev.dates?.doors?.dateTime ?? null,
    timezone: tz,
    onSaleAt: ev.sales?.public?.startDateTime ?? null,
    imageUrl: pickTmImage(ev),
    minPriceCents,
    maxPriceCents,
    currency,
    isSoldOut: false,
    externalUrl: ev.url ?? null,
    ticketLinks: ev.url
      ? [
          {
            provider: "ticketmaster",
            label: "Buy on Ticketmaster",
            url: ev.url,
            minPriceCents,
            maxPriceCents,
            currency,
            isSoldOut: false,
          },
        ]
      : [],
    tags,
  };
}

export function mapTmPage(page: TmPage): FeedEvent[] {
  return (page._embedded?.events ?? [])
    .map(mapTmEvent)
    .filter((e): e is FeedEvent => e !== null);
}
