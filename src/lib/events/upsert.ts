import "server-only";

import { createServiceClient } from "@/lib/supabase/server";
import type { FeedEvent } from "@/lib/events/feed-types";

/**
 * FeedEvent[] -> database. Idempotent by construction: events upsert on the
 * (source, external_id) unique index, so re-running a sync updates rows
 * instead of duplicating them.
 *
 * Everything here runs on the SERVICE client deliberately: `venues` allows no
 * client writes at all (the silent-RLS lesson this repo keeps re-learning),
 * and synced events must land with status='approved', which the promoter
 * policies would refuse. This module must therefore never be reachable from a
 * user-driven request — only the cron route calls it, behind CRON_SECRET.
 */

type Service = ReturnType<typeof createServiceClient>;

export type UpsertResult = { upserted: number; skipped: number; errors: number; firstError: string | null };

/** Venue lookup/insert with a per-run cache so a sweep isn't O(events) queries. */
async function venueIdFor(
  service: Service,
  cache: Map<string, string | null>,
  venue: NonNullable<FeedEvent["venue"]>,
): Promise<string | null> {
  const key = `${venue.name.toLowerCase()}|${(venue.city ?? "").toLowerCase()}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;

  const { data: existing } = await service
    .from("venues")
    .select("id")
    .ilike("name", venue.name)
    .ilike("city", venue.city ?? "")
    .limit(1)
    .maybeSingle();
  if (existing) {
    cache.set(key, existing.id);
    return existing.id;
  }

  const { data: created, error } = await service
    .from("venues")
    .insert({
      name: venue.name,
      city: venue.city,
      country: venue.country,
      lat: venue.lat,
      lng: venue.lng,
      city_lat: venue.lat,
      city_lng: venue.lng,
    })
    .select("id")
    .single();
  if (error) {
    console.error("[feed] venue insert failed:", venue.name, error.message);
    cache.set(key, null);
    return null;
  }
  cache.set(key, created.id);
  return created.id;
}

export async function upsertFeedEvents(events: FeedEvent[]): Promise<UpsertResult> {
  const service = createServiceClient();
  const venueCache = new Map<string, string | null>();
  const now = new Date().toISOString();
  let upserted = 0;
  let skipped = 0;
  let errors = 0;
  let firstError: string | null = null;

  // Venue resolution first (sequential is fine: the cache collapses repeats,
  // and a sweep has far fewer distinct venues than events).
  const rows = [] as { row: Record<string, unknown>; ev: FeedEvent }[];
  for (const ev of events) {
    if (!ev.startsAt) {
      skipped += 1; // undated events have no surface in the app
      continue;
    }
    const venueId = ev.venue ? await venueIdFor(service, venueCache, ev.venue) : null;
    rows.push({
      ev,
      row: {
        source: ev.source,
        external_id: ev.externalId,
        title: ev.title,
        headliner: ev.headliner,
        artist_names: ev.artistNames,
        category: ev.category,
        venue_id: venueId,
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
      },
    });
  }

  // Events in batches of 100 on the (source, external_id) index.
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100);
    const { data, error } = await service
      .from("events")
      .upsert(batch.map((b) => b.row) as never, { onConflict: "source,external_id" })
      .select("id, external_id");
    if (error) {
      errors += batch.length;
      firstError ??= error.message;
      continue;
    }
    upserted += data?.length ?? 0;

    // Ticket links: replace this provider's links per event. Delete+insert is
    // the simplest idempotency and the table is tiny.
    const idByExternal = new Map((data ?? []).map((r) => [r.external_id, r.id]));
    for (const { ev } of batch) {
      const eventId = idByExternal.get(ev.externalId);
      if (!eventId || ev.ticketLinks.length === 0) continue;
      const { error: delErr } = await service
        .from("event_ticket_links")
        .delete()
        .eq("event_id", eventId)
        .eq("provider", ev.source)
        .select("id");
      if (delErr) {
        errors += 1;
        firstError ??= delErr.message;
        continue;
      }
      const { error: insErr } = await service.from("event_ticket_links").insert(
        ev.ticketLinks.map((l, idx) => ({
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
        })),
      );
      if (insErr) {
        errors += 1;
        firstError ??= insErr.message;
      }
    }
  }

  return { upserted, skipped, errors, firstError };
}
