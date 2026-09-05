import { timingSafeEqual } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { serverEnv } from "@/lib/env";
import { syncBandsintown } from "@/lib/events/sync-bandsintown";
import { syncTicketmaster } from "@/lib/events/sync-ticketmaster";
import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 300;

/** A run open longer than this was killed by the platform, not still working. */
const STALE_RUN_MS = 15 * 60 * 1000;

/**
 * Nightly events-feed sync. Invoked by Vercel Cron (which sends
 * `Authorization: Bearer <CRON_SECRET>` automatically when the env var is
 * set) or manually via the events-sync GitHub workflow with the same header.
 *
 * Idempotent end to end — events upsert on (source, external_id) — so a
 * double fire costs API quota, never duplicate rows. Two things guard the
 * quota and the run row anyway:
 *
 * - A run already open (started in the last 15 minutes, not finished) makes
 *   this call answer 409 instead of starting a second sweep alongside it.
 * - A run open LONGER than that was killed mid-flight by the 300s ceiling;
 *   its `finally` never ran, so it is finalised here as aborted. Without
 *   this, a silently dying nightly sync left `finished_at` null forever and
 *   nothing noticed.
 *
 * The status code is the alarm: 500 when the run did not achieve anything,
 * so Vercel's cron dashboard and the workflow's `curl -f` both go red.
 */
export async function GET(request: NextRequest) {
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${serverEnv.cronSecret}`);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return NextResponse.json({ error: "forbidden" }, { status: 401 });
  }

  const service = createServiceClient();
  const now = Date.now();
  const staleBefore = new Date(now - STALE_RUN_MS).toISOString();

  const { data: aborted } = await service
    .from("feed_sync_runs")
    .update({
      finished_at: new Date(now).toISOString(),
      errors: 1,
      notes: "aborted — the function was killed before this run finished",
    })
    .is("finished_at", null)
    .lt("started_at", staleBefore)
    .select("id");
  if (aborted && aborted.length > 0) {
    console.error("[events-sync] finalised aborted runs", aborted.length);
  }

  const { data: open } = await service
    .from("feed_sync_runs")
    .select("id, source, started_at")
    .is("finished_at", null)
    .gte("started_at", staleBefore)
    .limit(1);
  if (open && open.length > 0) {
    console.error("[events-sync] refused: run already in progress", open[0]);
    return NextResponse.json(
      { error: "sync already running", since: open[0].started_at },
      { status: 409 },
    );
  }

  // Sequential on purpose: Bandsintown's dedupe looks for Ticketmaster twins,
  // so the sweep has to land first. Each run writes its own feed_sync_runs row.
  const ticketmaster = await syncTicketmaster();
  const bandsintown = await syncBandsintown();
  const ok =
    ticketmaster.upserted > 0 ||
    (ticketmaster.errors === 0 && bandsintown.errors === 0);

  const summary = { ok, ticketmaster, bandsintown, tookMs: Date.now() - now };
  if (ok) console.log("[events-sync] ok", JSON.stringify(summary));
  else console.error("[events-sync] run failed", JSON.stringify(summary));

  return NextResponse.json(summary, { status: ok ? 200 : 500 });
}
