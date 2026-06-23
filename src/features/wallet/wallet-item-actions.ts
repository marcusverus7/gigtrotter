"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

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

  // Upsert venue: mirror confirmCapture's lookup-then-insert pattern.
  const trimmedName = venueName?.trim() ?? "";
  if (trimmedName) {
    const { data: existing } = await supabase
      .from("venues")
      .select("id")
      .eq("name", trimmedName)
      .eq("city", city ?? "")
      .maybeSingle();

    let venueId: string | null = null;
    if (existing) {
      venueId = existing.id;
    } else {
      const { data: v } = await supabase
        .from("venues")
        .insert({
          name: trimmedName,
          city: city ?? null,
          country: country ?? null,
        })
        .select("id")
        .single();
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
