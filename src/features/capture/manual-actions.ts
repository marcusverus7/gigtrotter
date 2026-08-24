"use server";

import { revalidatePath } from "next/cache";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import type {
  Audience,
  WalletKind,
  WalletStatus,
} from "@/lib/supabase/types";

export interface VenueSuggestion {
  mapboxId: string;
  name: string;
  full: string;
  lng: number;
  lat: number;
  city: string | null;
  country: string | null;
}

export async function addManualWalletItem(input: {
  kind: WalletKind;
  title: string;
  starts_at: string | null;
  audience: Audience;
  venue: VenueSuggestion | null;
  /**
   * False when the user is saving something they WANT to go to but has no
   * ticket for. Without this a dated gig was always filed as "going", so there
   * was no way to wishlist a specific gig — the top question from beta testers
   * ("how do we populate the wishlist?").
   */
  hasTicket?: boolean;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // 1) Upsert venue if one supplied.
  //
  // venues allows public reads but NO client writes (service role only —
  // migration 0002). Inserting with the session client here was silently
  // denied, exactly as it was in confirmCapture: every manually added gig got
  // venue_id null and could never become a map pin. Coordinates already come
  // from the Mapbox venue picker, so no geocoding is needed on this path.
  let venueId: string | null = null;
  if (input.venue) {
    const service = createServiceClient();
    const { data: existing } = await service
      .from("venues")
      .select("id")
      .eq("mapbox_id", input.venue.mapboxId)
      .maybeSingle();
    if (existing) {
      venueId = existing.id;
    } else {
      const { data: v, error: venueErr } = await service
        .from("venues")
        .insert({
          name: input.venue.name,
          city: input.venue.city,
          country: input.venue.country,
          lat: input.venue.lat,
          lng: input.venue.lng,
          city_lat: input.venue.lat,
          city_lng: input.venue.lng,
          mapbox_id: input.venue.mapboxId,
        })
        .select("id")
        .single();
      if (venueErr) {
        console.error("[addManualWalletItem] venue insert failed:", venueErr.message);
      }
      venueId = v?.id ?? null;
    }
  }

  // 2) Create a capture row with source='manual' so the lifecycle is uniform.
  const { data: capture } = await supabase
    .from("captures")
    .insert({
      user_id: user.id,
      source: "manual",
      status: "confirmed",
      confirmed_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  // 3) Decide status from the date — unless the user said they have no ticket,
  //    in which case it is a wishlist item however firm the date is.
  const now = Date.now();
  const startsAt = input.starts_at ? new Date(input.starts_at).getTime() : null;
  const hasTicket = input.hasTicket ?? true;
  const status: WalletStatus = !hasTicket
    ? "wishlist"
    : !startsAt
      ? "wishlist"
      : startsAt < now
        ? "attended"
        : "going";

  // 4) wallet_item.
  const { data: wallet, error: walletErr } = await supabase
    .from("wallet_items")
    .insert({
      user_id: user.id,
      capture_id: capture?.id ?? null,
      venue_id: venueId,
      kind: input.kind,
      status,
      title: input.title,
      subtitle: input.venue?.full ?? null,
      starts_at: input.starts_at,
    })
    .select("id")
    .single();

  if (walletErr || !wallet) {
    throw new Error(walletErr?.message ?? "Could not save item.");
  }

  // 5) If past, mint the experience pin immediately.
  if (status === "attended" && startsAt) {
    await supabase.from("experiences").insert({
      user_id: user.id,
      wallet_item_id: wallet.id,
      capture_id: capture?.id ?? null,
      venue_id: venueId,
      kind: input.kind,
      title: input.title,
      subtitle: input.venue?.full ?? null,
      starts_at: new Date(startsAt).toISOString(),
      ends_at: new Date(startsAt + 3 * 3600_000).toISOString(),
      audience: input.audience,
      verified_by: "manual",
    });
  }

  revalidatePath("/app");
  revalidatePath("/app/map");
  return { walletItemId: wallet.id };
}
