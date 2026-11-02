import "server-only";

import { currentSigningSecret } from "@/lib/tickets/keys";
import { makeTicketCode } from "@/lib/tickets/codes";
import { createServiceClient } from "@/lib/supabase/server";
import { deriveStatus } from "@/lib/wallet/lifecycle";

/**
 * Money, inventory and admission — the recoverable version (brief PAY-01..03).
 *
 * Two facts, kept apart:
 *   orders.status = 'paid'      Stripe says the money arrived (provider fact)
 *   orders.fulfilled_at         every admission exists locally (our fact)
 *
 * Between those two facts the only work is one database transaction,
 * fulfil_order_tx / fulfil_resale_tx (migration 0031), keyed on
 * (order, tier, unit_no). It either lands whole or not at all, so:
 *   - a retry after any crash simply runs it again;
 *   - duplicate or concurrent webhooks serialise on the order row and the
 *     second one sees fulfilled_at;
 *   - a failure is thrown, not swallowed, so the webhook answers 500 and
 *     Stripe retries, and the reconciler picks up anything Stripe gives up on.
 *
 * Stripe is never called inside a transaction. Refunds are requested as
 * ledger rows by the transaction and performed afterwards by
 * processRefunds(), with a per-row idempotency key, so a timeout can never
 * become a second refund and nothing is called "refunded" until Stripe
 * confirms it.
 */

export type ServiceClient = ReturnType<typeof createServiceClient>;

/** What this module reaches for, so a test can hand in fakes. */
export type FulfilDeps = {
  service?: ServiceClient;
  secret?: string;
  now?: () => Date;
};

export type StripeInfo = { sessionId: string; paymentIntentId: string | null; email: string | null };

export type FulfilResult = {
  issued: number;
  already: boolean;
  outcome: "issued" | "stale_listing_refund" | "not_paid" | "missing";
};

/** The slice of a Stripe client this module uses — fakeable. */
export type StripeLike = {
  checkout: {
    sessions: {
      retrieve: (id: string) => Promise<{
        id: string;
        status?: string | null;
        payment_status?: string | null;
        payment_intent?: string | { id: string } | null;
        customer_details?: { email?: string | null } | null;
      }>;
      expire: (id: string) => Promise<unknown>;
    };
  };
  refunds: {
    create: (
      params: {
        payment_intent: string;
        amount: number;
        reverse_transfer: boolean;
        refund_application_fee: boolean;
        metadata: Record<string, string>;
      },
      opts: { idempotencyKey: string },
    ) => Promise<{ id: string; status?: string | null }>;
    list: (params: { payment_intent: string; limit: number }) => Promise<{
      data: Array<{ id: string; status?: string | null; metadata?: Record<string, string> | null }>;
    }>;
  };
};

const nowOf = (d: FulfilDeps) => (d.now ? d.now() : new Date());

/* ── payment fact ──────────────────────────────────────────────────────────── */

/**
 * Record that Stripe confirmed payment. Idempotent: only a pending order
 * moves, and the retry path (paid but unfulfilled) is handled by fulfilOrder.
 */
