import "server-only";

import { serverEnv } from "@/lib/env";
import { SWEEP_CITIES } from "@/lib/events/cities";
import type { FeedEvent } from "@/lib/events/feed-types";
import { mapSkiddleEvent, type SkiddleEvent } from "@/lib/events/skiddle/map";
import { findTicketmasterTwins } from "@/lib/events/sync-bandsintown";
import { upsertFeedEvents } from "@/lib/events/upsert";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * Skiddle sweep — the same 44 cities, the grassroots tier. Dormant until
 * SKIDDLE_API_KEY is set (apply at skiddle.com/api). One page per city of
 * LIVE events in the next 60 days; a gig Ticketmaster already lists on the
 * same night in the same city becomes a second ticket link on that row
 * rather than a duplicate card. Budget sits inside the same 300s function
 * as the other two providers.
 */

const PAGE_SIZE = 100;
const WINDOW_DAYS = 60;
const RADIUS_MILES = 15;
const CALL_GAP_MS = 250;
const TIMEOUT_MS = 15_000;
const MAX_CALLS = 60;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ymd = (d: Date) => d.toISOString().slice(0, 10);

export async function syncSkiddle() {
  const key = serverEnv.skiddleApiKey;
  if (!key) return { runId: null, apiCalls: 0, upserted: 0, skipped: 0, errors: 0, notes: "skipped: no SKIDDLE_API_KEY" };

  const service = createServiceClient();
  const { data: run } = await service.from("feed_sync_runs").insert({ source: "skiddle" }).select("id").single();
  let apiCalls = 0;
  let upserted = 0;
  let skipped = 0;
  let errors = 0;
  let notes: string | null = null;

  try {
    const byId = new Map<string, FeedEvent>();
    const now = new Date();
    for (const city of SWEEP_CITIES) {
      if (apiCalls >= MAX_CALLS) {
        notes = "hit per-run call cap";
        break;
      }
      const params = new URLSearchParams({
        api_key: key,
        latitude: String(city.lat),
        longitude: String(city.lng),
        radius: String(RADIUS_MILES),
        eventcode: "LIVE",
        minDate: ymd(now),
        maxDate: ymd(new Date(now.getTime() + WINDOW_DAYS * 86_400_000)),
        limit: String(PAGE_SIZE),
        order: "date",
        description: "0",
      });
      try {
        apiCalls += 1;
        const res = await fetch(`https://www.skiddle.com/api/v1/events/search/?${params}`, {
          signal: AbortSignal.timeout(TIMEOUT_MS),
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`skiddle ${res.status} for ${city.name}`);
        const body = (await res.json()) as { results?: SkiddleEvent[] };
        for (const raw of body.results ?? []) {
          const ev = mapSkiddleEvent(raw, city.country === "IE" ? "Europe/Dublin" : "Europe/London");
          if (ev) byId.set(ev.externalId, ev);
        }
      } catch (err) {
        errors += 1;
        notes ??= err instanceof Error ? err.message : String(err);
      } finally {
        await sleep(CALL_GAP_MS);
      }
    }

    const fresh = [...byId.values()];
    const { twins } = await findTicketmasterTwins(service, fresh);
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
      await service.from("event_ticket_links").delete().eq("event_id", twin).eq("provider", "skiddle").select("id");
      await service.from("event_ticket_links").insert({
        event_id: twin,
        provider: "skiddle",
        provider_label: link.label,
        url: link.url,
        min_price_cents: link.minPriceCents,
        currency: link.currency,
        is_sold_out: link.isSoldOut,
        is_affiliate: false,
        sort_order: 5,
      });
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
        .update({ finished_at: new Date().toISOString(), api_calls: apiCalls, upserted, skipped, errors, notes })
        .eq("id", run.id)
        .select("id");
    }
  }
  return { runId: run?.id ?? null, apiCalls, upserted, skipped, errors, notes };
}
