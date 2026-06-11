"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

const GeoInput = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracy_m: z.number().positive().max(5000).optional().default(100),
  capturedAt: z
    .string()
    .datetime({ offset: true })
    .optional(),
});

const VENUE_RADIUS_M = 400; // generous — covers most stadium/festival site footprints

function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Geofence attendance confirmation (§8.2 / capture-layer route #4).
 *
 * The client passes its current coordinate (only after explicit consent).
 * If the user has a `going`/`tonight` wallet item whose venue is within
 * (radius + reported accuracy), we:
 *   1. flip its status to `attended`,
 *   2. mint or update an experience pin with verified_by='geofence'.
 *
 * Reverse path — "looks like you were at the SSE Arena last night?" — lands
 * with the native push pipeline.
 *
 * Privacy: we DO NOT persist the raw lat/lng. Only the venue match is
 * stored. The §11.4 honeypot principle applies; raw location history is
 * exactly the data class we promised never to keep.
 */
export async function confirmAttendanceByGeo(input: z.infer<typeof GeoInput>) {
  const parsed = GeoInput.parse(input);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const at = parsed.capturedAt ? new Date(parsed.capturedAt) : new Date();
  // Items that are live or wrap the captured-at timestamp.
  const windowStart = new Date(at.getTime() - 12 * 3600_000).toISOString();
  const windowEnd = new Date(at.getTime() + 12 * 3600_000).toISOString();

  const { data: candidates } = await supabase
    .from("wallet_items")
    .select(
      "id, kind, title, subtitle, starts_at, ends_at, venue_id, status, venues(lat, lng, name, city, country)",
    )
    .eq("user_id", user.id)
    .in("status", ["going", "tonight"])
    .gte("starts_at", windowStart)
    .lte("starts_at", windowEnd);

  const matches: { walletItemId: string; distance_m: number }[] = [];
  const radius = VENUE_RADIUS_M + (parsed.accuracy_m ?? 100);

  for (const c of candidates ?? []) {
    const venuesRaw = (c as { venues: unknown }).venues;
    const v = (Array.isArray(venuesRaw) ? venuesRaw[0] : venuesRaw) as {
      lat: number | null;
      lng: number | null;
    } | null;
    if (!v || v.lat == null || v.lng == null) continue;
    const dist = haversineMeters(parsed.lat, parsed.lng, v.lat, v.lng);
    if (dist <= radius) matches.push({ walletItemId: c.id, distance_m: dist });
  }

  if (matches.length === 0) {
    return { matched: 0 } as const;
  }

  // Closest match wins; promote it.
  matches.sort((a, b) => a.distance_m - b.distance_m);
  const best = matches[0];
  const walletItem = candidates!.find((c) => c.id === best.walletItemId)!;

  // .select() guards against silent-fail RLS.
  const { data: updatedWallet, error: walletErr } = await supabase
    .from("wallet_items")
    .update({ status: "attended" })
    .eq("id", best.walletItemId)
    .eq("user_id", user.id)
    .select("id");
  if (walletErr) throw walletErr;
  if (!updatedWallet || updatedWallet.length === 0) {
    throw new Error("Could not update wallet item (RLS blocked).");
  }

  // Upsert the experience pin with verified_by='geofence'.
  const { data: existingExp } = await supabase
    .from("experiences")
    .select("id")
    .eq("wallet_item_id", best.walletItemId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existingExp) {
    await supabase
      .from("experiences")
      .update({ verified_by: "geofence" })
      .eq("id", existingExp.id)
      .eq("user_id", user.id);
  } else if (walletItem.starts_at) {
    await supabase.from("experiences").insert({
      user_id: user.id,
      wallet_item_id: walletItem.id,
      venue_id: walletItem.venue_id,
      kind: walletItem.kind,
      title: walletItem.title,
      subtitle: walletItem.subtitle,
      starts_at: walletItem.starts_at,
      ends_at:
        walletItem.ends_at ??
        new Date(
          new Date(walletItem.starts_at).getTime() + 3 * 3600_000,
        ).toISOString(),
      audience: "inner",
      verified_by: "geofence",
    });
  }

  revalidatePath("/app");
  revalidatePath("/app/map");
  return { matched: matches.length, walletItemId: best.walletItemId } as const;
}
