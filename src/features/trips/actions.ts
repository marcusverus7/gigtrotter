"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

/**
 * Re-cluster wallet items into trips. Idempotent — call after any new
 * wallet_item that might extend a cluster. Per §8.2 REC, this is Polarsteps'
 * best trick with the gig inside it.
 */
export async function assembleTrips() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase.rpc("trip_assemble", {
    target_user: user.id,
  });
  if (error) throw error;
  revalidatePath("/app");
  revalidatePath("/app/trips");
}
