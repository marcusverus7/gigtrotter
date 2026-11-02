/**
 * Database-level gates (G1 data isolation, G3 recovery, G4 capacity, G6 door
 * race) against the STAGING project. Real Postgres, real RLS, real roles:
 * anon / authenticated are emulated the way PostgREST does it, with
 * `set local role` plus `request.jwt.claims`, so what passes here is what the
 * Data API enforces.
 *
 * Needs .env.staging with STAGING_DATABASE_URL and the migrations applied
 * (`pnpm staging:migrate`). Never points at production: the connection
 * string must contain the staging project ref. Creates its own disposable
 * fixtures (prefixed dbtest-) and deletes them at the end.
 *
 * Run: pnpm test:db
 */

import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

import postgres from "postgres";

let passed = 0;
const failures: string[] = [];
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed += 1;
  else failures.push(`FAIL ${name}${detail ? ` — ${detail}` : ""}`);
}

for (const line of (() => {
  try {
    return readFileSync(".env.staging", "utf8").split(/\r?\n/);
  } catch {
    return [] as string[];
  }
})()) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const url = process.env.STAGING_DATABASE_URL;
const ref = process.env.STAGING_PROJECT_REF ?? "hhjjlyizrryjttxtjvcu";
if (!url) {
  console.log("blocked: STAGING_DATABASE_URL not set (.env.staging). Database gates not run.");
  process.exit(2);
}
if (!url.includes(ref)) {
  console.error(`Refusing: STAGING_DATABASE_URL does not reference staging project ${ref}.`);
  process.exit(2);
}

const sql = postgres(url, { ssl: "require", max: 24, prepare: false });
type Sql = typeof sql;

/** Run `fn` as PostgREST would for this caller: anon, or authenticated as `uid`. */
async function as<T>(uid: string | null, fn: (tx: postgres.TransactionSql) => Promise<T>): Promise<T> {
  return sql.begin(async (tx) => {
    if (uid) {
      await tx.unsafe(`select set_config('request.jwt.claims', '${JSON.stringify({ sub: uid, role: "authenticated" })}', true)`);
      await tx.unsafe("set local role authenticated");
    } else {
      await tx.unsafe("select set_config('request.jwt.claims', '', true)");
      await tx.unsafe("set local role anon");
    }
    return fn(tx);
  }) as Promise<T>;
}

