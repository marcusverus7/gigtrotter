import "server-only";

import { serverEnv } from "@/lib/env";
import type { SetlistfmSetlist } from "@/lib/setlistfm/map";

/**
 * setlist.fm REST 1.0. Free key, 2 requests/second, attribution required
 * (we link every setlist back to its page). Every function returns null or
 * an empty list when the key is absent, so the feature is simply dormant
 * until SETLISTFM_API_KEY is set — no throw, no broken page.
 */

const BASE = "https://api.setlist.fm/rest/1.0";
const TIMEOUT_MS = 10_000;

function headers(): Record<string, string> | null {
  const key = serverEnv.setlistfmApiKey;
  if (!key) return null;
  return { "x-api-key": key, Accept: "application/json", "Accept-Language": "en" };
}

export const setlistfmConfigured = () => !!serverEnv.setlistfmApiKey;

export async function searchSetlists(params: {
  artistName: string;
  date: string; // dd-MM-yyyy
  cityName?: string | null;
}): Promise<SetlistfmSetlist[]> {
  const h = headers();
  if (!h) return [];
  const q = new URLSearchParams({ artistName: params.artistName, date: params.date });
  if (params.cityName) q.set("cityName", params.cityName);
  try {
    const res = await fetch(`${BASE}/search/setlists?${q}`, {
      headers: h,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (res.status === 404) return []; // "no setlists found" is a 404 on this API
    if (!res.ok) return [];
    const body = (await res.json()) as { setlist?: SetlistfmSetlist[] };
    return body.setlist ?? [];
  } catch {
    return [];
  }
}

/** A user's attended shows, newest first, paged at 20 — cap pages to be polite. */
export async function attendedSetlists(username: string, maxPages = 10): Promise<SetlistfmSetlist[]> {
  const h = headers();
  if (!h) return [];
  const out: SetlistfmSetlist[] = [];
  for (let p = 1; p <= maxPages; p++) {
    try {
      const res = await fetch(`${BASE}/user/${encodeURIComponent(username)}/attended?p=${p}`, {
        headers: h,
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      });
      if (!res.ok) break;
      const body = (await res.json()) as { setlist?: SetlistfmSetlist[]; total?: number; itemsPerPage?: number };
      out.push(...(body.setlist ?? []));
      const total = body.total ?? 0;
      const per = body.itemsPerPage ?? 20;
      if (p * per >= total || (body.setlist ?? []).length === 0) break;
      await new Promise((r) => setTimeout(r, 600)); // 2 req/s limit
    } catch {
      break;
    }
  }
  return out;
}
