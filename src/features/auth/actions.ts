"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}

/**
 * GDPR — full account erasure. Deletes the auth user via the service-role
 * admin API, which cascades through every `references auth.users on delete
 * cascade` (profiles, captures, wallet_items, experiences, friendships,
 * circles…). Storage objects don't cascade, so we clear the user's capture
 * folder first (best-effort). This is irreversible.
 */
export async function deleteMyAccount() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const admin = createServiceClient();

  // 1) Remove the user's encrypted captures + uploaded photos from Storage.
  //    DB rows cascade on the auth.users delete below, but storage objects do
  //    not — so wipe the `${userId}/` prefix explicitly. Best-effort: deletion
  //    proceeds even if this partially fails.
  try {
    const { data: files } = await admin.storage
      .from("captures")
      .list(user.id, { limit: 1000 });
    if (files && files.length > 0) {
      await admin.storage
        .from("captures")
        .remove(files.map((f) => `${user.id}/${f.name}`));
    }
  } catch {
    // ignore — the DB cascade is the source of truth for erasure
  }

  // 2) Delete the auth user → cascades to every owned row in public.*.
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) throw new Error(`Account deletion failed: ${error.message}`);

  // 3) Clear the session and leave.
  await supabase.auth.signOut();
  redirect("/");
}