async function denied(p: Promise<unknown>): Promise<string | null> {
  try {
    await p;
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

const tag = `dbtest-${Date.now()}`;
const users = { owner: randomUUID(), inner: randomUUID(), friend: randomUUID(), stranger: randomUUID(), promoter: randomUUID(), staff: randomUUID() };

async function mkUser(id: string, name: string) {
  await sql.unsafe(`
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_sso_user)
    values ('${id}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '${name}@${tag}.invalid', '', now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"username":"${name}${Date.now() % 100000}"}', false)
  `);
  // handle_new_user (0001) creates the profile and the default Inner Circle.
}

async function main() {
  // ── fixtures ─────────────────────────────────────────────────────────────
  for (const [k, id] of Object.entries(users)) await mkUser(id, k);
  const future = new Date(Date.now() + 7 * 86_400_000).toISOString();
  const past = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const [{ id: futureEvent }] = await sql`insert into public.events (title, status, starts_at, ends_at, promoter_id, venue_name, venue_city, category, source)
    values (${tag + " future"}, 'approved', ${future}, ${new Date(Date.parse(future) + 3 * 3600_000).toISOString()}, ${users.promoter}, 'Limelight', 'Belfast', 'concert', 'promoter') returning id`;
  const [{ id: pastEvent }] = await sql`insert into public.events (title, status, starts_at, ends_at, promoter_id, venue_name, venue_city, category, source)
    values (${tag + " past"}, 'approved', ${past}, ${new Date(Date.parse(past) + 3 * 3600_000).toISOString()}, ${users.promoter}, 'Limelight', 'Belfast', 'concert', 'promoter') returning id`;
  await sql`insert into public.event_interests (event_id, user_id, interest_type) values (${futureEvent}, ${users.owner}, 'going'), (${pastEvent}, ${users.owner}, 'going')`;
  // friendships: owner–friend accepted, owner–inner accepted + inner circle
  const pair = (a: string, b: string) => [a < b ? a : b, a < b ? b : a];
  for (const other of [users.friend, users.inner]) {
    const [ua, ub] = pair(users.owner, other);
    await sql`insert into public.friendships (user_a, user_b, state, requested_by) values (${ua}, ${ub}, 'accepted', ${users.owner}) on conflict do nothing`;
  }
  const [{ id: circle }] = await sql`select id from public.circles where user_id = ${users.owner} and kind = 'inner' limit 1`;
  await sql`insert into public.circle_members (circle_id, member_id) values (${circle}, ${users.inner}) on conflict do nothing`;

  // ── G1: views ────────────────────────────────────────────────────────────
  check("G1 achievements: anon denied", !!(await denied(as(null, (tx) => tx`select * from public.achievements limit 1`))));
  for (const v of ["admin_provider_clicks", "admin_top_events_by_clicks", "admin_daily_clicks"]) {
    check(`G1 ${v}: anon denied`, !!(await denied(as(null, (tx) => tx.unsafe(`select * from public.${v} limit 1`)))));
    check(`G1 ${v}: signed-in user denied`, !!(await denied(as(users.stranger, (tx) => tx.unsafe(`select * from public.${v} limit 1`)))));
  }
  const ownAch = await as(users.owner, (tx) => tx`select user_id from public.achievements`);
  check("G1 achievements: a user sees only their own row (invoker)", ownAch.every((r) => r.user_id === users.owner));

  // ── G1/SEC-02: NULL-safe guards ──────────────────────────────────────────
  const nil = "00000000-0000-0000-0000-000000000000";
  const before = await sql`select count(*)::int as n from public.trips where user_id = ${users.owner}`;
  check("SEC-02 trip_assemble: anon rejected", /forbidden|permission denied/i.test((await denied(as(null, (tx) => tx`select public.trip_assemble(${nil}::uuid)`))) ?? ""));
  check("SEC-02 trip_assemble: anon with NULL rejected", /forbidden|permission denied/i.test((await denied(as(null, (tx) => tx`select public.trip_assemble(null::uuid)`))) ?? ""));
  check("SEC-02 trip_assemble: user A cannot act for user B", /forbidden/i.test((await denied(as(users.stranger, (tx) => tx`select public.trip_assemble(${users.owner}::uuid)`))) ?? ""));
  check("SEC-02 trip_assemble: own id works", (await denied(as(users.owner, (tx) => tx`select public.trip_assemble(${users.owner}::uuid)`))) === null);
  const after = await sql`select count(*)::int as n from public.trips where user_id = ${users.owner}`;
  check("SEC-02: rejected calls changed nothing", before[0].n === after[0].n);
  for (const fn of ["on_this_day", "unread_alert_count", "who_else_going"]) {
    check(`SEC-02 ${fn}: anon rejected`, !!(await denied(as(null, (tx) => tx.unsafe(`select * from public.${fn}('${users.owner}')`)))));
    check(`SEC-02 ${fn}: other user rejected`, /forbidden/i.test((await denied(as(users.stranger, (tx) => tx.unsafe(`select * from public.${fn}('${users.owner}')`)))) ?? ""));
  }

  // ── G1/SEC-03: future plans matrix ───────────────────────────────────────
  const sees = (uid: string | null, ev: string) => as(uid, (tx) => tx`select user_id from public.event_interests where event_id = ${ev} and user_id = ${users.owner}`).then((r) => r.length === 1).catch(() => false);
  check("SEC-03 future: owner sees own", await sees(users.owner, futureEvent));
  check("SEC-03 future: inner circle sees", await sees(users.inner, futureEvent));
  check("SEC-03 future: plain friend does NOT see", !(await sees(users.friend, futureEvent)));
  check("SEC-03 future: stranger does NOT see", !(await sees(users.stranger, futureEvent)));
  check("SEC-03 future: anon does NOT see", !(await sees(null, futureEvent)));
  check("SEC-03 past: plain friend sees", await sees(users.friend, pastEvent));
  check("SEC-03 past: stranger does NOT see", !(await sees(users.stranger, pastEvent)));
  await sql`delete from public.circle_members where circle_id = ${circle} and member_id = ${users.inner}`;
  check("SEC-03 future: removed from inner circle loses access", !(await sees(users.inner, futureEvent)));
  const [ua, ub] = pair(users.owner, users.friend);
  await sql`delete from public.friendships where user_a = ${ua} and user_b = ${ub}`;
  check("SEC-03 past: revoked friendship loses access", !(await sees(users.friend, pastEvent)));
  const counts = await as(null, (tx) => tx`select * from public.event_interest_counts(${futureEvent})`);
  check("SEC-03 counts: aggregate only (no names/ids)", counts.length === 1 && Object.keys(counts[0]).sort().join(",") === "going,interested" && Number(counts[0].going) >= 1);

  // ── G4: capacity under contention ────────────────────────────────────────
  const [{ id: tier }] = await sql`insert into public.ticket_tiers (event_id, name, price_cents, quantity, max_per_order) values (${futureEvent}, 'GA', 1500, 10, 6) returning id`;
  const attempts = await Promise.all(Array.from({ length: 100 }, () => sql`select public.reserve_tier(${tier}, 1) as ok`.then((r) => !!r[0].ok)));
  const won = attempts.filter(Boolean).length;
  const [t1] = await sql`select quantity, sold, reserved from public.ticket_tiers where id = ${tier}`;
  check("G4: 100 concurrent buyers, exactly 10 reservations", won === 10, `won=${won}`);
  check("G4: stock never exceeds capacity", t1.sold + t1.reserved <= t1.quantity && t1.reserved === 10);
  check("G4: reserve_tier not callable by anon", !!(await denied(as(null, (tx) => tx`select public.reserve_tier(${tier}, 1)`))));
  check("G4: reserve_tier not callable by a user", !!(await denied(as(users.stranger, (tx) => tx`select public.reserve_tier(${tier}, 1)`))));

  // ── G3: transactional fulfilment ─────────────────────────────────────────
  const [{ id: order }] = await sql`insert into public.orders (user_id, event_id, status, face_cents, fee_cents, total_cents, expires_at) values (${users.stranger}, ${futureEvent}, 'pending', 4500, 285, 4785, now() + interval '30 minutes') returning id`;
  await sql`insert into public.order_items (order_id, tier_id, quantity, unit_price_cents) values (${order}, ${tier}, 3, 1500)`;
  const units = (n: number) => JSON.stringify(Array.from({ length: n }, (_, i) => ({ tier_id: tier, unit_no: i + 1, code: `GT-${tag.slice(-5).toUpperCase()}-${order.slice(0, 5).toUpperCase()}-${String(i).padStart(6, "0")}` })));
  const notPaid = await sql`select public.fulfil_order_tx(${order}, ${units(3)}::jsonb, 'going') as r`;
  check("G3: a pending order is refused", (notPaid[0].r as { error?: string }).error === "not_paid");
  await sql`update public.orders set status = 'paid', paid_at = now(), stripe_payment_intent_id = 'pi_test' where id = ${order}`;
  const partial = await denied(sql`select public.fulfil_order_tx(${order}, ${units(2)}::jsonb, 'going')`);
  const afterPartial = await sql`select count(*)::int as n from public.tickets where order_id = ${order}`;
  check("G3: an incomplete unit list raises and rolls back everything", !!partial && afterPartial[0].n === 0, partial ?? "");
  const [a, b] = await Promise.all([
    sql`select public.fulfil_order_tx(${order}, ${units(3)}::jsonb, 'going') as r`,
    sql`select public.fulfil_order_tx(${order}, ${units(3).replace(/000000/g, "999999")}::jsonb, 'going') as r`,
  ]);
  const rs = [a[0].r, b[0].r] as Array<{ issued?: number; already?: boolean }>;
  const tix = await sql`select count(*)::int as n from public.tickets where order_id = ${order}`;
  const [t2] = await sql`select sold, reserved from public.ticket_tiers where id = ${tier}`;
  check("G3: concurrent duplicate fulfilment issues exactly 3 tickets", tix[0].n === 3 && rs.some((r) => r.issued === 3) && rs.some((r) => r.already), JSON.stringify(rs));
  check("G3: stock committed exactly once", t2.sold === 3 && t2.reserved === 7, JSON.stringify(t2));
  const wallet = await sql`select count(*)::int as n from public.wallet_items where user_id = ${users.stranger} and purchased_via_platform`;
  check("G3: one wallet item per admission", wallet[0].n === 3);
  const [o2] = await sql`select fulfilled_at, fulfilment_outcome from public.orders where id = ${order}`;
  check("G3: fulfilled_at set once", !!o2.fulfilled_at && o2.fulfilment_outcome === "issued");
  const replay = await sql`select public.fulfil_order_tx(${order}, ${units(3)}::jsonb, 'going') as r`;
  check("G3: replay is a no-op", (replay[0].r as { already?: boolean }).already === true);
  check("G3: fulfil_order_tx not callable by a user", !!(await denied(as(users.stranger, (tx) => tx`select public.fulfil_order_tx(${order}, '[]'::jsonb, 'going')`))));
  check("G1: buyer reads own order, stranger cannot", (await as(users.stranger, (tx) => tx`select id from public.orders where id = ${order}`)).length === 1 && (await as(users.friend, (tx) => tx`select id from public.orders where id = ${order}`)).length === 0);
  check("G1: buyer cannot read the refund ledger of others / anon cannot", (await as(null, (tx) => tx`select id from public.refunds`).catch(() => [])).length === 0);

  // ── G5: resale transaction ───────────────────────────────────────────────
  const [tk] = await sql`select id from public.tickets where order_id = ${order} order by unit_no limit 1`;
  const [{ id: listing }] = await sql`insert into public.ticket_listings (ticket_id, seller_id, event_id, tier_id, price_cents, status) values (${tk.id}, ${users.stranger}, ${futureEvent}, ${tier}, 1500, 'reserved') returning id`;
  const [{ id: buyerOrder }] = await sql`insert into public.orders (user_id, event_id, status, face_cents, fee_cents, total_cents, listing_id, stripe_payment_intent_id, paid_at) values (${users.friend}, ${futureEvent}, 'paid', 1500, 95, 1595, ${listing}, 'pi_buyer', now()) returning id`;
  const rr = await sql`select public.fulfil_resale_tx(${buyerOrder}, ${"GT-RESAL-E" + tag.slice(-4).toUpperCase() + "-AAAAAA"}, 'going') as r`;
  const [oldT] = await sql`select status from public.tickets where id = ${tk.id}`;
  const newT = await sql`select owner_id, issued_as from public.tickets where order_id = ${buyerOrder}`;
  const ledger = await sql`select order_id, reason, amount_cents, status, payment_intent_id from public.refunds where related_order_id = ${buyerOrder}`;
  check("G5: resale voids the seller's ticket and issues one to the buyer", (rr[0].r as { issued?: number }).issued === 1 && oldT.status === "transferred" && newT.length === 1 && newT[0].owner_id === users.friend && newT[0].issued_as === "resale");
  check("G5: seller refund requested (not performed) against the seller's payment", ledger.length === 1 && ledger[0].order_id === order && ledger[0].reason === "resale_seller" && ledger[0].amount_cents === 1500 && ledger[0].status === "requested" && ledger[0].payment_intent_id === "pi_test");
  const [lst] = await sql`select status, buyer_order_id from public.ticket_listings where id = ${listing}`;
  check("G5: listing sold and linked", lst.status === "sold" && lst.buyer_order_id === buyerOrder);
  const rr2 = await sql`select public.fulfil_resale_tx(${buyerOrder}, 'GT-XXXXX-XXXXX-XXXXXX', 'going') as r`;
  check("G5: resale replay is a no-op", (rr2[0].r as { already?: boolean }).already === true && (await sql`select count(*)::int as n from public.refunds where related_order_id = ${buyerOrder}`)[0].n === 1);
  check("G1: the seller can read their refund row; a stranger cannot", (await as(users.stranger, (tx) => tx`select id from public.refunds where order_id = ${order}`)).length === 1 && (await as(users.inner, (tx) => tx`select id from public.refunds where order_id = ${order}`)).length === 0);

  // ── G6: door race + staff rights ─────────────────────────────────────────
  const [tk2] = await sql`select id from public.tickets where order_id = ${order} and status = 'valid' limit 1`;
  const scans = await Promise.all([
    sql`update public.tickets set status = 'used', used_at = now(), checked_in_by = ${users.promoter} where id = ${tk2.id} and status = 'valid' returning id`,
    sql`update public.tickets set status = 'used', used_at = now(), checked_in_by = ${users.staff} where id = ${tk2.id} and status = 'valid' returning id`,
  ]);
  check("G6: two racing scanners admit exactly one", scans.filter((r) => r.length === 1).length === 1);
  check("PAY-04 can_check_in: promoter yes", (await as(users.promoter, (tx) => tx`select public.can_check_in(${futureEvent}) as ok`))[0].ok === true);
  check("PAY-04 can_check_in: stranger no", (await as(users.stranger, (tx) => tx`select public.can_check_in(${futureEvent}) as ok`))[0].ok === false);
  check("PAY-04 can_check_in: anon no", !!(await denied(as(null, (tx) => tx`select public.can_check_in(${futureEvent})`))) || (await as(null, (tx) => tx`select public.can_check_in(${futureEvent}) as ok`).catch(() => [{ ok: false }]))[0].ok === false);
  const added = await as(users.promoter, (tx) => tx`insert into public.event_staff (event_id, user_id, role, added_by) values (${futureEvent}, ${users.staff}, 'door', ${users.promoter}) returning user_id`);
  check("PAY-04: promoter can add door staff via RLS", added.length === 1);
  check("PAY-04: a stranger cannot add themselves", (await denied(as(users.stranger, (tx) => tx`insert into public.event_staff (event_id, user_id, role) values (${futureEvent}, ${users.stranger}, 'door') returning user_id`))) !== null || (await sql`select count(*)::int as n from public.event_staff where event_id = ${futureEvent} and user_id = ${users.stranger}`)[0].n === 0);
  check("PAY-04 can_check_in: staff yes", (await as(users.staff, (tx) => tx`select public.can_check_in(${futureEvent}) as ok`))[0].ok === true);
  check("PAY-04: staff can read tickets for the event but not orders", (await as(users.staff, (tx) => tx`select id from public.tickets where event_id = ${futureEvent}`)).length >= 1 && (await as(users.staff, (tx) => tx`select id from public.orders where event_id = ${futureEvent}`)).length === 0);
  check("PAY-04: staff cannot change tiers", (await as(users.staff, (tx) => tx`update public.ticket_tiers set price_cents = 1 where id = ${tier} returning id`)).length === 0);
  await as(users.promoter, (tx) => tx`delete from public.event_staff where event_id = ${futureEvent} and user_id = ${users.staff}`);
  check("PAY-04 can_check_in: removed staff no", (await as(users.staff, (tx) => tx`select public.can_check_in(${futureEvent}) as ok`))[0].ok === false);
  check("PAY-04: another promoter cannot edit this event", (await as(users.stranger, (tx) => tx`update public.events set title = 'x' where id = ${futureEvent} returning id`)).length === 0);

  // ── cleanup ──────────────────────────────────────────────────────────────
  await sql`delete from public.events where title like ${tag + "%"}`;
  for (const id of Object.values(users)) await sql`delete from auth.users where id = ${id}`;
}

main()
  .catch((err) => {
    failures.push(`FAIL harness: ${err instanceof Error ? err.message : String(err)}`);
  })
  .finally(async () => {
    await sql.end();
    const total = passed + failures.length;
    console.log(`\ndb gates: ${passed}/${total} passed`);
    for (const f of failures) console.error(f);
    if (failures.length > 0) process.exit(1);
  });
