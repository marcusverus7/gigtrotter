import "server-only";

import { publicEnv } from "@/lib/env";

/**
 * Best-effort forward geocoding via Mapbox. Returns null rather than throwing:
 * a capture confirmation must never fail because geocoding hiccuped — a pin
 * with no coordinates is recoverable later; a failed confirm is a lost gig.
 *
 * Exists because confirmed captures were minting venues with NULL lat/lng
 * (when they minted them at all — see the RLS note in confirmCapture), so the
 * map stayed at "0 pins" no matter how many gigs a tester confirmed.
 */
export async function geocodePlace(query: string): Promise<{
  lat: number;
  lng: number;
} | null> {
  const token = publicEnv.mapboxToken;
  if (!token || !query.trim()) return null;
  try {
    const url =
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query.trim())}.json` +
      `?access_token=${token}&limit=1`;
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      features?: { center?: [number, number] }[];
    };
    const center = data.features?.[0]?.center;
    if (!center) return null;
    return { lng: center[0], lat: center[1] };
  } catch {
    return null;
  }
}
