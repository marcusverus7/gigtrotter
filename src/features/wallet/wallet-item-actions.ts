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

export async function updateWalletItemDetails(
  itemId: string,
  { title, kind }: { title: string; kind: string },
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

  revalidatePath(`/app/item/${itemId}`);
  revalidatePath("/app");
}
