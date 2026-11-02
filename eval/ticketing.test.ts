/**
 * Offline tests for the recoverable fulfilment path (brief PAY-01..03).
 *
 * The real atomicity lives in Postgres (fulfil_order_tx / fulfil_resale_tx,
 * migration 0031) and is proven by eval/db.test.ts against a staging
 * database. This file pins the Node orchestration around it with a fake
 * PostgREST client whose rpc() reproduces the functions' CONTRACT (not their
 * SQL): claim-once semantics, unit idempotency, outcomes, ledger rows.
 *
 *   - markPaid: pending→paid once; replay cannot re-mark
 *   - fulfilOrder: calls the tx with every unit; replay/concurrent = already
 *   - a thrown tx error is surfaced (webhook 500), recorded, and a retry resumes
 *   - resale: ledger rows requested, never a direct Stripe call
 *   - processRefunds: one Stripe effect per row via idempotency key; timeout
 *     stays pending; a retry lists first; permanent errors fail; order becomes
 *     refunded only on success
 *   - reconcilePendingOrders: Stripe paid → fulfil; expired → release; open and
 *     recent → leave; retrieval error → leave; no session → release
 *   - dispatchStripeEvent: signature-verified payloads map to the handlers
 *
 * Run: pnpm test:ticketing
 */

import { verifyTicketCode } from "../src/lib/tickets/codes";

let passed = 0;
const failures: string[] = [];
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed += 1;
  else failures.push(`FAIL ${name}${detail ? ` — ${detail}` : ""}`);
}

type Row = Record<string, unknown>;

/* ── fake PostgREST + rpc contract ──────────────────────────────────────── */

