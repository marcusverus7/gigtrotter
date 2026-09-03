import "server-only";

import { createServiceClient } from "@/lib/supabase/server";
import type { FeedEvent } from "@/lib/events/feed-types";

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
 * (the silent-RLS lesson), and synced events land status='approved', which the
 * promoter policies would refuse. Only the cron route may call this, behind
 * CRON_SECRET.
 */

type Service = ReturnType<typeof createServiceClient>;

export type UpsertResult = {
  upserted: number;
  skipped: number;
  errors: number;
  firstError: string | null;
};

const venueKey = (name: string, city: string | null | undefined) =>
  `${name.trim().toLowerCase()}|${(city ?? "").trim().toLowerCase()}`;

/**
 * Resolve every distinct venue in one preload plus one bulk insert.
 * The venues table is small (hundreds of rows), so loading name/city/id once
 * beats thousands of point lookups by orders of magnitude.
 */
async function resolveVenues(
  service: Service,
  events: FeedEvent[],
): Promise<{ ids: Map<string, string>; error: string | null }> {
  const ids = new Map<string, string>();

  const wanted = new Map<string, NonNullable<FeedEvent["venue"]>>();
  for (const ev of events) {
    if (ev.venue?.name) wanted.set(venueKey(ev.venue.name, ev.venue.city), ev.venue);
  }
  if (wanted.size === 0) return { ids, error: null };

  const { data: existing, error: loadErr } = await service
    .from("venues")
    .select("id, name, city")
    .limit(10_000);
  if (loadErr) return { ids, error: loadErr.message };
  for (const v of existing ?? []) {
    ids.set(venueKey(v.name, v.city), v.id);
  }

  const missing = [...wanted.entries()].filter(([key]) => !ids.has(key));
  for (let i = 0; i < missing.length; i += 100) {
    const batch = missing.slice(i, i + 100);
    const { data: created, error } = await service
      .from("venues")
      .insert(
        batch.map(([, v]) => ({
          name: v.name,
          city: v.city,
          country: v.country,
          lat: v.lat,
          lng: v.lng,
          city_lat: v.lat,
          city_lng: v.lng,
        })),
      )
      .select("id, name, city");
    if (error) return { ids, error: error.message };
    for (const v of created ?? []) ids.set(venueKey(v.name, v.city), v.id);
  }

  return { ids, error: null };
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
  if (venueError) firstError = venueError;

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
          venue_name: ev.venue?.name ?? null,
          venue_city: ev.venue?.city ?? null,
          venue_country: ev.venue?.country ?? null,
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
          status: "approved",
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

    // Ticket links, batch-wide: one delete for every event in the batch that
    // has links from this provider, one insert for all of them.
    const idByExternal = new Map((data ?? []).map((r) => [r.external_id, r.id]));
    const linkRows: Record<string, unknown>[] = [];
    const eventIdsWithLinks: string[] = [];
    for (const ev of batch) {
      const eventId = idByExternal.get(ev.externalId);
      if (!eventId || ev.ticketLinks.length === 0) continue;
      eventIdsWithLinks.push(eventId);
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
    if (eventIdsWithLinks.length > 0) {
      const provider = batch[0].source;
      const { error: delErr } = await service
        .from("event_ticket_links")
        .delete()
        .in("event_id", eventIdsWithLinks)
        .eq("provider", provider)
        .select("id");
      if (delErr) {
        errors += 1;
        firstError ??= delErr.message;
      } else {
        const { error: insErr } = await service
          .from("event_ticket_links")
          .insert(linkRows as never);
        if (insErr) {
          errors += 1;
          firstError ??= insErr.message;
        }
      }
    }
  }

  return { upserted, skipped, errors, firstError };
}
