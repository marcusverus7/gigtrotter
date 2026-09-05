import "server-only";

import { serverEnv } from "@/lib/env";
import { createServiceClient } from "@/lib/supabase/server";
import { mapBitEvent, sameLocalDate, type BitEvent } from "@/lib/events/bandsintown/map";
import type { FeedEvent } from "@/lib/events/feed-types";
import {
  bandsintownArtistPath,
  dedupeNames,
  normalizeName,
  sameCity,
} from "@/lib/events/normalize";
import { upsertFeedEvents } from "@/lib/events/upsert";
import { pgTextArray } from "@/lib/supabase/filters";

/**
 * Bandsintown sync: dates for artists people actually follow.
 *
 * Follow-driven rather than a sweep — the public API is per-artist, and the
 * point of this provider is tour announcements for YOUR artists, which is
 * what powers the tour_announce alert. A 404 means Bandsintown does not know
 * the artist; normal for local acts, skipped quietly.
 *
 * Budget: this runs in the same 300s function as the Ticketmaster sweep, so
 * everything here is bounded — artists per run, twin lookups per run — and
 * anything truncated is written into feed_sync_runs.notes rather than lost.
 */

const MAX_ARTISTS_PER_RUN = 200;
const MAX_TWIN_LOOKUPS_PER_RUN = 150;
const CALL_GAP_MS = 150;
const REQUEST_TIMEOUT_MS = 15_000;
const TWIN_WINDOW_MS = 36 * 3600 * 1000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Service = ReturnType<typeof createServiceClient>;

type TmRow = {
  id: string;
  starts_at: string | null;
  timezone: string | null;
  venue_city: string | null;
  artist_names: string[] | null;
};

export async function syncBandsintown() {
  const service = createServiceClient();
  const { data: run } = await service
    .from("feed_sync_runs")
    .insert({ source: "bandsintown" })
    .select("id")
    .single();

  let apiCalls = 0;
  let upserted = 0;
  let skipped = 0;
  let errors = 0;
  const noteParts: string[] = [];
  let firstError: string | null = null;

  try {
    const { data: follows } = await service
      .from("follows")
      .select("name")
      .eq("kind", "artist")
      .order("name", { ascending: true })
      .limit(1000);
    const allArtists = dedupeNames((follows ?? []).map((f) => f.name));

    // More followed acts than one run can afford: rotate by day so every act
    // is refreshed within a few nights, and say so in the run row.
    let artists = allArtists;
    if (allArtists.length > MAX_ARTISTS_PER_RUN) {
      const pages = Math.ceil(allArtists.length / MAX_ARTISTS_PER_RUN);
      const page = Math.floor(Date.now() / 86_400_000) % pages;
      artists = allArtists.slice(page * MAX_ARTISTS_PER_RUN, (page + 1) * MAX_ARTISTS_PER_RUN);
      noteParts.push(`artist cap: ${allArtists.length} followed, page ${page + 1}/${pages}`);
    }

    const freshById = new Map<string, FeedEvent>();
    for (const artist of artists) {
      try {
        apiCalls += 1;
        const res = await fetch(
          `https://rest.bandsintown.com/artists/${bandsintownArtistPath(artist)}/events?app_id=${encodeURIComponent(serverEnv.bandsintownAppId)}&date=upcoming`,
          { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS), cache: "no-store" },
        );
        if (res.status === 404) continue; // unknown artist — normal
        if (!res.ok) {
          errors += 1;
          firstError ??= `bandsintown ${res.status} for ${artist}`;
          continue;
        }
        const body = (await res.json()) as BitEvent[] | { errorMessage?: string };
        if (!Array.isArray(body)) continue;
        for (const ev of body) {
          const mapped = mapBitEvent(artist, ev);
          // Two follows can spell one act two ways; the API returns the same
          // ids for both, and one upsert cannot touch a row twice.
          if (mapped && !freshById.has(mapped.externalId)) freshById.set(mapped.externalId, mapped);
        }
      } catch (err) {
        errors += 1;
        firstError ??= err instanceof Error ? err.message : String(err);
      } finally {
        await sleep(CALL_GAP_MS);
      }
    }
    const fresh = [...freshById.values()];

    // Cross-provider dedupe: when Ticketmaster already lists the same act on
    // the same local date in the same city, attach a Bandsintown ticket link
    // to that row instead of inserting a twin card.
    const { twins, lookups, capped } = await findTicketmasterTwins(service, fresh);
    if (capped) noteParts.push(`twin lookups capped at ${MAX_TWIN_LOOKUPS_PER_RUN} (${lookups} run)`);

    const toInsert: FeedEvent[] = [];
    for (const ev of fresh) {
      const twin = twins.get(ev.externalId);
      if (!twin) {
        toInsert.push(ev);
        continue;
      }
      skipped += 1;
      const link = ev.ticketLinks[0];
      if (!link) continue;
      const { error: delErr } = await service
        .from("event_ticket_links")
        .delete()
        .eq("event_id", twin)
        .eq("provider", "bandsintown")
        .select("id");
      if (delErr) {
        errors += 1;
        firstError ??= delErr.message;
        continue;
      }
      const { error: insErr } = await service.from("event_ticket_links").insert({
        event_id: twin,
        provider: "bandsintown",
        provider_label: link.label,
        url: link.url,
        currency: link.currency,
        is_sold_out: link.isSoldOut,
        is_affiliate: false,
        sort_order: 10,
      });
      if (insErr) {
        errors += 1;
        firstError ??= insErr.message;
      }
    }

    const result = await upsertFeedEvents(toInsert);
    upserted = result.upserted;
    skipped += result.skipped;
    errors += result.errors;
    firstError ??= result.firstError;
  } catch (err) {
    errors += 1;
    firstError = err instanceof Error ? err.message : String(err);
  } finally {
    if (run?.id) {
      const notes = [firstError, ...noteParts].filter(Boolean).join("; ") || null;
      await service
        .from("feed_sync_runs")
        .update({
          finished_at: new Date().toISOString(),
          api_calls: apiCalls,
          upserted,
          skipped,
          errors,
          notes,
        })
        .eq("id", run.id)
        .select("id");
    }
  }

  const notes = [firstError, ...noteParts].filter(Boolean).join("; ") || null;
  return { runId: run?.id ?? null, apiCalls, upserted, skipped, errors, notes };
}

