import "server-only";

import { SWEEP_CITIES, type SweepCity } from "@/lib/events/cities";
import type { FeedEvent } from "@/lib/events/feed-types";
import { mapTmPage, type TmPage } from "@/lib/events/ticketmaster/map";

/**
 * Paged, rate-limited fetch of the UK+IE sweep from Ticketmaster Discovery.
 *
 * Budget: free tier allows 5,000 calls/day at 5/sec. The sweep is ~43 cities
 * x <=2 pages with a 210ms gap and a hard cap of 400 calls per run — sized so
 * the WHOLE function (sweep + batched upserts + Bandsintown) fits Vercel's
 * 300s ceiling, which the first full run exceeded. Any city failing does not
 * stop the run — it is counted and the sweep continues.
 */

const PAGE_SIZE = 200;
const MAX_PAGES_PER_CITY = 2;
const MAX_CALLS_PER_RUN = 400;
const CALL_GAP_MS = 210;
const REQUEST_TIMEOUT_MS = 15_000;
const RADIUS_KM = 40;
const WINDOW_DAYS = 90;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Discovery rejects fractional seconds: it wants YYYY-MM-DDTHH:mm:ssZ. */
export function tmDateTime(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

export type TmSweepResult = {
  events: FeedEvent[];
  apiCalls: number;
  cityErrors: number;
  firstError: string | null;
  hitCallCap: boolean;
};

async function fetchPage(
  apiKey: string,
  city: SweepCity,
  page: number,
  now: Date,
): Promise<TmPage> {
  const params = new URLSearchParams({
    apikey: apiKey,
    latlong: `${city.lat},${city.lng}`,
    radius: String(RADIUS_KM),
    unit: "km",
    countryCode: city.country,
    classificationName: "Music",
    startDateTime: tmDateTime(now),
    endDateTime: tmDateTime(new Date(now.getTime() + WINDOW_DAYS * 24 * 3600 * 1000)),
    size: String(PAGE_SIZE),
    page: String(page),
    sort: "date,asc",
  });
  const res = await fetch(
    `https://app.ticketmaster.com/discovery/v2/events.json?${params}`,
    { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS), cache: "no-store" },
  );
  if (!res.ok) {
    // The body can carry the key back in an echo; never include it.
    throw new Error(`ticketmaster ${res.status} for ${city.name} p${page}`);
  }
  return (await res.json()) as TmPage;
}

export async function sweepTicketmaster(apiKey: string): Promise<TmSweepResult> {
  const now = new Date();
  const byId = new Map<string, FeedEvent>(); // adjacent cities overlap; dedupe here
  let apiCalls = 0;
  let cityErrors = 0;
  let firstError: string | null = null;
  let hitCallCap = false;

  outer: for (const city of SWEEP_CITIES) {
    for (let page = 0; page < MAX_PAGES_PER_CITY; page++) {
      if (apiCalls >= MAX_CALLS_PER_RUN) {
        hitCallCap = true;
        break outer;
      }
      try {
        apiCalls += 1;
        const data = await fetchPage(apiKey, city, page, now);
        for (const ev of mapTmPage(data)) byId.set(ev.externalId, ev);
        const totalPages = data.page?.totalPages ?? 1;
        if (page + 1 >= totalPages) break;
      } catch (err) {
        cityErrors += 1;
        firstError ??= err instanceof Error ? err.message : String(err);
        break; // next city
      } finally {
        await sleep(CALL_GAP_MS);
      }
    }
  }

  return { events: [...byId.values()], apiCalls, cityErrors, firstError, hitCallCap };
}
