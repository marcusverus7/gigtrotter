/**
 * Capture budget decisions. PURE — no Supabase import — so the reserve /
 * release logic is testable with a fake rpc (eval/capture.test.ts).
 *
 * The atomicity that stops a burst of requests overshooting the limit lives
 * in Postgres (migration 0032: one insert … on conflict … where used < limit
 * statement per slot). This module decides WHEN to reserve and WHEN to give a
 * slot back; it does not try to be atomic itself.
 *
 *   - A slot is reserved before any storage or model work.
 *   - A fingerprint-cache hit, a pending-card twin and an upload failure cost
 *     nothing, so the slot is released.
 *   - A model call consumes the slot whether the parse succeeds or fails: the
 *     money is spent either way, and a failing model is exactly when a cap
 *     matters most.
 *
 * Two budgets are reserved per request: the user's own day, and a platform
 * row keyed by the nil uuid that caps the whole day's spend.
 */

/** Per-user daily ceiling. 100/day is far above honest use (a big backfill). */
export const DAILY_CAPTURE_LIMIT = 100;

/** The platform-wide row: one shared budget for everyone, per UTC day. */
export const PLATFORM_BUDGET_USER = "00000000-0000-0000-0000-000000000000";

const DEFAULT_PLATFORM_DAILY_LIMIT = 2000;

/** CAPTURE_PLATFORM_DAILY_LIMIT, or the default when unset / not a positive integer. */
export function platformDailyLimit(env: Record<string, string | undefined> = process.env): number {
  const raw = env.CAPTURE_PLATFORM_DAILY_LIMIT?.trim();
  const n = raw ? Number(raw) : NaN;
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_PLATFORM_DAILY_LIMIT;
}

export type BudgetStage =
  /** Nothing expensive happened: twin card handed back, upload refused, cache hit. */
  | "no_cost"
  /** The parser was invoked. The slot is spent, success or failure. */
  | "model_called";

/** Should a reserved slot go back for a request that ended at this stage? */
export function shouldReleaseOn(stage: BudgetStage): boolean {
  return stage !== "model_called";
}

export type BudgetOutcome = "ok" | "user_limit" | "platform_limit";

/** Combine the two reserve answers. `platformTaken` is null when not attempted. */
export function budgetOutcome(r: { userTaken: boolean; platformTaken: boolean | null }): BudgetOutcome {
  if (!r.userTaken) return "user_limit";
  if (r.platformTaken === false) return "platform_limit";
  return "ok";
}

/**
 * PostgREST answers PGRST202 when a function is not in its schema cache, and
 * Postgres 42883 for an undefined function; 42P01 is the table. Any of them
 * means migration 0032 has not been applied yet.
 */
export function isMissingRpc(err: { code?: string | null; message?: string } | null | undefined): boolean {
  if (!err) return false;
  if (err.code === "PGRST202" || err.code === "42883" || err.code === "42P01") return true;
  return /could not find the function|does not exist/i.test(err.message ?? "");
}

/** The shape of `client.rpc(fn, args)` that reserveBudget needs. */
export type BudgetRpc = (
  fn: "reserve_capture_slot" | "release_capture_slot",
  args: { target_user: string; daily_limit?: number },
) => PromiseLike<{ data: unknown; error: { code?: string | null; message?: string } | null }>;

export type BudgetReservation =
  | { status: "reserved"; release: () => Promise<void> }
  | { status: "denied"; scope: "user" | "platform" }
  /** Migration 0032 not applied: caller falls back to the legacy count. */
  | { status: "unavailable" };

/**
 * Reserve the user's slot, then the platform's. If the platform is full the
 * user's slot goes straight back. Release errors are logged, never thrown: a
 * leaked slot is a slightly stricter day for one user, not a broken capture.
 */
export async function reserveBudget(
  rpc: BudgetRpc,
  userId: string,
  limits: { user: number; platform: number } = { user: DAILY_CAPTURE_LIMIT, platform: platformDailyLimit() },
): Promise<BudgetReservation> {
  const user = await rpc("reserve_capture_slot", { target_user: userId, daily_limit: limits.user });
  if (user.error) {
    if (isMissingRpc(user.error)) return { status: "unavailable" };
    throw new Error(`capture budget: ${user.error.message ?? user.error.code ?? "rpc failed"}`);
  }
  if (user.data !== true) return { status: "denied", scope: "user" };

  const releaseUser = async () => {
    const r = await rpc("release_capture_slot", { target_user: userId });
    if (r.error) console.error("[capture] budget release failed", r.error.code ?? r.error.message);
  };

  const platform = await rpc("reserve_capture_slot", {
    target_user: PLATFORM_BUDGET_USER,
    daily_limit: limits.platform,
  });
  if (platform.error) {
    await releaseUser();
    if (isMissingRpc(platform.error)) return { status: "unavailable" };
    throw new Error(`capture budget: ${platform.error.message ?? platform.error.code ?? "rpc failed"}`);
  }
  if (platform.data !== true) {
    await releaseUser();
    return { status: "denied", scope: "platform" };
  }

  return {
    status: "reserved",
    release: async () => {
      await releaseUser();
      const r = await rpc("release_capture_slot", { target_user: PLATFORM_BUDGET_USER });
      if (r.error) console.error("[capture] platform budget release failed", r.error.code ?? r.error.message);
    },
  };
}