/**
 * Bandsintown event id -> Ticketmaster event id for every gig both list.
 *
 * One query per ACT rather than per event: Ticketmaster rows whose
 * artist_names overlap the act's spellings, inside the span of that act's
 * dates. Matching is then done in code with the loose comparators — the
 * database's array containment is exact and case-sensitive, and "fontaines
 * dc" typed by a follower never equalled Ticketmaster's "Fontaines D.C.".
 * The overlap filter itself sees both the canonical name the API returned
 * and the name the follower typed, so a case difference between providers
 * still finds the candidate rows.
 */
async function findTicketmasterTwins(
  service: Service,
  fresh: FeedEvent[],
): Promise<{ twins: Map<string, string>; lookups: number; capped: boolean }> {
  const twins = new Map<string, string>();
  const byAct = new Map<string, FeedEvent[]>();
  for (const ev of fresh) {
    if (!ev.headliner || !ev.startsAt) continue;
    const key = normalizeName(ev.headliner);
    const list = byAct.get(key) ?? [];
    list.push(ev);
    byAct.set(key, list);
  }

  let lookups = 0;
  let capped = false;
  for (const [actKey, events] of byAct) {
    if (lookups >= MAX_TWIN_LOOKUPS_PER_RUN) {
      capped = true;
      break;
    }
    lookups += 1;
    const times = events.map((e) => new Date(e.startsAt!).getTime());
    const spellings = [...new Set(events.flatMap((e) => e.artistNames))];
    const { data } = await service
      .from("events")
      .select("id, starts_at, timezone, venue_city, artist_names")
      .eq("source", "ticketmaster")
      .overlaps("artist_names", pgTextArray(spellings))
      .gte("starts_at", new Date(Math.min(...times) - TWIN_WINDOW_MS).toISOString())
      .lte("starts_at", new Date(Math.max(...times) + TWIN_WINDOW_MS).toISOString())
      .limit(200);
    const rows = ((data ?? []) as TmRow[]).filter((r) =>
      (r.artist_names ?? []).some((n) => normalizeName(n) === actKey),
    );
    for (const ev of events) {
      const hit = rows.find(
        (r) =>
          r.starts_at &&
          sameLocalDate(r.starts_at, ev.startsAt!, r.timezone ?? ev.timezone) &&
          (sameCity(r.venue_city, ev.venue?.city) || !r.venue_city || !ev.venue?.city),
      );
      if (hit) twins.set(ev.externalId, hit.id);
    }
  }
  return { twins, lookups, capped };
}
