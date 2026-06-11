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
  await supabase
    .from("wishlist")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
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
  await supabase
    .from("alerts")
    .update({ state })
    .eq("id", alertId)
    .eq("user_id", user.id);
  revalidatePath("/app/alerts");
}
