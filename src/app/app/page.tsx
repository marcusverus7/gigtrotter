import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus, Ticket } from "lucide-react";

export const metadata: Metadata = { title: "Wallet" };

import { Button } from "@/components/ui/button";
import { Wallet } from "@/features/wallet/wallet";
import { MorningAfterQueue } from "@/features/wallet/morning-after-queue";
import { ThrowbacksStrip } from "@/features/wallet/throwbacks";
import { YearReviewTeaser } from "@/features/review/review-teaser";
import { createClient } from "@/lib/supabase/server";

/**
 * /app — the Wallet. The utility surface that earns the home screen.
 * Tonight first, then upcoming, then wishlist, then attended.
 */
export default async function WalletPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: items } = await supabase
    .from("wallet_items")
    .select("*, venues(name, city, country)")
    .eq("user_id", user.id)
    .order("starts_at", { ascending: true, nullsFirst: false });

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

      <Wallet items={items ?? []} />

      {(!items || items.length === 0) && <EmptyState />}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="mx-auto mt-12 max-w-md rounded-xl border border-dashed border-border bg-card/40 p-10 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Ticket className="h-6 w-6" />
      </div>
      <h2 className="text-lg font-semibold">No items yet</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Drop your next ticket into <Link href="/app/capture" className="text-primary underline">Capture</Link>{" "}
        — or backfill from your camera roll. Your map populates as you go.
      </p>
    </div>
  );
}
