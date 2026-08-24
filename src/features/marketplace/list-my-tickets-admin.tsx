import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { ListMyTicketsForm } from "./list-my-tickets-form";

/**
 * The seller side — lists user's resellable wallet items inline so they
 * can publish a listing in one click. We only show ticket-kind items
 * that are still 'going' (future) and not already listed.
 */
export async function ListMyTicketsAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: items } = await supabase
    .from("wallet_items")
    .select("id, title, starts_at, subtitle")
    .eq("user_id", user.id)
    .eq("kind", "ticket")
    .eq("status", "going")
    .order("starts_at", { ascending: true })
    .limit(20);

  // Exclude items already listed (live or reserved).
  const ids = (items ?? []).map((i) => i.id);
  const { data: existing } = ids.length
    ? await supabase
        .from("listings")
        .select("wallet_item_id")
        .eq("seller_id", user.id)
        .in("wallet_item_id", ids)
        .in("status", ["live", "reserved"])
    : { data: [] };
  const blocked = new Set((existing ?? []).map((e) => e.wallet_item_id));
  const sellable = (items ?? []).filter((i) => !blocked.has(i.id));

  if (sellable.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Nothing in your wallet to resell. Capture an upcoming ticket from{" "}
        <Link href="/app/capture" className="text-primary underline">
          Capture
        </Link>{" "}
        first.
      </p>
    );
  }

  return <ListMyTicketsForm items={sellable} />;
}