export async function markPaid(
  orderId: string,
  stripe: StripeInfo,
  deps: FulfilDeps = {},
): Promise<"claimed" | "not_pending"> {
  const service = deps.service ?? createServiceClient();
  const { data } = await service
    .from("orders")
    .update({
      status: "paid",
      paid_at: nowOf(deps).toISOString(),
      stripe_payment_intent_id: stripe.paymentIntentId,
      buyer_email: stripe.email,
    } as never)
    .eq("id", orderId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  return data ? "claimed" : "not_pending";
}

/* ── fulfilment ────────────────────────────────────────────────────────────── */

export async function fulfilOrder(
  orderId: string,
  stripe: StripeInfo,
  deps: FulfilDeps = {},
): Promise<FulfilResult> {
  await markPaid(orderId, stripe, deps);
  return issueForOrder(orderId, deps);
}

/**
 * Run the issuance transaction for a paid order. Safe to call any number of
 * times; throws when the database refuses, so callers (webhook, reconciler)
 * treat it as "try again", never as "done".
 */
export async function issueForOrder(orderId: string, deps: FulfilDeps = {}): Promise<FulfilResult> {
  const service = deps.service ?? createServiceClient();
  const secret = deps.secret ?? currentSigningSecret();

  const { data: o } = await service
    .from("orders")
    .select("id, status, fulfilled_at, fulfilment_outcome, event_id, listing_id")
    .eq("id", orderId)
    .maybeSingle();
  if (!o) return { issued: 0, already: false, outcome: "missing" };
  if (o.status !== "paid") return { issued: 0, already: false, outcome: "not_paid" };
  if (o.fulfilled_at)
    return {
      issued: 0,
      already: true,
      outcome: (o.fulfilment_outcome as FulfilResult["outcome"] | null) ?? "issued",
    };

  const { data: event } = await service
    .from("events")
    .select("starts_at, ends_at")
    .eq("id", o.event_id)
    .maybeSingle();
  const walletStatus = deriveStatus(event?.starts_at, event?.ends_at, nowOf(deps).getTime());

  let call;
  if (o.listing_id) {
    call = await service.rpc("fulfil_resale_tx", {
      target_order: orderId,
      new_code: makeTicketCode(secret),
      wallet_status: walletStatus,
    });
  } else {
    const { data: items } = await service
      .from("order_items")
      .select("tier_id, quantity")
      .eq("order_id", orderId);
    const units: Array<{ tier_id: string; unit_no: number; code: string }> = [];
    for (const it of items ?? [])
      for (let n = 1; n <= it.quantity; n++)
        units.push({ tier_id: it.tier_id, unit_no: n, code: makeTicketCode(secret) });
    call = await service.rpc("fulfil_order_tx", {
      target_order: orderId,
      units,
      wallet_status: walletStatus,
    });
  }

  if (call.error) {
    await service
      .from("orders")
      .update({ fulfilment_error: call.error.message.slice(0, 500) } as never)
      .eq("id", orderId);
    throw new Error(`fulfilment failed for ${orderId}: ${call.error.message}`);
  }
  const r = (call.data ?? {}) as {
    issued?: number;
    already?: boolean;
    error?: string;
    outcome?: string;
  };
  if (r.error) {
    await service
      .from("orders")
      .update({ fulfilment_error: r.error } as never)
      .eq("id", orderId);
    throw new Error(`fulfilment refused for ${orderId}: ${r.error}`);
  }
  return {
    issued: r.issued ?? 0,
    already: !!r.already,
    outcome: (r.outcome as FulfilResult["outcome"] | undefined) ?? "issued",
  };
}

/* ── expiry ────────────────────────────────────────────────────────────────── */

/** Checkout expired or was cancelled: give the stock (or the listing) back. Never touches a paid order. */
export async function expireOrder(orderId: string, deps: FulfilDeps = {}): Promise<boolean> {
  const service = deps.service ?? createServiceClient();
  const { data: o } = await service
    .from("orders")
    .update({ status: "expired" } as never)
    .eq("id", orderId)
    .eq("status", "pending")
    .select("id, listing_id")
    .maybeSingle();
  if (!o) return false;
  if (o.listing_id) {
    await service
      .from("ticket_listings")
      .update({ status: "open", reserved_until: null } as never)
      .eq("id", o.listing_id)
      .eq("status", "reserved");
    return true;
  }
  const { data: items } = await service
    .from("order_items")
    .select("tier_id, quantity")
    .eq("order_id", orderId);
  for (const it of items ?? [])
    await service.rpc("release_tier", { target_tier: it.tier_id, qty: it.quantity });
  return true;
}

/** Grace after an order's own expires_at before the reconciler looks at it. */
const EXPIRY_GRACE_MS = 5 * 60 * 1000;
/** A session Stripe still calls "open" this long after our expiry is treated as abandoned. */
const OPEN_SESSION_FORCE_MS = 60 * 60 * 1000;

export type ReconcileSummary = {
  checked: number;
  expired: number;
  fulfilled: number;
  left: number;
  errors: number;
};

/**
 * Pending orders past their window: ask Stripe before touching stock.
 *   paid                → fulfil (the webhook was lost or late)
 *   expired             → release
 *   open, long overdue  → expire it at Stripe, then release
 *   no session at all   → release (nothing at Stripe can ever pay it)
 *   anything uncertain  → leave it, note why, look again next run
 */
export async function reconcilePendingOrders(
  stripe: StripeLike | null,
  deps: FulfilDeps = {},
): Promise<ReconcileSummary> {
  const service = deps.service ?? createServiceClient();
  const now = nowOf(deps);
  const sum: ReconcileSummary = { checked: 0, expired: 0, fulfilled: 0, left: 0, errors: 0 };
  const { data: stale } = await service
    .from("orders")
    .select("id, stripe_checkout_session_id, expires_at")
    .eq("status", "pending")
    .lt("expires_at", new Date(now.getTime() - EXPIRY_GRACE_MS).toISOString())
    .limit(200);

  for (const o of stale ?? []) {
    sum.checked += 1;
    const note = async (text: string) =>
      service
        .from("orders")
        .update({ last_reconciled_at: now.toISOString(), reconcile_note: text } as never)
        .eq("id", o.id);
    if (!o.stripe_checkout_session_id) {
      if (await expireOrder(o.id, deps)) sum.expired += 1;
      await note("expired: no checkout session was ever created");
      continue;
    }
    if (!stripe) {
      sum.left += 1;
      await note("left: Stripe not configured, cannot confirm payment state");
      continue;
    }
    try {
      const s = await stripe.checkout.sessions.retrieve(o.stripe_checkout_session_id);
      if (s.payment_status === "paid") {
        await fulfilOrder(
          o.id,
          {
            sessionId: s.id,
            paymentIntentId:
              typeof s.payment_intent === "string" ? s.payment_intent : (s.payment_intent?.id ?? null),
            email: s.customer_details?.email ?? null,
          },
          deps,
        );
        sum.fulfilled += 1;
        await note("fulfilled by reconciler: Stripe reported paid");
      } else if (s.status === "expired") {
        if (await expireOrder(o.id, deps)) sum.expired += 1;
        await note("expired: Stripe session expired");
      } else if (
        s.status === "open" &&
        o.expires_at &&
        new Date(o.expires_at).getTime() < now.getTime() - OPEN_SESSION_FORCE_MS
      ) {
        // expire() fails if the session was paid in the meantime — then the
        // next run sees payment_status = paid and fulfils instead.
        await stripe.checkout.sessions.expire(s.id);
        if (await expireOrder(o.id, deps)) sum.expired += 1;
        await note("expired: session still open an hour past our window; expired at Stripe");
      } else {
        sum.left += 1;
        await note(`left: Stripe session ${s.status ?? "?"} / ${s.payment_status ?? "?"}`);
      }
    } catch (err) {
      sum.errors += 1;
      await note(`error: ${err instanceof Error ? err.message.slice(0, 300) : String(err)}`);
    }
  }
  return sum;
}

/** Paid orders whose issuance never completed: run it again. */
export async function reconcileUnfulfilledPaid(
  deps: FulfilDeps = {},
): Promise<{ checked: number; fulfilled: number; errors: number }> {
  const service = deps.service ?? createServiceClient();
  const now = nowOf(deps);
  const out = { checked: 0, fulfilled: 0, errors: 0 };
  const { data: rows } = await service
    .from("orders")
    .select("id")
    .eq("status", "paid")
    .is("fulfilled_at", null)
    .lt("paid_at", new Date(now.getTime() - 60 * 1000).toISOString())
    .limit(100);
  for (const o of rows ?? []) {
    out.checked += 1;
    try {
      const r = await issueForOrder(o.id, deps);
      if (!r.already && r.outcome !== "not_paid" && r.outcome !== "missing") out.fulfilled += 1;
    } catch (err) {
      out.errors += 1;
      console.error("[reconcile] fulfilment retry failed", o.id, err instanceof Error ? err.message : String(err));
    }
  }
  return out;
}

/* ── refunds ───────────────────────────────────────────────────────────────── */

type RefundRow = {
  id: string;
  order_id: string;
  reason: string;
  payment_intent_id: string | null;
  amount_cents: number;
  reverse_transfer: boolean;
  status: "requested" | "pending" | "succeeded" | "failed";
  idempotency_key: string;
  attempts: number;
};

/** A pending row untouched this long is re-examined (list first, then retry with the same key). */
const REFUND_RETRY_AFTER_MS = 10 * 60 * 1000;
const REFUND_MAX_ATTEMPTS = 8;

export type RefundSummary = { processed: number; succeeded: number; failed: number; pending: number };

function isPermanentStripeError(err: unknown): boolean {
  const e = err as { type?: string; code?: string } | null;
  if (!e || typeof e !== "object") return false;
  return e.type === "StripeInvalidRequestError" || e.type === "StripeCardError";
}

/**
 * Perform requested refunds and re-examine stale pending ones. One Stripe
 * effect per ledger row, guaranteed by the row's idempotency key: a retry
 * after a timeout replays the same request and Stripe returns the original.
 * Order status becomes 'refunded' only when Stripe has accepted a full refund.
 */
export async function processRefunds(
  stripe: StripeLike | null,
  deps: FulfilDeps = {},
): Promise<RefundSummary> {
  const service = deps.service ?? createServiceClient();
  const now = nowOf(deps);
  const sum: RefundSummary = { processed: 0, succeeded: 0, failed: 0, pending: 0 };

  const [{ data: requested }, { data: stalePending }] = await Promise.all([
    service.from("refunds").select("*").eq("status", "requested").limit(50),
    service
      .from("refunds")
      .select("*")
      .eq("status", "pending")
      .lt("updated_at", new Date(now.getTime() - REFUND_RETRY_AFTER_MS).toISOString())
      .limit(50),
  ]);
  const rows = [...((requested ?? []) as RefundRow[]), ...((stalePending ?? []) as RefundRow[])];

  for (const row of rows) {
    sum.processed += 1;
    const set = (patch: Record<string, unknown>) =>
      service
        .from("refunds")
        .update({ ...patch, updated_at: now.toISOString() } as never)
        .eq("id", row.id);

    // Claim the row so two reconcilers cannot both act on it.
    const { data: claimed } = await service
      .from("refunds")
      .update({ status: "pending", attempts: row.attempts + 1, updated_at: now.toISOString() } as never)
      .eq("id", row.id)
      .eq("status", row.status)
      .select("id")
      .maybeSingle();
    if (!claimed) continue;

    if (!row.payment_intent_id) {
      await set({ status: "failed", last_error: "no payment intent to refund" });
      sum.failed += 1;
      continue;
    }
    if (!stripe) {
      await set({ last_error: "Stripe not configured" });
      sum.pending += 1;
      continue;
    }
    if (row.attempts + 1 > REFUND_MAX_ATTEMPTS) {
      await set({ status: "failed", last_error: `gave up after ${row.attempts} attempts; needs an operator` });
      sum.failed += 1;
      continue;
    }

    const succeed = async (stripeRefundId: string) => {
      await set({ status: "succeeded", stripe_refund_id: stripeRefundId, succeeded_at: now.toISOString(), last_error: null });
      if (row.reason !== "resale_seller") {
        await service.from("orders").update({ status: "refunded" } as never).eq("id", row.order_id).eq("status", "paid");
      }
      sum.succeeded += 1;
    };

    try {
      // A retry first asks Stripe whether the earlier attempt actually landed.
      if (row.status === "pending") {
        const existing = await stripe.refunds.list({ payment_intent: row.payment_intent_id, limit: 100 });
        const mine = existing.data.find((r) => r.metadata?.refund_id === row.id);
        if (mine) {
          if (mine.status === "failed") {
            await set({ status: "failed", stripe_refund_id: mine.id, last_error: "Stripe reports the refund failed" });
            sum.failed += 1;
          } else await succeed(mine.id);
          continue;
        }
      }
      const r = await stripe.refunds.create(
        {
          payment_intent: row.payment_intent_id,
          amount: row.amount_cents,
          reverse_transfer: row.reverse_transfer,
          refund_application_fee: false,
          metadata: { refund_id: row.id, order_id: row.order_id, reason: row.reason },
        },
        { idempotencyKey: `refund:${row.idempotency_key}` },
      );
      if (r.status === "failed") {
        await set({ status: "failed", stripe_refund_id: r.id, last_error: "Stripe reports the refund failed" });
        sum.failed += 1;
      } else await succeed(r.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message.slice(0, 300) : String(err);
      if (isPermanentStripeError(err)) {
        await set({ status: "failed", last_error: msg });
        sum.failed += 1;
      } else {
        // Timeout / connection / 5xx: unknown outcome. Stays pending; the next
        // pass lists Stripe's refunds for this intent before trying again.
        await set({ last_error: msg });
        sum.pending += 1;
      }
    }
  }
  return sum;
}

/* ── reconciliation report (PAY-05) ────────────────────────────────────────── */

export type ReconciliationReport = {
  at: string;
  paidUnfulfilled: Array<{ id: string; paid_at: string | null; fulfilment_error: string | null }>;
  pendingOverdue: Array<{ id: string; expires_at: string | null; reconcile_note: string | null; has_session: boolean }>;
  refundsOpen: Array<{ id: string; order_id: string; reason: string; amount_cents: number; status: string; attempts: number; last_error: string | null }>;
  refundsFailed: Array<{ id: string; order_id: string; reason: string; amount_cents: number; last_error: string | null }>;
  unprocessedEvents: Array<{ id: string; type: string; received_at: string; attempts: number; last_error: string | null }>;
  unitMismatch: Array<{ id: string; expected: number; present: number }>;
  critical: number;
};

export async function reconciliationReport(deps: FulfilDeps = {}): Promise<ReconciliationReport> {
  const service = deps.service ?? createServiceClient();
  const now = nowOf(deps);
  const [pu, po, ro, rf, ue, recent] = await Promise.all([
    service.from("orders").select("id, paid_at, fulfilment_error").eq("status", "paid").is("fulfilled_at", null).limit(100),
    service
      .from("orders")
      .select("id, expires_at, reconcile_note, stripe_checkout_session_id")
      .eq("status", "pending")
      .lt("expires_at", new Date(now.getTime() - EXPIRY_GRACE_MS).toISOString())
      .limit(100),
    service.from("refunds").select("id, order_id, reason, amount_cents, status, attempts, last_error").in("status", ["requested", "pending"]).limit(100),
    service.from("refunds").select("id, order_id, reason, amount_cents, last_error").eq("status", "failed").limit(100),
    service.from("stripe_events").select("id, type, received_at, attempts, last_error").is("processed_at", null).limit(100),
    service.from("orders").select("id, listing_id").eq("status", "paid").eq("fulfilment_outcome", "issued").order("paid_at", { ascending: false }).limit(200),
  ]);

  const unitMismatch: ReconciliationReport["unitMismatch"] = [];
  const ids = ((recent.data ?? []) as Array<{ id: string; listing_id: string | null }>).map((o) => o.id);
  if (ids.length > 0) {
    const [{ data: items }, { data: tix }] = await Promise.all([
      service.from("order_items").select("order_id, quantity").in("order_id", ids),
      service.from("tickets").select("order_id").in("order_id", ids),
    ]);
    const expected = new Map<string, number>();
    for (const o of (recent.data ?? []) as Array<{ id: string; listing_id: string | null }>)
      if (o.listing_id) expected.set(o.id, 1);
    for (const it of (items ?? []) as Array<{ order_id: string; quantity: number }>)
      expected.set(it.order_id, (expected.get(it.order_id) ?? 0) + it.quantity);
    const present = new Map<string, number>();
    for (const t of (tix ?? []) as Array<{ order_id: string | null }>)
      if (t.order_id) present.set(t.order_id, (present.get(t.order_id) ?? 0) + 1);
    for (const id of ids) {
      const e = expected.get(id) ?? 0;
      const p = present.get(id) ?? 0;
      if (e !== p) unitMismatch.push({ id, expected: e, present: p });
    }
  }

  const report: ReconciliationReport = {
    at: now.toISOString(),
    paidUnfulfilled: (pu.data ?? []) as ReconciliationReport["paidUnfulfilled"],
    pendingOverdue: ((po.data ?? []) as Array<{ id: string; expires_at: string | null; reconcile_note: string | null; stripe_checkout_session_id: string | null }>).map((o) => ({
      id: o.id,
      expires_at: o.expires_at,
      reconcile_note: o.reconcile_note,
      has_session: !!o.stripe_checkout_session_id,
    })),
    refundsOpen: (ro.data ?? []) as ReconciliationReport["refundsOpen"],
    refundsFailed: (rf.data ?? []) as ReconciliationReport["refundsFailed"],
    unprocessedEvents: (ue.data ?? []) as ReconciliationReport["unprocessedEvents"],
    unitMismatch,
    critical: 0,
  };
  report.critical =
    report.paidUnfulfilled.length +
    report.refundsFailed.length +
    report.unitMismatch.length +
    report.refundsOpen.filter((r) => r.attempts >= 3).length;
  return report;
}
