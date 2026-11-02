/**
 * Offline tests for the capture budget (CAP-01). Run:
 *   pnpm exec tsx --tsconfig eval/tsconfig.json eval/capture.test.ts
 *
 * The fake rpc below reproduces the SEMANTICS of migration 0032's
 * reserve_capture_slot (one atomic check-and-increment per call); the real
 * atomicity is the Postgres statement and is proven against a real database
 * by eval/db.test.ts, not here.
 */

import {
  budgetOutcome,
  DAILY_CAPTURE_LIMIT,
  isMissingRpc,
  platformDailyLimit,
  PLATFORM_BUDGET_USER,
  reserveBudget,
  shouldReleaseOn,
  type BudgetRpc,
} from "../src/lib/capture/budget";

let passed = 0;
const failures: string[] = [];

function check(name: string, cond: boolean, detail?: string) {
  if (cond) passed += 1;
  else failures.push(`✗ ${name}${detail ? ` — ${detail}` : ""}`);
}

/* ── fake rpc with the migration's semantics ───────────────────────────── */

function fakeBudget(opts: { missing?: boolean; failOn?: string } = {}) {
  const used = new Map<string, number>();
  const calls: Array<{ fn: string; user: string }> = [];
  const rpc: BudgetRpc = async (fn, args) => {
    calls.push({ fn, user: args.target_user });
    if (opts.missing) return { data: null, error: { code: "PGRST202", message: "Could not find the function" } };
    if (opts.failOn === args.target_user) return { data: null, error: { code: "XX000", message: "boom" } };
    // Each call is one synchronous check-and-increment, which is what the
    // row lock gives the real statement: callers interleave only BETWEEN
    // statements, never inside one.
    if (fn === "reserve_capture_slot") {
      const limit = args.daily_limit ?? 0;
      if (limit <= 0) return { data: false, error: null };
      const n = used.get(args.target_user) ?? 0;
      if (n >= limit) return { data: false, error: null };
      used.set(args.target_user, n + 1);
      return { data: true, error: null };
    }
    used.set(args.target_user, Math.max(0, (used.get(args.target_user) ?? 0) - 1));
    return { data: null, error: null };
  };
  return { rpc, used, calls };
}

/* ── pure helpers ──────────────────────────────────────────────────────── */

function testHelpers() {
  check("outcome: both taken is ok", budgetOutcome({ userTaken: true, platformTaken: true }) === "ok");
  check("outcome: user refused wins", budgetOutcome({ userTaken: false, platformTaken: true }) === "user_limit");
  check("outcome: platform refused", budgetOutcome({ userTaken: true, platformTaken: false }) === "platform_limit");
  check("outcome: platform not attempted is ok", budgetOutcome({ userTaken: true, platformTaken: null }) === "ok");

  check("release: no-cost path gives the slot back", shouldReleaseOn("no_cost"));
  check("release: a model call consumes the slot", !shouldReleaseOn("model_called"));

  check("missing rpc: PGRST202", isMissingRpc({ code: "PGRST202" }));
  check("missing rpc: 42883", isMissingRpc({ code: "42883" }));
  check("missing rpc: 42P01", isMissingRpc({ code: "42P01" }));
  check("missing rpc: message fallback", isMissingRpc({ message: "function public.reserve_capture_slot does not exist" }));
  check("missing rpc: other errors are not", !isMissingRpc({ code: "XX000", message: "boom" }));
  check("missing rpc: null is not", !isMissingRpc(null));

  check("platform limit: default 2000", platformDailyLimit({}) === 2000);
  check("platform limit: env wins", platformDailyLimit({ CAPTURE_PLATFORM_DAILY_LIMIT: "50" }) === 50);
  check("platform limit: junk falls back", platformDailyLimit({ CAPTURE_PLATFORM_DAILY_LIMIT: "lots" }) === 2000);
  check("platform limit: zero falls back", platformDailyLimit({ CAPTURE_PLATFORM_DAILY_LIMIT: "0" }) === 2000);
  check("per-user limit is 100", DAILY_CAPTURE_LIMIT === 100);
}

/* ── reserveBudget orchestration ───────────────────────────────────────── */

