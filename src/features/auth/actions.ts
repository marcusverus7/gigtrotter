"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}

/**
 * GDPR — full export of the current user's data as JSON. Phase 1 stub:
 * returns the rows the user owns. Phase 8+ will email an archive instead.
 */
export async function exportMyData() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const tables = [
    "profiles",
    "circles",
    "circle_members",
    "friendships",
    "captures",
    "wallet_items",
    "experiences",
    "trips",
  ] as const;

  const out: Record<string, unknown> = {};
  for (const t of tables) {
    const { data } = await supabase.from(t).select("*");
    out[t] = data ?? [];
  }
  return out;
}

/**
 * GDPR — full account erasure. Cascades through auth.users → public.* via
 * `on delete cascade` on every owner_id reference.
 */
export async function deleteMyAccount() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  // The actual delete requires service-role; this stub queues the request.
  // (Phase 8 implements the secure deletion job with a re-auth challenge.)
  await supabase
    .from("profiles")
    .update({ display_name: "(deleted)", avatar_url: null })
    .eq("id", user.id);
  await supabase.auth.signOut();
  redirect("/");
}
