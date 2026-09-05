"use server";

import { revalidatePath } from "next/cache";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { geocodePlace } from "@/lib/geo/geocode";
import { deriveStatus, effectiveEnd } from "@/lib/wallet/lifecycle";
import { mintMissingPins } from "@/lib/wallet/reconcile";

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
    .select("id, status, kind, title, subtitle, venue_id, capture_id");

  if (error) throw error;
  if (!data || data.length === 0)
    throw new Error("Could not update — item not found or not yours.");
  const item = data[0];

  // A date edit changes what the item IS: a mis-parsed 2024 gig corrected to
  // 2026 is upcoming, not attended. Re-derive the status (wishlist and
  // archived are the user's call and stay put) and keep the experience row —
  // what the map, memories and the time-shift privacy rule read — in step.
  if (item.status !== "wishlist" && item.status !== "archived") {
    const derived = deriveStatus(starts_at, ends_at);
    if (derived !== item.status) {
      await supabase
        .from("wallet_items")
        .update({ status: derived })
        .eq("id", itemId)
        .eq("user_id", user.id);
    }

    const { data: pins } = await supabase
      .from("experiences")
      .select("id, rating, review, photos")
      .eq("wallet_item_id", itemId)
      .eq("user_id", user.id);
    const pin = pins?.[0];

    if (derived === "attended") {
      if (pin && starts_at) {
        await supabase
          .from("experiences")
          .update({
            starts_at,
            ends_at: new Date(effectiveEnd(starts_at, ends_at)).toISOString(),
          })
          .eq("id", pin.id)
          .eq("user_id", user.id);
      } else if (!pin) {
        await mintMissingPins(supabase, user.id, [
          { ...item, starts_at, ends_at },
        ]);
      }
    } else if (pin) {
      // The gig is no longer in the past. An untouched auto-minted pin is
      // simply wrong now and goes; one the user rated, reviewed or added
      // photos to is theirs to delete.
      const untouched =
        pin.rating == null &&
        !pin.review &&
        (!Array.isArray(pin.photos) || pin.photos.length === 0);
      if (untouched) {
        await supabase.from("experiences").delete().eq("id", pin.id).eq("user_id", user.id);
      } else if (starts_at) {
        await supabase
          .from("experiences")
          .update({
            starts_at,
            ends_at: new Date(effectiveEnd(starts_at, ends_at)).toISOString(),
          })
          .eq("id", pin.id)
          .eq("user_id", user.id);
      }
    }
  }

  // Trips are clustered by date; let them follow the edit.
  await supabase.rpc("trip_assemble", { target_user: user.id });

  revalidatePath(`/app/item/${itemId}`);
  revalidatePath("/app");
  revalidatePath("/app/map");
  revalidatePath("/app/trips");
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

  // Drops any trip this was the last item of.
  await supabase.rpc("trip_assemble", { target_user: user.id });

  revalidatePath("/app");
  revalidatePath("/app/map");
  revalidatePath("/app/trips");
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

  // The pin carries its own copy of the title and kind.
  await supabase
    .from("experiences")
    .update({ title, kind: kind as never })
    .eq("wallet_item_id", itemId)
    .eq("user_id", user.id);

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
    await supabase
      .from("experiences")
      .update({ venue_id: venueId })
      .eq("wallet_item_id", itemId)
      .eq("user_id", user.id);
  } else if (venueName !== undefined) {
    // Explicit empty string clears the venue.
    await supabase
      .from("wallet_items")
      .update({ venue_id: null })
      .eq("id", itemId)
      .eq("user_id", user.id);
    await supabase
      .from("experiences")
      .update({ venue_id: null })
      .eq("wallet_item_id", itemId)
      .eq("user_id", user.id);
  }

  revalidatePath(`/app/item/${itemId}`);
  revalidatePath("/app");
  revalidatePath("/app/map");
}
