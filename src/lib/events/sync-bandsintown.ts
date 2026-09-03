import "server-only";

import { serverEnv } from "@/lib/env";
import { createServiceClient } from "@/lib/supabase/server";
import { mapBitEvent, sameLocalDate, type BitEvent } from "@/lib/events/bandsintown/map";
import type { FeedEvent } from "@/lib/events/feed-types";
import { upsertFeedEvents } from "@/lib/events/upsert";

/**
 * Bandsintown sync: dates for artists people actually follow.
 *
 * Follow-driven rather than a sweep — the public API is per-artist, and the
 * point of this provider is tour announcements for YOUR artists, which is
 * what powers the tour_announce alert. A 404 means Bandsintown does not know
 * the artist; normal for local acts, skipped quietly.
 */

const MAX_ARTISTS_PER_RUN = 200;
const CALL_GAP_MS = 150;
const REQUEST_TIMEOUT_MS = 15_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Service = ReturnType<typeof createServiceClient>;

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
  let notes: string | null = null;

  try {
    const { data: follows } = await service
      .from("follows")
      .select("name")
      .eq("kind", "artist")
      .limit(1000);
    const artists = [
      ...new Set((follows ?? []).map((f) => f.name.trim()).filter(Boolean)),
    ].slice(0, MAX_ARTISTS_PER_RUN);

    const fresh: FeedEvent[] = [];
    for (const artist of artists) {
      try {
        apiCalls += 1;
        const res = await fetch(
          `https://rest.bandsintown.com/artists/${encodeURIComponent(artist)}/events?app_id=${encodeURIComponent(serverEnv.bandsintownAppId)}&date=upcoming`,
          { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS), cache: "no-store" },
        );
        if (res.status === 404) continue; // unknown artist — normal
        if (!res.ok) {
          errors += 1;
          notes ??= `bandsintown ${res.status} for ${artist}`;
          continue;
        }
        const body = (await res.json()) as BitEvent[] | { errorMessage?: string };
        if (!Array.isArray(body)) continue;
        for (const ev of body) {
          const mapped = mapBitEvent(artist, ev);
          if (mapped) fresh.push(mapped);
        }
      } catch (err) {
        errors += 1;
        notes ??= err instanceof Error ? err.message : String(err);
      } finally {
        await sleep(CALL_GAP_MS);
      }
    }

    // Cross-provider dedupe: when Ticketmaster already lists the same
    // headliner/city/local-date, attach a Bandsintown ticket link to that row
    // instead of inserting a twin.
    const toInsert: FeedEvent[] = [];
    for (const ev of fresh) {
      const twin = await findTicketmasterTwin(service, ev);
      if (twin) {
        skipped += 1;
        const link = ev.ticketLinks[0];
        if (link) {
          const { error: delErr } = await service
            .from("event_ticket_links")
            .delete()
            .eq("event_id", twin)
            .eq("provider", "bandsintown")
            .select("id");
          if (!delErr) {
            await service.from("event_ticket_links").insert({
              event_id: twin,
              provider: "bandsintown",
              provider_label: link.label,
              url: link.url,
              currency: link.currency,
              is_sold_out: link.isSoldOut,
              is_affiliate: false,
              sort_order: 10,
            });
          }
        }
        continue;
      }
      toInsert.push(ev);
    }

    const result = await upsertFeedEvents(toInsert);
    upserted = result.upserted;
    skipped += result.skipped;
    errors += result.errors;
    notes ??= result.firstError;
  } catch (err) {
    errors += 1;
    notes = err instanceof Error ? err.message : String(err);
  } finally {
    if (run?.id) {
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

  return { runId: run?.id ?? null, apiCalls, upserted, skipped, errors, notes };
}

/** Returns the Ticketmaster event id when the same gig is already listed. */
async function findTicketmasterTwin(
  service: Service,
  ev: FeedEvent,
): Promise<string | null> {
  if (!ev.headliner || !ev.venue?.city || !ev.startsAt) return null;
  const t = new Date(ev.startsAt).getTime();
  const { data } = await service
    .from("events")
    .select("id, starts_at, timezone")
    .eq("source", "ticketmaster")
    .ilike("venue_city", ev.venue.city)
    .contains("artist_names", [ev.headliner])
    .gte("starts_at", new Date(t - 36 * 3600 * 1000).toISOString())
    .lte("starts_at", new Date(t + 36 * 3600 * 1000).toISOString())
    .limit(5);
  for (const row of data ?? []) {
    if (
      row.starts_at &&
      sameLocalDate(row.starts_at, ev.startsAt, row.timezone ?? ev.timezone)
    ) {
      return row.id;
    }
  }
  return null;
}
