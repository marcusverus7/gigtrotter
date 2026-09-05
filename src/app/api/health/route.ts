import { timingSafeEqual } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { publicEnv, serverEnv } from "@/lib/env";
import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * One request that answers "is production actually working tonight?"
 *
 * The keep-alive workflow used to prove only that Supabase was not paused.
 * Everything else that has taken the app down for testers — a broken deploy,
 * an exhausted Anthropic balance, a mis-set model name, a nightly feed sync
 * that died — was invisible until someone reported it. Each check here maps
 * to one of those incidents. 200 when all pass, 503 with the breakdown when
 * any fails, so a plain `curl -f` in CI is the alarm.
 *
 * Behind the CRON_SECRET bearer: the response describes infrastructure state
 * (which model is configured, when the feed last ran) and the Anthropic call
 * counts against a rate limit, so it is not a public endpoint.
 */

type Check = { ok: boolean; ms: number; detail: string };

async function timed(fn: () => Promise<string>): Promise<Check> {
  const t0 = Date.now();
  try {
    const detail = await fn();
    return { ok: true, ms: Date.now() - t0, detail };
  } catch (err) {
    return {
      ok: false,
      ms: Date.now() - t0,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

const FEED_MAX_AGE_MS = 26 * 3600 * 1000; // nightly at 04:00 UTC, with slack

export async function GET(request: NextRequest) {
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${serverEnv.cronSecret}`);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return NextResponse.json({ error: "forbidden" }, { status: 401 });
  }

  const service = createServiceClient();

  const [db, storage, feed, anthropic] = await Promise.all([
    // The same anon REST call the keep-alive makes — it doubles as Supabase
    // activity, which is what stops the free-tier pause.
    timed(async () => {
      const res = await fetch(`${publicEnv.supabaseUrl}/rest/v1/venues?select=id&limit=1`, {
        headers: {
          apikey: publicEnv.supabaseAnonKey,
          Authorization: `Bearer ${publicEnv.supabaseAnonKey}`,
        },
        signal: AbortSignal.timeout(10_000),
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`supabase rest ${res.status}`);
      return "ok";
    }),
    timed(async () => {
      const { data, error } = await service.storage.getBucket("captures");
      if (error || !data) throw new Error(error?.message ?? "captures bucket missing");
      return "captures bucket present";
    }),
    timed(async () => {
      const { data, error } = await service
        .from("feed_sync_runs")
        .select("started_at, finished_at, upserted, errors, notes")
        .eq("source", "ticketmaster")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new Error("no ticketmaster run recorded");
      const age = Date.now() - new Date(data.started_at).getTime();
      const summary = `${data.started_at} upserted=${data.upserted} errors=${data.errors}${
        data.notes ? ` notes=${data.notes}` : ""
      }`;
      if (!data.finished_at) throw new Error(`last run never finished: ${summary}`);
      if (age > FEED_MAX_AGE_MS) throw new Error(`last run is ${Math.round(age / 3600_000)}h old: ${summary}`);
      if (data.errors > 0 && data.upserted === 0) throw new Error(`last run failed: ${summary}`);
      return summary;
    }),
    // Models endpoint: validates the key and the model name without spending
    // tokens. It does not see the credit balance — an exhausted balance shows
    // up in Vercel logs as "[capture] parse failed" on the next real capture.
    timed(async () => {
      const model = serverEnv.anthropicParseModel;
      const res = await fetch(`https://api.anthropic.com/v1/models/${encodeURIComponent(model)}`, {
        headers: {
          "x-api-key": serverEnv.anthropicApiKey,
          "anthropic-version": "2023-06-01",
        },
        signal: AbortSignal.timeout(10_000),
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`anthropic ${res.status} for model ${model}`);
      return `model ${model} reachable`;
    }),
  ]);

  const checks = { db, storage, feed, anthropic };
  const ok = Object.values(checks).every((c) => c.ok);
  if (!ok) {
    console.error("[health] failing checks", JSON.stringify(checks));
  }
  return NextResponse.json(
    { ok, checkedAt: new Date().toISOString(), checks },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
