import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldCheck, Ticket as TicketIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { ListingCard } from "@/features/marketplace/listing-card";
import { ListMyTicketsAdmin } from "@/features/marketplace/list-my-tickets-admin";

/**
 * /app/marketplace — anti-scalper resale.
 *
 * Sellers list tickets at face value or below — the DB enforces it. Buyers
 * pay via Stripe Connect (wired post-MVP); GigTrotter takes a buyer-side
 * booking fee. The face-value cap and verified-attendance shield are the
 * differentiation: every seller had their ticket parsed by our pipeline,
 * which neutralises the fake-listing fraud class.
 */
export default async function MarketplacePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: listings } = await supabase
    .from("listings")
    .select(
      "id, asking_price_cents, face_value_cents, currency, fee_bps, notes, created_at, seller_id, wallet_items(id, title, subtitle, starts_at, venues(name, city, country))",
    )
    .eq("status", "live")
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <ShieldCheck className="h-4 w-4 text-secondary" />
          Face value only · verified sellers
        </div>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Marketplace</h1>
        <p className="text-sm text-muted-foreground">
          A local exchange for sold-out tickets. The price cap is enforced in
          the database — scalping isn&apos;t a setting that can be flipped.
        </p>
      </header>

      <Card className="border-secondary/30 bg-secondary/5">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <TicketIcon className="h-4 w-4 text-secondary" />
            <CardTitle className="text-base">Have a spare?</CardTitle>
          </div>
          <CardDescription>
            List any ticket in your wallet. Capped at face value — never
            higher. We add a small buyer-side booking fee at checkout.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ListMyTicketsAdmin />
        </CardContent>
      </Card>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Live listings · {listings?.length ?? 0}
          </h2>
          <Badge variant="verified" className="text-[10px]">
            <ShieldCheck className="mr-1 h-3 w-3" /> Face value cap
          </Badge>
        </div>
        {!listings || listings.length === 0 ? (
          <Card className="border-dashed">
            <CardHeader>
              <CardTitle className="text-base">No tickets up for resale</CardTitle>
              <CardDescription>
                Listings show here as members add them. Watch your{" "}
                <Link
                  href="/app/wishlist"
                  className="text-primary underline"
                >
                  wishlist
                </Link>{" "}
                — we&apos;ll alert you when a match appears.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {listings.map((l) => (
              <ListingCard key={l.id} listing={l} viewerId={user.id} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
