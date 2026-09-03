import "server-only";

import { serverEnv } from "@/lib/env";
import { createServiceClient } from "@/lib/supabase/server";
import { sweepTicketmaster } from "@/lib/events/ticketmaster/fetch";
import { upsertFeedEvents } from "@/lib/events/upsert";

/**
 * One Ticketmaster sync run, bookended by a feed_sync_runs row.
 *
 * The run row is the observability story: the cron has no UI, so "did it run
 * last night, and what broke" must be answerable with one select. The row is
 * written FIRST and finalised in a finally-block, so even a thrown error
 * leaves a finished record with the message in `notes`.
 */
export async function syncTicketmaster() {
  const service = createServiceClient();
  const { data: run } = await service
    .from("feed_sync_runs")
    .insert({ source: "ticketmaster" })
    .select("id")
    .single();

  let apiCalls = 0;
  let upserted = 0;
  let skipped = 0;
  let errors = 0;
  let notes: string | null = null;

  try {
    const sweep = await sweepTicketmaster(serverEnv.ticketmasterApiKey);
    apiCalls = sweep.apiCalls;
    errors += sweep.cityErrors;
    notes = sweep.firstError;
    if (sweep.hitCallCap) notes = `${notes ? notes + "; " : ""}hit per-run call cap`;

    const result = await upsertFeedEvents(sweep.events);
    upserted = result.upserted;
    skipped = result.skipped;
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
