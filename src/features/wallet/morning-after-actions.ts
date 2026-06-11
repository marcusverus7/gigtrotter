"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

/**
 * Record a rating + optional review on the experience (or create one if the
 * wallet item doesn't have one yet — happens when the user rates a past item
 * that hadn't auto-minted a pin).
 */
export async function rateAttended(input: {
  walletItemId: string;
  experienceId: string | null;
  rating: number;
  review: string | null;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const rating = Math.max(1, Math.min(5, Math.round(input.rating)));

  if (input.experienceId) {
    const { data, error } = await supabase
      .from("experiences")
      .update({ rating, review: input.review })
      .eq("id", input.experienceId)
      .eq("user_id", user.id)
      .select("id");
    if (error) throw error;
    if (!data || data.length === 0) throw new Error("Could not save rating.");
  } else {
    // Mint the experience from the wallet item — happens for items that
    // were "attended" but never crossed a geofence/ticket-scan path.
    const { data: wallet } = await supabase
      .from("wallet_items")
      .select("*")
      .eq("id", input.walletItemId)
      .eq("user_id", user.id)
      .single();
    if (wallet && wallet.starts_at) {
      await supabase.from("experiences").insert({
        user_id: user.id,
        wallet_item_id: wallet.id,
        venue_id: wallet.venue_id,
        kind: wallet.kind,
        title: wallet.title,
        subtitle: wallet.subtitle,
        starts_at: wallet.starts_at,
        ends_at: wallet.ends_at ?? wallet.starts_at,
        audience: "inner",
        verified_by: "manual",
        rating,
        review: input.review,
      });
    }
  }

  // Log the response so we don't re-prompt.
  await supabase
    .from("morning_after_log")
    .upsert(
      {
        user_id: user.id,
        wallet_item_id: input.walletItemId,
        responded_at: new Date().toISOString(),
      },
      { onConflict: "user_id,wallet_item_id" },
    );

  revalidatePath("/app");
}

export async function dismissMorningAfter(walletItemId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  await supabase.from("morning_after_log").upsert(
    {
      user_id: user.id,
      wallet_item_id: walletItemId,
      dismissed: true,
    },
    { onConflict: "user_id,wallet_item_id" },
  );

  revalidatePath("/app");
}
