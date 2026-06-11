"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
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
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // 1) Upsert venue if one supplied.
  let venueId: string | null = null;
  if (input.venue) {
    const { data: existing } = await supabase
      .from("venues")
      .select("id")
      .eq("mapbox_id", input.venue.mapboxId)
      .maybeSingle();
    if (existing) {
      venueId = existing.id;
    } else {
      const { data: v } = await supabase
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

  // 3) Decide status from the date.
  const now = Date.now();
  const startsAt = input.starts_at ? new Date(input.starts_at).getTime() : null;
  const status: WalletStatus = !startsAt
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