async function testReserve() {
  // Happy path: both slots taken, release returns both.
  const a = fakeBudget();
  const r = await reserveBudget(a.rpc, "u1", { user: 100, platform: 2000 });
  check("reserve: reserved", r.status === "reserved");
  check("reserve: one user slot + one platform slot", a.used.get("u1") === 1 && a.used.get(PLATFORM_BUDGET_USER) === 1);
  if (r.status === "reserved") await r.release();
  check("reserve: release returns both", a.used.get("u1") === 0 && a.used.get(PLATFORM_BUDGET_USER) === 0);

  // User at the limit: refused, platform never touched.
  const b = fakeBudget();
  b.used.set("u1", 100);
  const rb = await reserveBudget(b.rpc, "u1", { user: 100, platform: 2000 });
  check("reserve: user limit refused", rb.status === "denied" && rb.scope === "user");
  check("reserve: platform untouched when user refused", !b.used.has(PLATFORM_BUDGET_USER));

  // Platform full: user's slot goes straight back.
  const c = fakeBudget();
  c.used.set(PLATFORM_BUDGET_USER, 2000);
  const rc = await reserveBudget(c.rpc, "u1", { user: 100, platform: 2000 });
  check("reserve: platform limit refused", rc.status === "denied" && rc.scope === "platform");
  check("reserve: user slot released when platform full", c.used.get("u1") === 0);

  // Migration not applied: unavailable, nothing thrown.
  const d = fakeBudget({ missing: true });
  const rd = await reserveBudget(d.rpc, "u1");
  check("reserve: missing rpc reports unavailable", rd.status === "unavailable");

  // A real error on the platform call releases the user's slot and throws.
  const e = fakeBudget({ failOn: PLATFORM_BUDGET_USER });
  let threw = false;
  try {
    await reserveBudget(e.rpc, "u1", { user: 100, platform: 2000 });
  } catch {
    threw = true;
  }
  check("reserve: platform rpc error throws", threw);
  check("reserve: platform rpc error releases the user slot", e.used.get("u1") === 0);

  // Cross-user isolation: one user at the limit does not touch another.
  const f = fakeBudget();
  f.used.set("u1", 100);
  const rf = await reserveBudget(f.rpc, "u2", { user: 100, platform: 2000 });
  check("reserve: another user is unaffected", rf.status === "reserved" && f.used.get("u2") === 1);

  // Release floors at zero.
  const g = fakeBudget();
  await g.rpc("release_capture_slot", { target_user: "u9" });
  check("release: floors at zero", g.used.get("u9") === 0);
}

/* ── 20 parallel reserves against a limit of 10 ────────────────────────── */

async function testConcurrency() {
  const h = fakeBudget();
  const results = await Promise.all(
    Array.from({ length: 20 }, () => reserveBudget(h.rpc, "burst", { user: 10, platform: 2000 })),
  );
  const taken = results.filter((x) => x.status === "reserved").length;
  const refused = results.filter((x) => x.status === "denied" && x.scope === "user").length;
  check("burst: exactly 10 of 20 succeed", taken === 10, `taken=${taken}`);
  check("burst: the other 10 are refused on the user limit", refused === 10, `refused=${refused}`);
  check("burst: user row reads 10", h.used.get("burst") === 10);
  check("burst: platform row reads 10 (one per success)", h.used.get(PLATFORM_BUDGET_USER) === 10);

  // Platform cap across users: 30 requests from 3 users, platform limit 12.
  const p = fakeBudget();
  const mixed = await Promise.all(
    Array.from({ length: 30 }, (_, i) => reserveBudget(p.rpc, `user-${i % 3}`, { user: 100, platform: 12 })),
  );
  const ok = mixed.filter((x) => x.status === "reserved").length;
  const platformRefused = mixed.filter((x) => x.status === "denied" && x.scope === "platform").length;
  check("platform burst: exactly 12 succeed", ok === 12, `ok=${ok}`);
  check("platform burst: 18 refused on the platform limit", platformRefused === 18, `refused=${platformRefused}`);
  const perUserTotal = ["user-0", "user-1", "user-2"].reduce((n, u) => n + (p.used.get(u) ?? 0), 0);
  check("platform burst: refused requests gave their user slot back", perUserTotal === 12, `sum=${perUserTotal}`);
}

/* ── report ────────────────────────────────────────────────────────────── */

testHelpers();
Promise.all([testReserve(), testConcurrency()]).then(() => {
  const total = passed + failures.length;
  console.log(`\ncapture budget tests: ${passed}/${total} passed`);
  for (const f of failures) console.error(f);
  if (failures.length > 0) process.exit(1);
});
