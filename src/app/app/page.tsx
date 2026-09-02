import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";

export const metadata: Metadata = { title: "Wallet" };

import { Button } from "@/components/ui/button";
import { Wallet, type WalletListItem } from "@/features/wallet/wallet";
import { MorningAfterQueue } from "@/features/wallet/morning-after-queue";
import { ThrowbacksStrip } from "@/features/wallet/throwbacks";
import { YearReviewTeaser } from "@/features/review/review-teaser";
import { EmptyWalletCta } from "@/features/wallet/empty-wallet-cta";
import { createClient, getSessionUser } from "@/lib/supabase/server";

/**
 * /app — the Wallet. The utility surface that earns the home screen.
 * Tonight first, then upcoming, then wishlist, then attended.
 */
export default async function WalletPage() {
  const supabase = await createClient();
  const user = await getSessionUser();
  if (!user) return null;

  const { data: items } = await supabase
    .from("wallet_items")
    .select(
      "id, kind, status, title, subtitle, starts_at, ends_at, venues(name, city, country)",
    )
    .eq("user_id", user.id)
    .order("starts_at", { ascending: true, nullsFirst: false })
    .limit(500);

  if (!items || items.length === 0) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .single();
    if (!profile?.display_name) redirect("/app/onboarding");
  }

  return (
    <div className="space-y-8">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Your wallet</h1>
          <p className="text-sm text-muted-foreground">
            Tonight&apos;s ticket, next month&apos;s flight, last summer&apos;s gigs.
          </p>
        </div>
        <Button asChild size="sm">
          <Link href="/app/capture">
            <Plus /> Add
          </Link>
        </Button>
      </header>

      <MorningAfterQueue />
      <YearReviewTeaser />
      <ThrowbacksStrip />

      <Wallet
        items={((items ?? []) as unknown[]).map((raw) => {
          // The query builder types the venues embed as an array even though
          // a to-one FK returns an object; normalise either shape once here.
          const it = raw as Omit<WalletListItem, "venues"> & {
            venues: WalletListItem["venues"] | WalletListItem["venues"][];
          };
          return {
            ...it,
            venues: Array.isArray(it.venues) ? (it.venues[0] ?? null) : it.venues,
          };
        })}
      />

      {(!items || items.length === 0) && <EmptyWalletCta />}
    </div>
  );
}
