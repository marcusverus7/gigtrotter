import "server-only";

import { createServiceClient } from "@/lib/supabase/server";

/**
 * Operational health beyond money (OPS-01): are the feeds alive, is the
 * capture model failing, how much of the platform capture budget is spent.
 * Counts only; no row contents. Shown on /app/admin/orders and logged by the
 * reconcile cron so a stale feed or a dead model key is visible without
 * reading logs.
 */

export type FeedHealth = { source: string; lastOk: string | null; lastRun: string | null; stale: boolean; lastErrors: number };

export type OpsHealth = {
  at: string;
  feeds: FeedHealth[];
  captures24h: { total: number; failed: number; failedPct: number };
  platformBudget: { used: number | null; limit: number };
  warnings: string[];
};

/** A feed with no successful run inside this window is reported stale. */
const FEED_STALE_MS = 48 * 60 * 60 * 1000;
/** Above this share of failed captures in a day, the model/key is probably the problem. */
const CAPTURE_FAIL_WARN_PCT = 25;
const NIL = "00000000-0000-0000-0000-000000000000";

export async function opsHealth(
  deps: { service?: ReturnType<typeof createServiceClient>; now?: () => Date } = {},
): Promise<OpsHealth> {
  const service = deps.service ?? createServiceClient();
  const now = deps.now ? deps.now() : new Date();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const warnings: string[] = [];

  const [{ data: runs }, { count: capTotal }, { count: capFailed }, { data: budget }] = await Promise.all([
    service
      .from("feed_sync_runs")
      .select("source, started_at, finished_at, errors, upserted")
      .order("started_at", { ascending: false })
      .limit(60),
    service.from("captures").select("id", { count: "exact", head: true }).gte("created_at", dayAgo),
    service.from("captures").select("id", { count: "exact", head: true }).gte("created_at", dayAgo).not("error", "is", null),
    service
      .from("capture_budget")
      .select("used")
      .eq("user_id", NIL)
      .eq("day", now.toISOString().slice(0, 10))
      .maybeSingle(),
  ]);

  const bySource = new Map<string, FeedHealth>();
  for (const r of (runs ?? []) as Array<{ source: string; started_at: string; finished_at: string | null; errors: number; upserted: number }>) {
    const f = bySource.get(r.source) ?? { source: r.source, lastOk: null, lastRun: null, stale: true, lastErrors: 0 };
    if (!f.lastRun) {
      f.lastRun = r.started_at;
      f.lastErrors = r.errors;
    }
    const ok = !!r.finished_at && (r.upserted > 0 || r.errors === 0);
    if (ok && !f.lastOk) f.lastOk = r.finished_at;
    bySource.set(r.source, f);
  }
  const feeds = [...bySource.values()].map((f) => ({
    ...f,
    stale: !f.lastOk || now.getTime() - new Date(f.lastOk).getTime() > FEED_STALE_MS,
  }));
  for (const f of feeds) if (f.stale) warnings.push(`feed ${f.source}: no successful run in 48h`);
  if (feeds.length === 0) warnings.push("no feed runs recorded");

  const total = capTotal ?? 0;
  const failed = capFailed ?? 0;
  const failedPct = total > 0 ? Math.round((failed / total) * 100) : 0;
  if (total >= 4 && failedPct >= CAPTURE_FAIL_WARN_PCT) warnings.push(`captures: ${failedPct}% failed in 24h (${failed}/${total})`);

  const limit = Number(process.env.CAPTURE_PLATFORM_DAILY_LIMIT ?? 2000) || 2000;
  const used = budget ? Number((budget as { used: number }).used) : null;
  if (used != null && used >= limit * 0.9) warnings.push(`platform capture budget ${used}/${limit} used today`);

  return { at: now.toISOString(), feeds, captures24h: { total, failed, failedPct }, platformBudget: { used, limit }, warnings };
}
