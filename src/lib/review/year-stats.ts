/**
 * The year-in-review numbers, computed once for the page and the share card.
 *
 * Pure over rows so the PNG route (service client) and the page (session
 * client) cannot drift. Tested in eval/logic.test.ts.
 */

export type ReviewRow = {
  id: string;
  wallet_item_id: string | null;
  kind: string;
  title: string;
  starts_at: string;
  ends_at?: string | null;
  city: string | null;
  country: string | null;
  venue: string | null;
  lat: number | null;
  lng: number | null;
};

export type YearStats = {
  year: number;
  gigs: number;
  flights: number;
  stays: number;
  cities: string[];
  countries: string[];
  km: number;
  topArtist: string | null;
  topArtistCount: number;
  topVenue: string | null;
  /** Hours of live music, assuming a gig with no end time is three hours. */
  liveHours: number;
  /** Busiest month, 0-11, or null. */
  busiestMonth: number | null;
  firstGig: { title: string; date: string } | null;
};

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

const top = (counts: Record<string, number>): [string, number] | null => {
  const list = Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return list[0] ?? null;
};

export function computeYearStats(year: number, rows: ReviewRow[]): YearStats {
  const sorted = [...rows].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const gigsRows = sorted.filter((r) => r.kind === "ticket");

  const artistCounts: Record<string, number> = {};
  const venueCounts: Record<string, number> = {};
  const monthCounts = new Array<number>(12).fill(0);
  let liveMs = 0;
  for (const r of gigsRows) {
    // "Headliner + Support" counts for the headliner.
    const headliner = r.title.split(" + ")[0].trim();
    if (headliner) artistCounts[headliner] = (artistCounts[headliner] ?? 0) + 1;
    if (r.venue) venueCounts[r.venue] = (venueCounts[r.venue] ?? 0) + 1;
    const start = new Date(r.starts_at);
    monthCounts[start.getUTCMonth()] += 1;
    const end = r.ends_at ? new Date(r.ends_at).getTime() : NaN;
    const dur = Number.isFinite(end) && end > start.getTime() ? end - start.getTime() : 3 * 3600_000;
    liveMs += Math.min(dur, 12 * 3600_000);
  }

  const geo = sorted.filter((r) => r.lat != null && r.lng != null);
  let km = 0;
  for (let i = 1; i < geo.length; i++) {
    km += haversineKm(geo[i - 1].lat!, geo[i - 1].lng!, geo[i].lat!, geo[i].lng!);
  }

  const busiest = monthCounts.reduce(
    (best, n, i) => (n > best.n ? { i, n } : best),
    { i: -1, n: 0 },
  );
  const ta = top(artistCounts);
  const tv = top(venueCounts);

  return {
    year,
    gigs: gigsRows.length,
    flights: sorted.filter((r) => r.kind === "flight").length,
    stays: sorted.filter((r) => r.kind === "stay").length,
    cities: [...new Set(sorted.map((r) => r.city).filter((c): c is string => !!c))],
    countries: [...new Set(sorted.map((r) => r.country).filter((c): c is string => !!c))],
    km: Math.round(km),
    topArtist: ta?.[0] ?? null,
    topArtistCount: ta?.[1] ?? 0,
    topVenue: tv?.[0] ?? null,
    liveHours: Math.round(liveMs / 3600_000),
    busiestMonth: busiest.i >= 0 ? busiest.i : null,
    firstGig: gigsRows[0] ? { title: gigsRows[0].title, date: gigsRows[0].starts_at } : null,
  };
}

/** Normalise the PostgREST embed shape into ReviewRow. */
export function toReviewRows(
  experiences: Array<Record<string, unknown>> | null | undefined,
): ReviewRow[] {
  return (experiences ?? []).map((e) => {
    const venuesRaw = e.venues;
    const v = (Array.isArray(venuesRaw) ? venuesRaw[0] : venuesRaw) as {
      name: string | null;
      city: string | null;
      country: string | null;
      lat: number | null;
      lng: number | null;
    } | null;
    return {
      id: String(e.id),
      wallet_item_id: (e.wallet_item_id as string | null) ?? null,
      kind: String(e.kind),
      title: String(e.title),
      starts_at: String(e.starts_at),
      ends_at: (e.ends_at as string | null) ?? null,
      city: v?.city ?? null,
      country: v?.country ?? null,
      venue: v?.name ?? null,
      lat: v?.lat ?? null,
      lng: v?.lng ?? null,
    };
  });
}

export const REVIEW_SELECT =
  "id, wallet_item_id, kind, title, subtitle, starts_at, ends_at, venues(name, city, country, lat, lng)";
