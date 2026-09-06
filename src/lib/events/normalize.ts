/**
 * Small pure helpers the feed uses to compare and tidy provider data.
 * No `server-only` — tested from eval/logic.test.ts.
 */

import { SWEEP_CITIES } from "@/lib/events/cities";

/**
 * "Fontaines D.C." / "fontaines dc" / "FONTAINES D.C" -> "fontainesdc".
 * Loose enough that two providers' spellings of one act collide, strict
 * enough that "IDLES" and "Idlewild" do not.
 */
export function normalizeName(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]/g, "");
}

/** Same city, allowing "Newcastle upon Tyne" vs "Newcastle", "Kentish Town, London" vs "London". */
export function sameCity(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = normalizeName(a);
  const y = normalizeName(b);
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
}

const CENTROIDS = SWEEP_CITIES.map((c) => ({ key: normalizeName(c.name), lat: c.lat, lng: c.lng }));

/**
 * City-centroid coordinates for the anonymous board's city-fuzzed pins.
 *
 * The venues table keeps two coordinate pairs on purpose: the venue itself
 * (lat/lng) and the CITY (city_lat/city_lng), because the public /b/<handle>
 * board shows the city pair only — "I was in Manchester" rather than "I was
 * at this exact building". A feed venue outside our sweep list gets null,
 * never the venue's own coordinates.
 */
export function cityCentroid(
  city: string | null | undefined,
): { lat: number; lng: number } | null {
  const key = normalizeName(city);
  if (!key) return null;
  const exact = CENTROIDS.find((c) => c.key === key);
  if (exact) return { lat: exact.lat, lng: exact.lng };
  // "newcastleupontyne" starts with "newcastle"; prefer the longest match.
  const loose = CENTROIDS.filter((c) => key.startsWith(c.key)).sort(
    (a, b) => b.key.length - a.key.length,
  )[0];
  return loose ? { lat: loose.lat, lng: loose.lng } : null;
}

const COUNTRY_NAMES: Record<string, string> = {
  "united kingdom": "GB",
  uk: "GB",
  "great britain": "GB",
  england: "GB",
  scotland: "GB",
  wales: "GB",
  "northern ireland": "GB",
  ireland: "IE",
  "republic of ireland": "IE",
  "united states": "US",
  usa: "US",
  "united states of america": "US",
  france: "FR",
  germany: "DE",
  spain: "ES",
  netherlands: "NL",
  "the netherlands": "NL",
  belgium: "BE",
  italy: "IT",
  portugal: "PT",
  denmark: "DK",
  sweden: "SE",
  norway: "NO",
  australia: "AU",
  canada: "CA",
};

/**
 * Ticketmaster sends ISO-2 ("GB"); Bandsintown sends a name ("United
 * Kingdom"). Store ISO-2 everywhere so one venue is one row and the detail
 * page can render a proper name with countryName().
 */
export function toCountryCode(v: string | null | undefined): string | null {
  if (!v) return null;
  const t = v.trim();
  if (!t) return null;
  if (/^[A-Za-z]{2}$/.test(t)) return t.toUpperCase();
  return COUNTRY_NAMES[t.toLowerCase()] ?? t;
}

/** "GB" -> "United Kingdom"; anything that is not a code is returned as-is. */
export function countryName(code: string | null | undefined): string | null {
  if (!code) return null;
  if (!/^[A-Z]{2}$/.test(code)) return code;
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

/**
 * Bandsintown's /artists/{name} path needs a SECOND round of encoding for
 * the characters its router would otherwise treat structurally: "/" as
 * %252F, "?" as %253F, "*" as %252A and a double quote as %27C. A single
 * encodeURIComponent("AC/DC") reaches the server as a path separator and
 * 404s, which the sync reads as "unknown artist".
 */
export function bandsintownArtistPath(name: string): string {
  return encodeURIComponent(name)
    .replace(/%2F/gi, "%252F")
    .replace(/%3F/gi, "%253F")
    .replace(/%2A/gi, "%252A")
    .replace(/%22/g, "%27C");
}

/** Matches the zod bound in src/features/follows/actions.ts. */
export const MAX_FOLLOW_NAME = 120;

/**
 * Keep one spelling per act. Follows are user-typed, so "IDLES" and "idles"
 * both exist; Bandsintown's lookup is case-insensitive, and two spellings
 * would return the same event ids twice — which Postgres rejects inside one
 * upsert ("command cannot affect row a second time"), losing the batch.
 */
export function dedupeNames(names: string[]): string[] {
  const seen = new Map<string, string>();
  for (const n of names) {
    const t = n.trim();
    // The 120-char bound lives in the follow server action, but the anon key
    // ships in the client bundle by design, so a signed-in user can POST
    // straight to /rest/v1/follows and store a multi-kilobyte name. These
    // strings go into a URL path and into PostgREST array filters, so the
    // bound is re-applied here rather than trusted. Migration 0025 adds the
    // matching check constraint so the database enforces it too.
    if (!t || t.length > MAX_FOLLOW_NAME) continue;
    const k = normalizeName(t);
    if (k && !seen.has(k)) seen.set(k, t);
  }
  return [...seen.values()];
}

/**
 * Collapse the whitespace providers leave on names.
 *
 * Ticketmaster returns " London", "Belfast " and "Todmorden " alongside the
 * clean spellings — 96 events across 14 city names in the first two sweeps.
 * Every one of those is a second, separate value: it splits the city chips,
 * and clicking the clean chip silently misses the padded rows, because
 * `.ilike` is an exact match once the wildcards are gone.
 */
export function cleanText(v: string | null | undefined): string | null {
  const t = (v ?? "").replace(/\s+/g, " ").trim();
  return t || null;
}
