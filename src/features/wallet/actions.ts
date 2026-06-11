"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import type { Audience } from "@/lib/supabase/types";

export async function setAudience(experienceId: string, audience: Audience) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // .select() guards against the silent-fail-RLS pattern: if the row is
  // owned by another user, the update affects zero rows — surface that.
  const { data, error } = await supabase
    .from("experiences")
    .update({ audience })
    .eq("id", experienceId)
    .eq("user_id", user.id)
    .select("id");

  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error("Audience update was blocked.");
  }

  revalidatePath("/app");
  revalidatePath("/app/map");
}
