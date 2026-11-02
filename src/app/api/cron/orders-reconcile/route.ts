import { timingSafeEqual } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { serverEnv } from "@/lib/env";
import { opsHealth } from "@/lib/ops/health";
import { getStripe } from "@/lib/stripe/client";
import { dispatchStripeEvent } from "@/lib/stripe/events";
import { createServiceClient } from "@/lib/supabase/server";
import {
  expireOrder,
  fulfilOrder,
  processRefunds,
  reconcilePendingOrders,
  reconcileUnfulfilledPaid,
  reconciliationReport,
} from "@/lib/tickets/fulfil";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Order recovery, decoupled from the nightly catalogue sync (PAY-03).
 *
 * Idempotent and safe to run as often as you like; every step re-checks the
 * database state and asks Stripe before moving stock or money:
 *   1. replay inbox events that were received but never finished
 *   2. paid-but-unfulfilled orders → run the issuance transaction again
 *   3. pending orders past their window → confirm with Stripe, then release
 *      or fulfil (never release on an unknown answer)
 *   4. refunds requested by fulfilment or an operator → perform, with the
 *      row's idempotency key, and re-examine stale pending ones
 *   5. report; answer 500 when something needs a human, so the schedule
 *      that calls this goes red.
 *
 * Schedule: Vercel Cron once a day (Hobby plan ceiling) in vercel.json, plus
 * the orders-reconcile GitHub workflow every 15 minutes as best effort, plus
 * the order page nudging its own order when a buyer lands on it pending.
 * None of them need to be exact: the checkout hold is 30 minutes and the
 * grace is five, so "within the hour" is the promise, not "on the minute".
 */
export async function GET(request: NextRequest) {
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${serverEnv.cronSecret}`);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return NextResponse.json({ error: "forbidden" }, { status: 401 });
  }

  const service = createServiceClient();
  const stripe = getStripe();
  const started = Date.now();

  // 1) replay unfinished inbox events (older than two minutes so a live
  //    webhook is not raced).
  const replay = { checked: 0, done: 0, errors: 0 };
  const { data: unfinished } = await service
    .from("stripe_events")
    .select("id, payload, attempts")
    .is("processed_at", null)
    .lt("received_at", new Date(started - 2 * 60 * 1000).toISOString())
    .lt("attempts", 10)
    .limit(50);
  for (const ev of unfinished ?? []) {
    replay.checked += 1;
    try {
      await dispatchStripeEvent(ev.payload as never, { fulfil: fulfilOrder, expire: expireOrder });
      await service
        .from("stripe_events")
        .update({ processed_at: new Date().toISOString(), last_error: null } as never)
        .eq("id", ev.id);
      replay.done += 1;
    } catch (err) {
      replay.errors += 1;
      await service
        .from("stripe_events")
        .update({ attempts: ev.attempts + 1, last_error: (err instanceof Error ? err.message : String(err)).slice(0, 500) } as never)
        .eq("id", ev.id);
    }
  }

  const unfulfilled = await reconcileUnfulfilledPaid({ service });
  const pending = await reconcilePendingOrders(stripe, { service });
  const refunds = await processRefunds(stripe, { service });
  const report = await reconciliationReport({ service });
  const health = await opsHealth({ service }).catch((err: unknown) => ({
    warnings: [`health check failed: ${err instanceof Error ? err.message : String(err)}`],
  }));

  const summary = {
    ok: report.critical === 0,
    replay,
    unfulfilled,
    pending,
    refunds,
    critical: report.critical,
    // Informational: a stale feed or a failing model does not fail the run
    // (events-sync has its own alarm), but it is in every summary line.
    health: health.warnings,
    counts: {
      paidUnfulfilled: report.paidUnfulfilled.length,
      pendingOverdue: report.pendingOverdue.length,
      refundsOpen: report.refundsOpen.length,
      refundsFailed: report.refundsFailed.length,
      unprocessedEvents: report.unprocessedEvents.length,
      unitMismatch: report.unitMismatch.length,
    },
    tookMs: Date.now() - started,
  };
  if (summary.ok) console.log("[orders-reconcile] ok", JSON.stringify(summary));
  else console.error("[orders-reconcile] needs attention", JSON.stringify(summary));
  return NextResponse.json(summary, { status: summary.ok ? 200 : 500 });
}
