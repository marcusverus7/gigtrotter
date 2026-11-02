import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";

/**
 * The owner's private profile fields (anonymous-board handle, Plus status,
 * alert scan time). Since 0033 these columns are not table-readable by the
 * client roles — `profiles` is read-all so that usernames resolve, and the
 * anonymous board must not be linkable to the username — so the owner gets
 * them through my_profile_private(). Before 0033 is applied the RPC is
 * absent and the columns are still readable, so fall back to the table.
 */
export type PrivateProfile = {
  anon_handle: string;
  anon_hash: string;
  anon_revoked: boolean;
  anon_views: number;
  plan: "free" | "plus";
  last_alert_scan_at: string | null;
};

type Client = SupabaseClient<Database>;

export async function getPrivateProfile(supabase: Client, userId: string): Promise<PrivateProfile | null> {
  const { data, error } = await supabase.rpc("my_profile_private");
  if (!error) {
    const row = (Array.isArray(data) ? data[0] : data) as PrivateProfile | undefined;
    return row ?? null;
  }
  const { data: row } = await supabase
    .from("profiles")
    .select("anon_handle, anon_hash, anon_revoked, anon_views, plan, last_alert_scan_at")
    .eq("id", userId)
    .maybeSingle();
  return (row as PrivateProfile | null) ?? null;
}
