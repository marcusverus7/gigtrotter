import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ShoppingBag, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { MerchCard } from "@/features/merch/merch-card";

export const metadata: Metadata = { title: "Merch Store" };

export default async function MerchPage() {
  const supabase = await createClient();
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const { data: items } = await supabase
    .from("merch_items")
    .select(
      "id, title, description, images, artist_name, price_cents, currency, fulfilment, published, venues(name, city), merch_drops(id, title, status, opens_at, closes_at, total_stock, total_sold), merch_variants(id, label, price_cents, stock, sold_count)",
    )
    .eq("published", true)
    .order("created_at", { ascending: false })
    .limit(50);

  const liveDrops = items?.filter((i) =>
    i.merch_drops?.some((d) => d.status === "live"),
  );
  const regularItems = items?.filter(
    (i) => !i.merch_drops?.some((d) => d.status === "live"),
  );

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <ShoppingBag className="h-4 w-4 text-primary" />
          Artist merch · presales · limited editions
        </div>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Merch Store</h1>
        <p className="text-sm text-muted-foreground">
          Official merch from artists and promoters. Ship to your door or
          collect at the venue with proof of purchase.
        </p>
      </header>

      {liveDrops && liveDrops.length > 0 ? (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Live drops
            </h2>
            <Badge variant="inner" className="text-[10px]">
              Limited
            </Badge>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {liveDrops.map((item) => (
              <MerchCard key={item.id} item={item as any} />
            ))}
          </div>
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          All merch · {items?.length ?? 0} items
        </h2>
        {!items || items.length === 0 ? (
          <Card className="border-dashed">
            <CardHeader>
              <CardTitle className="text-base">No merch listed yet</CardTitle>
              <CardDescription>
                Artists and promoters will list merch here — linked to gigs in
                your wallet. Check back before your next event.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(regularItems ?? items).map((item) => (
              <MerchCard key={item.id} item={item as any} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
