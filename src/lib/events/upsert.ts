import "server-only";

import { createServiceClient } from "@/lib/supabase/server";
import type { FeedEvent } from "@/lib/events/feed-types";
import { cityCentroid, cleanText, toCountryCode } from "@/lib/events/normalize";

/**
 * FeedEvent[] -> database. Idempotent: events upsert on the
 * (source, external_id) unique index, so re-running updates rather than
 * duplicates.
 *
 * Shaped by the first production run, which timed the function out: a sweep
 * returns ~5,500 events, and anything per-event (a venue lookup, a ticket-link
 * delete+insert) turns into five figures of sequential round trips. Everything
 * here is therefore batch-first — venues are preloaded once and inserted in
 * bulk, ticket links are replaced with one delete and one insert per BATCH,
 * never per event. A full first-time sweep is ~60 queries, not ~12,000.
 *
 * Service client throughout, deliberately: `venues` allows no client writes
 * (the silent-RLS lesson), and synced events land status='approved' by column
 * default, which the promoter policies would refuse. Only the cron route may
 * call this, behind CRON_SECRET.
 *
 * Two things the payload deliberately does NOT carry:
 *
 * - `status`. New rows take the column default ('approved'); existing rows
 *   keep whatever they have, so an admin's rejection of a synced event is
 *   not undone by the next night's sweep.
 * - The venue's own coordinates in `city_lat`/`city_lng`. Those columns feed
 *   the anonymous public board, which is city-fuzzed on purpose.
 */

type Service = ReturnType<typeof createServiceClient>;

export type UpsertResult = {
  upserted: number;
  skipped: number;
  errors: number;
  firstError: string | null;
};

const venueKey = (name: string, city: string | null | undefined) =>
  `${(cleanText(name) ?? "").toLowerCase()}|${(cleanText(city) ?? "").toLowerCase()}`;

/** PostgREST returns at most this many rows per request (Supabase max-rows). */
const PAGE = 1000;

/**
 * Resolve every distinct venue: one paged preload, one bulk insert of the
 * missing ones, one lookup for anything a concurrent run inserted first.
 *
 * The preload is PAGED because `.limit(10_000)` silently returns the first
 * 1,000 rows — Supabase caps a PostgREST page at 1,000 — and every venue
 * beyond that would have looked "missing", been re-inserted, tripped the
 * unique (name, city, country) constraint and failed the whole batch. The
 * table passed 600 rows after two sweeps.
 */
async function resolveVenues(
  service: Service,
  events: FeedEvent[],
): Promise<{ ids: Map<string, string>; error: string | null }> {
  const ids = new Map<string, string>();
  let firstError: string | null = null;

  const wanted = new Map<string, NonNullable<FeedEvent["venue"]>>();
  for (const ev of events) {
    if (ev.venue?.name) wanted.set(venueKey(ev.venue.name, ev.venue.city), ev.venue);
  }
  if (wanted.size === 0) return { ids, error: null };

  for (let from = 0; ; from += PAGE) {
    const { data, error } = await service
      .from("venues")
      .select("id, name, city")
      .order("created_at", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) return { ids, error: error.message };
    for (const v of data ?? []) ids.set(venueKey(v.name, v.city), v.id);
    if (!data || data.length < PAGE) break;
  }

  const missing = [...wanted.entries()].filter(([key]) => !ids.has(key));
  for (let i = 0; i < missing.length; i += 100) {
    const batch = missing.slice(i, i + 100);
    // ignoreDuplicates: a manual trigger overlapping the nightly cron must not
    // fail the batch on the unique constraint — the row exists, that is fine.
    const { data: created, error } = await service
      .from("venues")
      .upsert(
        batch.map(([, v]) => {
          const centroid = cityCentroid(v.city);
          return {
            name: cleanText(v.name) ?? v.name,
            city: cleanText(v.city),
            country: toCountryCode(cleanText(v.country)),
            lat: v.lat,
            lng: v.lng,
            city_lat: centroid?.lat ?? null,
            city_lng: centroid?.lng ?? null,
          };
        }),
        { onConflict: "name,city,country", ignoreDuplicates: true },
      )
      .select("id, name, city");
    if (error) {
      firstError ??= `venues: ${error.message}`;
      continue; // the lookup below still resolves what it can
    }
    for (const v of created ?? []) ids.set(venueKey(v.name, v.city), v.id);
  }

  // Rows skipped as duplicates come back without ids; look them up by name.
  const unresolved = missing.filter(([key]) => !ids.has(key));
  for (let i = 0; i < unresolved.length; i += 200) {
    const names = [...new Set(unresolved.slice(i, i + 200).map(([, v]) => v.name))];
    const { data } = await service.from("venues").select("id, name, city").in("name", names);
    for (const v of data ?? []) {
      const key = venueKey(v.name, v.city);
      if (!ids.has(key)) ids.set(key, v.id);
    }
  }

  return { ids, error: firstError };
}

