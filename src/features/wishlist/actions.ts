"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

const WishInput = z.object({
  kind: z.enum(["artist", "destination", "venue", "hotel"]),
  name: z.string().min(1).max(120),
  subtitle: z.string().max(200).optional().nullable(),
  externalId: z.string().optional().nullable(),
});

export async function addWishlistItem(input: z.infer<typeof WishInput>) {
  const parsed = WishInput.parse(input);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase.from("wishlist").insert({
    user_id: user.id,
    kind: parsed.kind,
    name: parsed.name.trim(),
    subtitle: parsed.subtitle ?? null,
    external_id: parsed.externalId ?? null,
  });
  if (error) {
    if (error.code === "23505") throw new Error("Already on your wishlist.");
    throw error;
  }
  revalidatePath("/app/wishlist");
}

export async function removeWishlistItem(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  // .select() guard: a write blocked by RLS returns success-shaped output with
  // no rows, so without this "denied" and "done" are indistinguishable and the
  // UI reports the change happened.
  const { data, error } = await supabase
    .from("wishlist")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id");
  if (error) throw error;
  if (!data || data.length === 0) throw new Error("Wishlist item not found.");
  revalidatePath("/app/wishlist");
}

/**
 * Mark an alert as read or dismissed. Click-through to the partner URL goes
 * through /api/affiliate/[id] which tags the URL and bumps state.
 */
export async function markAlertState(
  alertId: string,
  state: "read" | "dismissed",
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  // .select() guard: a write blocked by RLS returns success-shaped output with
  // no rows, so without this "denied" and "done" are indistinguishable and the
  // UI reports the change happened.
  const { data, error } = await supabase
    .from("alerts")
    .update({ state })
    .eq("id", alertId)
    .eq("user_id", user.id)
    .select("id");
  if (error) throw error;
  if (!data || data.length === 0) throw new Error("Alert not found.");
  revalidatePath("/app/alerts");
}
