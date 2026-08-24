"use server";

import { revalidatePath } from "next/cache";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { geocodePlace } from "@/lib/geo/geocode";

export async function updateWalletItemDates(
  itemId: string,
  { starts_at, ends_at }: { starts_at: string | null; ends_at: string | null },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("wallet_items")
    .update({ starts_at, ends_at })
    .eq("id", itemId)
    .eq("user_id", user.id)
    .select("id");

  if (error) throw error;
  if (!data || data.length === 0)
    throw new Error("Could not update — item not found or not yours.");

  revalidatePath(`/app/item/${itemId}`);
  revalidatePath("/app");
}

export async function deleteWalletItem(itemId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // experiences.wallet_item_id is ON DELETE SET NULL — delete explicitly to
  // avoid orphaned experience rows that lose their wallet context.
  const { error: expError } = await supabase
    .from("experiences")
    .delete()
    .eq("wallet_item_id", itemId)
    .eq("user_id", user.id);

  if (expError) throw expError;

  const { data, error } = await supabase
    .from("wallet_items")
    .delete()
    .eq("id", itemId)
    .eq("user_id", user.id)
    .select("id");

  if (error) throw error;
  if (!data || data.length === 0)
    throw new Error("Could not delete — item not found or not yours.");

  revalidatePath("/app");
  revalidatePath("/app/map");
}

export async function updateWalletItemDetails(
  itemId: string,
  {
    title,
    kind,
    venueName,
    city,
    country,
  }: {
    title: string;
    kind: string;
    venueName?: string | null;
    city?: string | null;
    country?: string | null;
  },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("wallet_items")
    .update({ title, kind })
    .eq("id", itemId)
    .eq("user_id", user.id)
    .select("id");

  if (error) throw error;
  if (!data || data.length === 0)
    throw new Error("Could not update — item not found or not yours.");

  // Upsert venue. Mirrors confirmCapture — including, until now, its bug: this
  // wrote with the session client, which the venues RLS silently denies (public
  // reads, service-role writes only). Correcting a venue by hand therefore left
  // venue_id null and the item still absent from the map. Service client, error
  // surfaced, and geocoded so a corrected venue actually lands in the right
  // place rather than nowhere.
  const trimmedName = venueName?.trim() ?? "";
  if (trimmedName) {
    const service = createServiceClient();
    const { data: existing } = await service
      .from("venues")
      .select("id")
      .eq("name", trimmedName)
      .eq("city", city ?? "")
      .maybeSingle();

    let venueId: string | null = null;
    if (existing) {
      venueId = existing.id;
    } else {
      const [venueGeo, cityGeo] = await Promise.all([
        geocodePlace([trimmedName, city, country].filter(Boolean).join(", ")),
        geocodePlace([city, country].filter(Boolean).join(", ")),
      ]);
      const { data: v, error: venueErr } = await service
        .from("venues")
        .insert({
          name: trimmedName,
          city: city ?? null,
          country: country ?? null,
          lat: venueGeo?.lat ?? null,
          lng: venueGeo?.lng ?? null,
          city_lat: cityGeo?.lat ?? null,
          city_lng: cityGeo?.lng ?? null,
        })
        .select("id")
        .single();
      if (venueErr) {
        console.error("[updateItemDetails] venue insert failed:", venueErr.message);
      }
      venueId = v?.id ?? null;
    }

    await supabase
      .from("wallet_items")
      .update({ venue_id: venueId })
      .eq("id", itemId)
      .eq("user_id", user.id);
  } else if (venueName !== undefined) {
    // Explicit empty string clears the venue.
    await supabase
      .from("wallet_items")
      .update({ venue_id: null })
      .eq("id", itemId)
      .eq("user_id", user.id);
  }

  revalidatePath(`/app/item/${itemId}`);
  revalidatePath("/app");
  revalidatePath("/app/map");
}
