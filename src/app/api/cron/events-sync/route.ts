import { timingSafeEqual } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { serverEnv } from "@/lib/env";
import { syncTicketmaster } from "@/lib/events/sync-ticketmaster";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Nightly events-feed sync. Invoked by Vercel Cron (which sends
 * `Authorization: Bearer <CRON_SECRET>` automatically when the env var is
 * set) or manually via the events-sync GitHub workflow with the same header.
 *
 * Idempotent end to end — events upsert on (source, external_id) — so a
 * double fire costs API quota, never duplicate rows.
 */
export async function GET(request: NextRequest) {
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${serverEnv.cronSecret}`);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return NextResponse.json({ error: "forbidden" }, { status: 401 });
  }

  const result = await syncTicketmaster();
  return NextResponse.json({ ok: result.errors === 0 || result.upserted > 0, ...result });
}