function fakeDb(seed: Record<string, Row[]>, opts: { failTx?: () => boolean } = {}) {
  const tables: Record<string, Row[]> = {};
  for (const [k, v] of Object.entries(seed)) tables[k] = v.map((r) => ({ ...r }));
  const rpcs: Array<{ fn: string; args: Record<string, unknown> }> = [];
  let seq = 0;
  function from(table: string) {
    const rows = (tables[table] ??= []);
    const st = { op: "select", vals: null as unknown, filters: [] as Array<(r: Row) => boolean>, one: false };
    const b: Record<string, unknown> = {};
    const chain = (fn: () => void) => {
      fn();
      return b;
    };
    function run() {
      const match = (r: Row) => st.filters.every((f) => f(r));
      let out: Row[];
      if (st.op === "select") out = rows.filter(match);
      else if (st.op === "update") {
        out = rows.filter(match);
        for (const r of out) Object.assign(r, st.vals as object);
      } else if (st.op === "delete") {
        out = rows.filter(match);
        for (const r of out) rows.splice(rows.indexOf(r), 1);
      } else {
        const arr = (Array.isArray(st.vals) ? st.vals : [st.vals]) as Row[];
        out = arr.map((v) => ({ id: `${table}-${++seq}`, ...v }));
        rows.push(...out);
      }
      return { data: st.one ? (out[0] ?? null) : out, error: null };
    }
    Object.assign(b, {
      select: () => b,
      limit: () => b,
      order: () => b,
      update: (v: unknown) => chain(() => void ((st.op = "update"), (st.vals = v))),
      insert: (v: unknown) => chain(() => void ((st.op = "insert"), (st.vals = v))),
      upsert: (v: unknown) => chain(() => void ((st.op = "insert"), (st.vals = v))),
      delete: () => chain(() => void (st.op = "delete")),
      eq: (k: string, v: unknown) => chain(() => void st.filters.push((r) => r[k] === v)),
      is: (k: string, v: unknown) => chain(() => void st.filters.push((r) => (r[k] ?? null) === v)),
      lt: (k: string, v: string) => chain(() => void st.filters.push((r) => r[k] != null && String(r[k]) < v)),
      in: (k: string, vs: unknown[]) => chain(() => void st.filters.push((r) => vs.includes(r[k]))),
      maybeSingle: () => chain(() => void (st.one = true)),
      single: () => chain(() => void (st.one = true)),
      then: (res: (x: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve().then(run).then(res, rej),
    });
    return b;
  }

  // The contract of the 0031 functions, in JS.
  const rpc = async (fn: string, args: Record<string, unknown>) => {
    rpcs.push({ fn, args });
    if (fn === "fulfil_order_tx") {
      if (opts.failTx?.()) return { data: null, error: { message: "simulated database failure" } };
      const o = tables.orders.find((r) => r.id === args.target_order);
      if (!o) return { data: { error: "not_found" }, error: null };
      if (o.status !== "paid") return { data: { error: "not_paid", status: o.status }, error: null };
      if (o.fulfilled_at) return { data: { already: true, issued: 0 }, error: null };
      const ev = tables.events.find((r) => r.id === o.event_id)!;
      let issued = 0;
      for (const u of args.units as Array<{ tier_id: string; unit_no: number; code: string }>) {
        const have = (tables.tickets ??= []).some((t) => t.order_id === o.id && t.tier_id === u.tier_id && t.unit_no === u.unit_no);
        if (have) continue;
        const tier = tables.ticket_tiers.find((t) => t.id === u.tier_id);
        const w = { id: `w-${++seq}`, user_id: o.user_id, kind: "ticket", status: args.wallet_status, title: ev.title, subtitle: [tier?.name, ev.venue_name, ev.venue_city].filter(Boolean).join(" · "), purchased_via_platform: true, meta: { audience: "inner", vendor: "gigtrotter", gigtrotter_ticket_code: u.code, order_id: o.id } };
        (tables.wallet_items ??= []).push(w);
        tables.tickets.push({ id: `t-${++seq}`, order_id: o.id, event_id: ev.id, tier_id: u.tier_id, owner_id: o.user_id, wallet_item_id: w.id, code: u.code, status: "valid", issued_as: "purchase", unit_no: u.unit_no });
        issued += 1;
      }
      if (!o.stock_committed_at) {
        for (const it of tables.order_items.filter((i) => i.order_id === o.id)) {
          const tier = tables.ticket_tiers.find((t) => t.id === it.tier_id)!;
          tier.reserved = Math.max(0, Number(tier.reserved ?? 0) - Number(it.quantity));
          tier.sold = Number(tier.sold ?? 0) + Number(it.quantity);
        }
        o.stock_committed_at = "now";
      }
      (tables.event_interests ??= []).push({ event_id: ev.id, user_id: o.user_id, interest_type: "going" });
      o.fulfilled_at = "now";
      o.fulfilment_outcome = "issued";
      return { data: { issued, already: false }, error: null };
    }
    if (fn === "fulfil_resale_tx") {
      const o = tables.orders.find((r) => r.id === args.target_order)!;
      if (o.status !== "paid") return { data: { error: "not_paid" }, error: null };
      if (o.fulfilled_at) return { data: { already: true, issued: 0 }, error: null };
      const l = tables.ticket_listings.find((r) => r.id === o.listing_id)!;
      const old = tables.tickets.find((t) => t.id === l.ticket_id && t.status === "valid");
      (tables.refunds ??= []);
      if (!old) {
        tables.refunds.push({ id: `r-${++seq}`, order_id: o.id, related_order_id: o.id, reason: "resale_buyer_stale", payment_intent_id: o.stripe_payment_intent_id, amount_cents: o.total_cents, reverse_transfer: true, status: "requested", idempotency_key: `k-${seq}`, attempts: 0 });
        l.status = "withdrawn";
        o.fulfilled_at = "now";
        o.fulfilment_outcome = "stale_listing_refund";
        return { data: { issued: 0, already: false, outcome: "stale_listing_refund" }, error: null };
      }
      old.status = "transferred";
      const ev = tables.events.find((r) => r.id === l.event_id)!;
      tables.tickets.push({ id: `t-${++seq}`, order_id: o.id, event_id: ev.id, tier_id: l.tier_id, owner_id: o.user_id, code: args.new_code, status: "valid", issued_as: "resale", transferred_from: l.seller_id, unit_no: 1 });
      l.status = "sold";
      l.buyer_order_id = o.id;
      const sellerOrder = tables.orders.find((r) => r.id === old.order_id);
      tables.refunds.push({ id: `r-${++seq}`, order_id: old.order_id, related_order_id: o.id, reason: "resale_seller", payment_intent_id: sellerOrder?.stripe_payment_intent_id ?? null, amount_cents: l.price_cents, reverse_transfer: true, status: sellerOrder?.stripe_payment_intent_id ? "requested" : "failed", idempotency_key: `k-${seq}`, attempts: 0 });
      o.fulfilled_at = "now";
      o.fulfilment_outcome = "issued";
      return { data: { issued: 1, already: false, outcome: "issued" }, error: null };
    }
    return { data: null, error: null };
  };
  return { from, rpc, rpcs, tables };
}

/* ── fake Stripe ─────────────────────────────────────────────────────────── */

type FakeRefund = { id: string; status: string; metadata: Record<string, string>; payment_intent: string };
function fakeStripe(behaviour: {
  sessions?: Record<string, { status: string; payment_status: string; payment_intent?: string; email?: string }>;
  refundError?: (attempt: number) => unknown;
  refundStatus?: string;
} = {}) {
  const refunds: FakeRefund[] = [];
  const keys: string[] = [];
  const expired: string[] = [];
  let attempt = 0;
  return {
    refunds,
    keys,
    expired,
    checkout: {
      sessions: {
        retrieve: async (id: string) => {
          const s = behaviour.sessions?.[id];
          if (!s) throw new Error("No such checkout.session");
          return { id, status: s.status, payment_status: s.payment_status, payment_intent: s.payment_intent ?? null, customer_details: { email: s.email ?? null } };
        },
        expire: async (id: string) => void expired.push(id),
      },
    },
    refunds_api: null,
    get refundsApi() {
      return this;
    },
    // the StripeLike shape
    refundsCreate: null,
  };
}

function stripeLike(f: ReturnType<typeof fakeStripe>, behaviour: { refundError?: (attempt: number) => unknown; refundStatus?: string } = {}) {
  let attempt = 0;
  return {
    checkout: f.checkout,
    refunds: {
      create: async (
        params: { payment_intent: string; amount: number; reverse_transfer: boolean; refund_application_fee: boolean; metadata: Record<string, string> },
        opts: { idempotencyKey: string },
      ) => {
        attempt += 1;
        const err = behaviour.refundError?.(attempt);
        if (err) throw err;
        // Idempotency: same key → same refund object, no second effect.
        const seen = f.keys.indexOf(opts.idempotencyKey);
        if (seen >= 0) return f.refunds[seen];
        f.keys.push(opts.idempotencyKey);
        const r = { id: `re_${f.refunds.length + 1}`, status: behaviour.refundStatus ?? "succeeded", metadata: params.metadata, payment_intent: params.payment_intent };
        f.refunds.push(r);
        return r;
      },
      list: async (p: { payment_intent: string; limit: number }) => ({ data: f.refunds.filter((r) => r.payment_intent === p.payment_intent) }),
    },
  };
}

/* ── seeds ───────────────────────────────────────────────────────────────── */

const secret = "test-signing-key";
const starts = new Date(Date.now() + 7 * 86_400_000).toISOString();
const seedPrimary = () => ({
  orders: [{ id: "o1", user_id: "u1", event_id: "e1", status: "pending", total_cents: 5500, currency: "GBP", expires_at: new Date(Date.now() - 3_600_000).toISOString(), stripe_checkout_session_id: "cs_1" }],
  order_items: [
    { order_id: "o1", tier_id: "t1", quantity: 2, unit_price_cents: 1500 },
    { order_id: "o1", tier_id: "t2", quantity: 1, unit_price_cents: 2500 },
  ],
  ticket_tiers: [
    { id: "t1", name: "Day", quantity: 10, sold: 0, reserved: 2 },
    { id: "t2", name: "Weekend", quantity: 10, sold: 0, reserved: 1 },
  ],
  events: [{ id: "e1", title: "Belfast Blues", venue_name: "Limelight", venue_city: "Belfast", starts_at: starts, ends_at: null }],
});
const paid = { sessionId: "cs_1", paymentIntentId: "pi_1", email: "fan@example.com" };

/* ── tests ───────────────────────────────────────────────────────────────── */

async function testPrimary() {
  const { fulfilOrder, markPaid, expireOrder, issueForOrder } = await import("../src/lib/tickets/fulfil");

  const db = fakeDb(seedPrimary());
  const r1 = await fulfilOrder("o1", paid, { service: db as never, secret });
  check("fulfil: three admissions issued", r1.issued === 3 && !r1.already && r1.outcome === "issued", JSON.stringify(r1));
  const o = db.tables.orders[0];
  check("fulfil: provider fact recorded", o.status === "paid" && o.stripe_payment_intent_id === "pi_1" && o.buyer_email === "fan@example.com");
  check("fulfil: local fact recorded separately", o.fulfilled_at === "now" && o.stock_committed_at === "now");
  const tx = db.rpcs.find((r) => r.fn === "fulfil_order_tx")!;
  const units = tx.args.units as Array<{ tier_id: string; unit_no: number; code: string }>;
  check("fulfil: tx receives every unit exactly once", units.length === 3 && JSON.stringify(units.map((u) => [u.tier_id, u.unit_no])) === JSON.stringify([["t1", 1], ["t1", 2], ["t2", 1]]));
  check("fulfil: every code verifies against the signing key", units.every((u) => verifyTicketCode(u.code, secret)) && !units.some((u) => verifyTicketCode(u.code, "other")));
  check("fulfil: wallet status passed from lifecycle", tx.args.wallet_status === "going");
  check("fulfil: stock committed once", db.tables.ticket_tiers[0].sold === 2 && db.tables.ticket_tiers[0].reserved === 0 && db.tables.ticket_tiers[1].sold === 1);
  check("fulfil: no legacy commit_tier rpc", !db.rpcs.some((r) => r.fn === "commit_tier"));

  const r2 = await fulfilOrder("o1", paid, { service: db as never, secret });
  check("fulfil: webhook replay is a no-op", r2.already && r2.issued === 0 && db.tables.tickets.length === 3);
  check("fulfil: replay cannot re-mark paid", (await markPaid("o1", { ...paid, paymentIntentId: "pi_other" }, { service: db as never })) === "not_pending" && o.stripe_payment_intent_id === "pi_1");
  const both = await Promise.all([fulfilOrder("o1", paid, { service: db as never, secret }), fulfilOrder("o1", paid, { service: db as never, secret })]);
  check("fulfil: concurrent calls after completion both report already", both.every((b) => b.already) && db.tables.tickets.length === 3);

  // Failure after payment recognition: thrown, recorded, resumable.
  let fail = true;
  const db2 = fakeDb(seedPrimary(), { failTx: () => fail });
  let threw = false;
  try {
    await fulfilOrder("o1", paid, { service: db2 as never, secret });
  } catch {
    threw = true;
  }
  check("recovery: tx failure is thrown (webhook answers 500)", threw);
  check("recovery: order is paid but NOT fulfilled, error recorded", db2.tables.orders[0].status === "paid" && !db2.tables.orders[0].fulfilled_at && String(db2.tables.orders[0].fulfilment_error).includes("simulated"));
  check("recovery: nothing issued, no stock moved", (db2.tables.tickets ?? []).length === 0 && db2.tables.ticket_tiers[0].sold === 0);
  fail = false;
  const r3 = await issueForOrder("o1", { service: db2 as never, secret });
  check("recovery: retry resumes and completes", r3.issued === 3 && !r3.already && db2.tables.orders[0].fulfilled_at === "now");
  const r4 = await issueForOrder("o1", { service: db2 as never, secret });
  check("recovery: second retry is a no-op", r4.already && db2.tables.tickets.length === 3);

  // Partial progress (a previous attempt inserted unit 1 of t1, then died): retry adds only the missing units.
  const db3 = fakeDb(seedPrimary());
  db3.tables.orders[0].status = "paid";
  db3.tables.tickets = [{ id: "t-pre", order_id: "o1", tier_id: "t1", owner_id: "u1", code: "GT-PRE", status: "valid", unit_no: 1 }];
  const r5 = await issueForOrder("o1", { service: db3 as never, secret });
  check("recovery: resume issues only the missing units", r5.issued === 2 && db3.tables.tickets.length === 3 && db3.tables.tickets.some((t) => t.code === "GT-PRE"));

  // Not paid → refused, nothing issued.
  const db4 = fakeDb(seedPrimary());
  const r6 = await issueForOrder("o1", { service: db4 as never, secret });
  check("fulfil: a pending order is never issued", r6.outcome === "not_paid" && (db4.tables.tickets ?? []).length === 0);

  // Expiry.
  const db5 = fakeDb(seedPrimary());
  check("expire: pending → expired, stock released per line", (await expireOrder("o1", { service: db5 as never })) && db5.tables.orders[0].status === "expired" && db5.rpcs.filter((r) => r.fn === "release_tier").length === 2);
  check("expire: second call releases nothing more", !(await expireOrder("o1", { service: db5 as never })) && db5.rpcs.filter((r) => r.fn === "release_tier").length === 2);
  const db6 = fakeDb(seedPrimary());
  db6.tables.orders[0].status = "paid";
  check("expire: a paid order is never expired", !(await expireOrder("o1", { service: db6 as never })) && db6.tables.orders[0].status === "paid" && db6.rpcs.length === 0);
}

async function testReconcile() {
  const { reconcilePendingOrders, reconcileUnfulfilledPaid } = await import("../src/lib/tickets/fulfil");
  const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
  const seed = () => ({
    ...seedPrimary(),
    orders: [
      { id: "paidlate", user_id: "u1", event_id: "e1", status: "pending", expires_at: ago(10), stripe_checkout_session_id: "cs_paid" },
      { id: "gone", user_id: "u1", event_id: "e1", status: "pending", expires_at: ago(10), stripe_checkout_session_id: "cs_expired" },
      { id: "open", user_id: "u1", event_id: "e1", status: "pending", expires_at: ago(10), stripe_checkout_session_id: "cs_open" },
      { id: "openold", user_id: "u1", event_id: "e1", status: "pending", expires_at: ago(90), stripe_checkout_session_id: "cs_openold" },
      { id: "nosession", user_id: "u1", event_id: "e1", status: "pending", expires_at: ago(10), stripe_checkout_session_id: null },
      { id: "unknown", user_id: "u1", event_id: "e1", status: "pending", expires_at: ago(10), stripe_checkout_session_id: "cs_missing" },
      { id: "fresh", user_id: "u1", event_id: "e1", status: "pending", expires_at: ago(1), stripe_checkout_session_id: "cs_fresh" },
    ],
    order_items: [
      { order_id: "paidlate", tier_id: "t1", quantity: 1, unit_price_cents: 1500 },
      { order_id: "gone", tier_id: "t1", quantity: 1, unit_price_cents: 1500 },
      { order_id: "open", tier_id: "t1", quantity: 1, unit_price_cents: 1500 },
      { order_id: "openold", tier_id: "t1", quantity: 1, unit_price_cents: 1500 },
      { order_id: "nosession", tier_id: "t1", quantity: 1, unit_price_cents: 1500 },
      { order_id: "unknown", tier_id: "t1", quantity: 1, unit_price_cents: 1500 },
    ],
  });
  const f = fakeStripe({
    sessions: {
      cs_paid: { status: "complete", payment_status: "paid", payment_intent: "pi_late", email: "late@example.com" },
      cs_expired: { status: "expired", payment_status: "unpaid" },
      cs_open: { status: "open", payment_status: "unpaid" },
      cs_openold: { status: "open", payment_status: "unpaid" },
    },
  });
  const db = fakeDb(seed());
  const sum = await reconcilePendingOrders(stripeLike(f), { service: db as never, secret });
  const by = (id: string) => db.tables.orders.find((o) => o.id === id)!;
  check("reconcile: paid-but-late order is fulfilled, never released", by("paidlate").status === "paid" && by("paidlate").fulfilled_at === "now" && by("paidlate").stripe_payment_intent_id === "pi_late");
  check("reconcile: Stripe-expired order released", by("gone").status === "expired");
  check("reconcile: open and recent is left alone", by("open").status === "pending" && String(by("open").reconcile_note).startsWith("left"));
  check("reconcile: open an hour past window is expired at Stripe then released", by("openold").status === "expired" && f.expired.includes("cs_openold"));
  check("reconcile: no session → released", by("nosession").status === "expired");
  check("reconcile: Stripe error → left with note, not released", by("unknown").status === "pending" && String(by("unknown").reconcile_note).startsWith("error"));
  check("reconcile: inside grace is not touched", by("fresh").status === "pending" && !by("fresh").last_reconciled_at);
  check("reconcile: summary counts", sum.checked === 6 && sum.fulfilled === 1 && sum.expired === 3 && sum.left === 1 && sum.errors === 1, JSON.stringify(sum));
  const releases = db.rpcs.filter((r) => r.fn === "release_tier").length;
  check("reconcile: exactly one release per released order", releases === 3);
  const again = await reconcilePendingOrders(stripeLike(f), { service: db as never, secret });
  check("reconcile: duplicate cleanup is harmless", again.expired === 0 && again.fulfilled === 0 && db.rpcs.filter((r) => r.fn === "release_tier").length === 3);

  const db2 = fakeDb(seedPrimary());
  db2.tables.orders[0].status = "paid";
  db2.tables.orders[0].paid_at = ago(5);
  const u = await reconcileUnfulfilledPaid({ service: db2 as never, secret });
  check("reconcile: paid-unfulfilled is issued on the next pass", u.checked === 1 && u.fulfilled === 1 && db2.tables.tickets.length === 3);
}

async function testResale() {
  const { fulfilOrder, expireOrder, processRefunds } = await import("../src/lib/tickets/fulfil");
  const seed = () => ({
    events: [{ id: "e1", title: "Belfast Blues", venue_name: "Limelight", venue_city: "Belfast", starts_at: starts, ends_at: null }],
    ticket_tiers: [{ id: "t1", name: "General", price_cents: 1500, quantity: 10, sold: 1, reserved: 0 }],
    orders: [
      { id: "o-seller", user_id: "seller", event_id: "e1", status: "paid", total_cents: 1595, currency: "GBP", stripe_payment_intent_id: "pi_seller", fulfilled_at: "now" },
      { id: "o-buyer", user_id: "buyer", event_id: "e1", status: "pending", total_cents: 1595, currency: "GBP", listing_id: "L1", expires_at: new Date(Date.now() - 3_600_000).toISOString() },
    ],
    tickets: [{ id: "tk1", order_id: "o-seller", event_id: "e1", tier_id: "t1", owner_id: "seller", wallet_item_id: "w1", code: "GT-OLD", status: "valid", issued_as: "purchase", unit_no: 1 }],
    wallet_items: [{ id: "w1", user_id: "seller", status: "going" }],
    ticket_listings: [{ id: "L1", ticket_id: "tk1", seller_id: "seller", event_id: "e1", tier_id: "t1", price_cents: 1500, currency: "GBP", status: "reserved" }],
  });
  const buyerPaid = { sessionId: "cs_b", paymentIntentId: "pi_buyer", email: "buyer@example.com" };

  const db = fakeDb(seed());
  const r = await fulfilOrder("o-buyer", buyerPaid, { service: db as never, secret });
  check("resale: one ticket issued to the buyer, seller's voided", r.issued === 1 && db.tables.tickets[0].status === "transferred" && db.tables.tickets[1].owner_id === "buyer" && db.tables.tickets[1].issued_as === "resale");
  check("resale: listing sold", db.tables.ticket_listings[0].status === "sold" && db.tables.ticket_listings[0].buyer_order_id === "o-buyer");
  const ledger = db.tables.refunds;
  check("resale: seller refund REQUESTED in the ledger, not performed", ledger.length === 1 && ledger[0].status === "requested" && ledger[0].reason === "resale_seller" && ledger[0].payment_intent_id === "pi_seller" && ledger[0].amount_cents === 1500);
  check("resale: order paid and fulfilled, seller order still paid", db.tables.orders[1].fulfilled_at === "now" && db.tables.orders[0].status === "paid");
  const again = await fulfilOrder("o-buyer", buyerPaid, { service: db as never, secret });
  check("resale: replay issues nothing and requests no second refund", again.already && db.tables.tickets.length === 2 && ledger.length === 1);

  // Processor performs it exactly once with the row's key.
  const f = fakeStripe();
  const s1 = await processRefunds(stripeLike(f), { service: db as never });
  check("refund: performed once with idempotency key", s1.succeeded === 1 && f.refunds.length === 1 && f.keys[0] === `refund:${ledger[0].idempotency_key}`);
  check("refund: ledger row succeeded with Stripe id; seller order NOT marked refunded (partial)", ledger[0].status === "succeeded" && ledger[0].stripe_refund_id === "re_1" && db.tables.orders[0].status === "paid");
  const s2 = await processRefunds(stripeLike(f), { service: db as never });
  check("refund: nothing left to do on the next pass", s2.processed === 0 && f.refunds.length === 1);

  // Stale seller ticket → buyer refunded in full, no ticket.
  const db2 = fakeDb(seed());
  db2.tables.tickets[0].status = "used";
  const r2 = await fulfilOrder("o-buyer", buyerPaid, { service: db2 as never, secret });
  check("resale: stale seller ticket issues nothing", r2.issued === 0 && r2.outcome === "stale_listing_refund" && db2.tables.tickets.length === 1);
  const row = db2.tables.refunds[0];
  check("resale: buyer refund requested in full", row.reason === "resale_buyer_stale" && row.amount_cents === 1595 && row.payment_intent_id === "pi_buyer" && row.status === "requested");
  check("resale: order NOT yet refunded, listing withdrawn", db2.tables.orders[1].status === "paid" && db2.tables.ticket_listings[0].status === "withdrawn");
  const f2 = fakeStripe();
  await processRefunds(stripeLike(f2), { service: db2 as never });
  check("resale: order becomes refunded only after Stripe accepts", db2.tables.orders[1].status === "refunded" && row.status === "succeeded");

  // Buyer walked away: listing reopens.
  const db3 = fakeDb(seed());
  await expireOrder("o-buyer", { service: db3 as never });
  check("resale: expiry reopens the listing, no stock rpc", db3.tables.ticket_listings[0].status === "open" && db3.rpcs.length === 0);
}

async function testRefundProcessor() {
  const { processRefunds } = await import("../src/lib/tickets/fulfil");
  const seed = () => ({
    orders: [{ id: "o1", user_id: "u1", event_id: "e1", status: "paid", total_cents: 1595, currency: "GBP", stripe_payment_intent_id: "pi_1" }],
    refunds: [{ id: "r1", order_id: "o1", reason: "operator", payment_intent_id: "pi_1", amount_cents: 1595, reverse_transfer: true, status: "requested", idempotency_key: "key-1", attempts: 0 }],
  });

  // Timeout: unknown outcome stays pending; retry lists first and finds it.
  const f = fakeStripe();
  let first = true;
  const flaky = stripeLike(f, {
    refundError: () => {
      if (first) {
        first = false;
        // Simulate: the request reached Stripe (refund created) but the response was lost.
        f.keys.push("refund:key-1");
        f.refunds.push({ id: "re_lost", status: "succeeded", metadata: { refund_id: "r1" }, payment_intent: "pi_1" });
        return Object.assign(new Error("ETIMEDOUT"), { type: "StripeConnectionError" });
      }
      return null;
    },
  });
  const db = fakeDb(seed());
  const s1 = await processRefunds(flaky, { service: db as never });
  const row = db.tables.refunds[0];
  check("refund: timeout → pending, never 'succeeded' or 'refunded'", s1.pending === 1 && row.status === "pending" && db.tables.orders[0].status === "paid" && String(row.last_error).includes("ETIMEDOUT"));
  // Not yet stale: nothing happens.
  const s2 = await processRefunds(flaky, { service: db as never });
  check("refund: a fresh pending row is not retried immediately", s2.processed === 0);
  // Stale: list first → found → succeeded without a second create.
  row.updated_at = new Date(Date.now() - 20 * 60_000).toISOString();
  const s3 = await processRefunds(flaky, { service: db as never });
  check("refund: stale pending reconciles via list, no duplicate refund", s3.succeeded === 1 && row.status === "succeeded" && row.stripe_refund_id === "re_lost" && f.refunds.length === 1);
  check("refund: order refunded once Stripe confirms", db.tables.orders[0].status === "refunded");

  // Permanent error → failed, order untouched.
  const f2 = fakeStripe();
  const db2 = fakeDb(seed());
  const bad = stripeLike(f2, { refundError: () => Object.assign(new Error("Charge already refunded"), { type: "StripeInvalidRequestError" }) });
  const s4 = await processRefunds(bad, { service: db2 as never });
  check("refund: permanent Stripe error → failed, order stays paid", s4.failed === 1 && db2.tables.refunds[0].status === "failed" && db2.tables.orders[0].status === "paid");

  // Stripe reports the refund failed (e.g. card gone) → failed.
  const f3 = fakeStripe();
  const db3 = fakeDb(seed());
  const s5 = await processRefunds(stripeLike(f3, { refundStatus: "failed" }), { service: db3 as never });
  check("refund: Stripe status failed → failed", s5.failed === 1 && db3.tables.refunds[0].status === "failed");

  // No Stripe configured: stays pending with a note.
  const db4 = fakeDb(seed());
  const s6 = await processRefunds(null, { service: db4 as never });
  check("refund: unconfigured Stripe leaves the row pending", s6.pending === 1 && db4.tables.refunds[0].status === "pending");

  // Repeated retries never over-refund: same key, same object.
  const f5 = fakeStripe();
  const db5 = fakeDb(seed());
  const ok = stripeLike(f5);
  await processRefunds(ok, { service: db5 as never });
  db5.tables.refunds[0].status = "pending"; // pretend the success write was lost
  db5.tables.refunds[0].stripe_refund_id = null;
  db5.tables.refunds[0].updated_at = new Date(Date.now() - 20 * 60_000).toISOString();
  await processRefunds(ok, { service: db5 as never });
  check("refund: a lost success write still yields exactly one Stripe refund", f5.refunds.length === 1 && db5.tables.refunds[0].status === "succeeded");

  // No payment intent → failed immediately, named.
  const db6 = fakeDb(seed());
  db6.tables.refunds[0].payment_intent_id = null;
  const s7 = await processRefunds(stripeLike(fakeStripe()), { service: db6 as never });
  check("refund: no payment intent → failed with reason", s7.failed === 1 && String(db6.tables.refunds[0].last_error).includes("no payment intent"));
}

async function testWebhookDispatch() {
  const { dispatchStripeEvent } = await import("../src/lib/stripe/events");
  const { default: Stripe } = await import("stripe");
  const calls: string[] = [];
  const handlers = { fulfil: async (id: string) => void calls.push(`fulfil:${id}`), expire: async (id: string) => void calls.push(`expire:${id}`) };
  const completed = { id: "evt_1", type: "checkout.session.completed", data: { object: { id: "cs_1", payment_status: "paid", payment_intent: "pi_1", metadata: { order_id: "o1" }, customer_details: { email: "a@b.c" } } } };
  const r1 = await dispatchStripeEvent(completed, handlers);
  check("dispatch: completed+paid → fulfil", r1.action === "fulfilled" && calls[0] === "fulfil:o1");
  const unpaid = { ...completed, data: { object: { ...completed.data.object, payment_status: "unpaid" } } };
  check("dispatch: completed but unpaid is ignored", (await dispatchStripeEvent(unpaid, handlers)).action === "ignored");
  const expired = { id: "evt_2", type: "checkout.session.expired", data: { object: { id: "cs_1", metadata: { order_id: "o1" } } } };
  check("dispatch: expired → expire", (await dispatchStripeEvent(expired, handlers)).action === "expired" && calls.includes("expire:o1"));
  check("dispatch: unrelated events ignored", (await dispatchStripeEvent({ type: "payment_intent.created", data: { object: {} } }, handlers)).action === "ignored");

  // Signature: a tampered body fails constructEvent.
  const stripe = new Stripe("sk_test_x", { typescript: true });
  const secret = "whsec_test";
  const payload = JSON.stringify(completed);
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret });
  let okSig = false;
  try {
    stripe.webhooks.constructEvent(payload, header, secret);
    okSig = true;
  } catch {
    okSig = false;
  }
  check("webhook: a correctly signed payload verifies", okSig);
  let badSig = false;
  try {
    stripe.webhooks.constructEvent(payload.replace("o1", "o2"), header, secret);
  } catch {
    badSig = true;
  }
  check("webhook: a tampered payload is rejected", badSig);
}

/* ── report ─────────────────────────────────────────────────────────────── */

Promise.all([testPrimary(), testReconcile(), testResale(), testRefundProcessor(), testWebhookDispatch()]).then(() => {
  const total = passed + failures.length;
  console.log(`\nticketing tests: ${passed}/${total} passed`);
  for (const f of failures) console.error(f);
  if (failures.length > 0) process.exit(1);
});