export async function upsertFeedEvents(events: FeedEvent[]): Promise<UpsertResult> {
  const service = createServiceClient();
  const now = new Date().toISOString();
  let upserted = 0;
  let skipped = 0;
  let errors = 0;
  let firstError: string | null = null;

  const dated = events.filter((ev) => {
    if (ev.startsAt) return true;
    skipped += 1; // undated events have no surface in the app
    return false;
  });

  const { ids: venueIds, error: venueError } = await resolveVenues(service, dated);
  if (venueError) {
    errors += 1;
    firstError = venueError;
  }

  for (let i = 0; i < dated.length; i += 100) {
    const batch = dated.slice(i, i + 100);
    const { data, error } = await service
      .from("events")
      .upsert(
        batch.map((ev) => ({
          source: ev.source,
          external_id: ev.externalId,
          title: ev.title,
          headliner: ev.headliner,
          artist_names: ev.artistNames,
          category: ev.category,
          venue_id: ev.venue?.name
            ? (venueIds.get(venueKey(ev.venue.name, ev.venue.city)) ?? null)
            : null,
          venue_name: cleanText(ev.venue?.name),
          venue_city: cleanText(ev.venue?.city),
          venue_country: toCountryCode(cleanText(ev.venue?.country)),
          lat: ev.venue?.lat ?? null,
          lng: ev.venue?.lng ?? null,
          starts_at: ev.startsAt,
          ends_at: ev.endsAt,
          doors_at: ev.doorsAt,
          timezone: ev.timezone,
          on_sale_at: ev.onSaleAt,
          image_url: ev.imageUrl,
          min_price_cents: ev.minPriceCents,
          max_price_cents: ev.maxPriceCents,
          currency: ev.currency,
          is_sold_out: ev.isSoldOut,
          external_url: ev.externalUrl,
          tags: ev.tags,
          last_seen_at: now,
          updated_at: now,
        })) as never,
        { onConflict: "source,external_id" },
      )
      .select("id, external_id");
    if (error) {
      errors += batch.length;
      firstError ??= error.message;
      continue;
    }
    upserted += data?.length ?? 0;

    // Ticket links, batch-wide: one delete per provider present in the batch,
    // one insert for all of them. Grouped by provider rather than assuming
    // the batch is single-source — both callers happen to pass one source,
    // but a merged call would otherwise leave the second provider's stale
    // links in place and insert duplicates every night.
    const idByExternal = new Map((data ?? []).map((r) => [r.external_id, r.id]));
    const linkRows: Record<string, unknown>[] = [];
    const idsByProvider = new Map<string, string[]>();
    for (const ev of batch) {
      const eventId = idByExternal.get(ev.externalId);
      if (!eventId || ev.ticketLinks.length === 0) continue;
      const list = idsByProvider.get(ev.source) ?? [];
      list.push(eventId);
      idsByProvider.set(ev.source, list);
      for (const [idx, l] of ev.ticketLinks.entries()) {
        linkRows.push({
          event_id: eventId,
          provider: l.provider,
          provider_label: l.label,
          url: l.url,
          min_price_cents: l.minPriceCents,
          max_price_cents: l.maxPriceCents,
          currency: l.currency,
          is_sold_out: l.isSoldOut,
          is_affiliate: false,
          sort_order: idx,
        });
      }
    }
    let deleteFailed = false;
    for (const [provider, eventIds] of idsByProvider) {
      const { error: delErr } = await service
        .from("event_ticket_links")
        .delete()
        .in("event_id", eventIds)
        .eq("provider", provider)
        .select("id");
      if (delErr) {
        deleteFailed = true;
        errors += 1;
        firstError ??= delErr.message;
      }
    }
    if (!deleteFailed && linkRows.length > 0) {
      const { error: insErr } = await service
        .from("event_ticket_links")
        .insert(linkRows as never);
      if (insErr) {
        errors += 1;
        firstError ??= insErr.message;
      }
    }
  }

  return { upserted, skipped, errors, firstError };
}
