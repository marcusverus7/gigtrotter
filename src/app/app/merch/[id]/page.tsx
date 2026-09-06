import { LocalDateTime } from "@/components/local-datetime";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  ArrowLeft,
  Clock,
  MapPin,
  Package,
  ShoppingBag,
  Sparkles,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { OrderForm } from "@/features/merch/order-form";

export const metadata: Metadata = { title: "Merch" };

function money(cents: number, currency: string) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

export default async function MerchDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const { data: item } = await supabase
    .from("merch_items")
    .select(
      "*, venues(name, city, country), merch_variants(id, label, sku, price_cents, stock, sold_count, sort_order), merch_drops(id, title, description, status, opens_at, closes_at, total_stock, total_sold, linked_gig_id, collection_venue_id)",
    )
    .eq("id", id)
    .eq("published", true)
    .maybeSingle();

  if (!item) notFound();

  const venue = item.venues?.name
    ? [item.venues.name, item.venues.city, item.venues.country]
        .filter(Boolean)
        .join(" · ")
    : null;

  const variants = (item.merch_variants ?? []).sort(
    (a: any, b: any) => a.sort_order - b.sort_order,
  );
  const drops = item.merch_drops ?? [];
  const liveDrop = drops.find((d: any) => d.status === "live");
  const upcomingDrops = drops.filter((d: any) => d.status === "upcoming");

  const { data: gigLinks } = await supabase
    .from("merch_gig_links")
    .select("wallet_item_id, wallet_items(id, title, starts_at)")
    .eq("merch_item_id", id);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/app/merch">
          <ArrowLeft /> Back to store
        </Link>
      </Button>

      <div className="grid gap-6 md:grid-cols-[1fr_1fr]">
        {/* Images */}
        <div className="space-y-2">
          {item.images.length > 0 ? (
            <>
              <div className="overflow-hidden rounded-lg border border-border">
                <img
                  src={item.images[0]}
                  alt={item.title}
                  className="aspect-square w-full object-cover"
                />
              </div>
              {item.images.length > 1 ? (
                <div className="grid grid-cols-4 gap-2">
                  {item.images.slice(1, 5).map((img: string, i: number) => (
                    <div
                      key={i}
                      className="overflow-hidden rounded-md border border-border"
                    >
                      <img
                        src={img}
                        alt=""
                        className="aspect-square w-full object-cover"
                      />
                    </div>
                  ))}
                </div>
              ) : null}
            </>
          ) : (
            <div className="flex aspect-square items-center justify-center rounded-lg border border-dashed border-border bg-gradient-to-br from-primary/10 to-secondary/10">
              <ShoppingBag className="h-16 w-16 text-muted-foreground/30" />
            </div>
          )}
        </div>

        {/* Details */}
        <div className="space-y-4">
          <div>
            <div className="flex flex-wrap gap-1.5">
              {liveDrop ? (
                <Badge variant="inner" className="text-[10px]">
                  <Sparkles className="mr-1 h-3 w-3" />
                  {liveDrop.title}
                </Badge>
              ) : null}
              {item.fulfilment?.includes("collect_at_venue") ? (
                <Badge variant="outline" className="text-[10px]">
                  <MapPin className="mr-1 h-3 w-3" />
                  Venue pickup
                </Badge>
              ) : null}
              {item.fulfilment?.includes("ship_to_home") ? (
                <Badge variant="outline" className="text-[10px]">
                  <Package className="mr-1 h-3 w-3" />
                  Ships home
                </Badge>
              ) : null}
            </div>
            <h1 className="mt-2 text-2xl font-bold tracking-tight">
              {item.title}
            </h1>
            {item.artist_name ? (
              <p className="text-sm text-muted-foreground">
                by {item.artist_name}
              </p>
            ) : null}
            {venue ? (
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="h-3 w-3" />
                {venue}
              </p>
            ) : null}
          </div>

          <p className="font-mono text-3xl font-bold tnum">
            {money(item.price_cents, item.currency)}
          </p>

          {item.description ? (
            <p className="text-sm text-muted-foreground">{item.description}</p>
          ) : null}

          {liveDrop ? (
            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="flex items-center gap-3 p-4">
                <Sparkles className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-sm font-medium">{liveDrop.title}</p>
                  {liveDrop.total_stock ? (
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {liveDrop.total_stock - liveDrop.total_sold} of{" "}
                      {liveDrop.total_stock} remaining
                    </p>
                  ) : null}
                  {liveDrop.closes_at ? (
                    <p className="text-xs text-muted-foreground">
                      Ends{" "}
                      <LocalDateTime
                        iso={liveDrop.closes_at}
                        options={{
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        }}
                      />
                    </p>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ) : null}

          {upcomingDrops.length > 0 ? (
            <div className="space-y-2">
              {upcomingDrops.map((d: any) => (
                <Card key={d.id} className="border-dashed">
                  <CardContent className="flex items-center gap-3 p-4">
                    <Clock className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">{d.title}</p>
                      <p className="text-xs text-muted-foreground">
                        Opens{" "}
                        <LocalDateTime
                          iso={d.opens_at}
                          options={{
                            weekday: "short",
                            day: "numeric",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          }}
                        />
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : null}

          <Separator />

          <OrderForm
            merchItemId={item.id}
            basePriceCents={item.price_cents}
            currency={item.currency}
            variants={variants}
            drops={drops.filter((d: any) => d.status === "live")}
            fulfilmentModes={item.fulfilment ?? ["ship_to_home"]}
          />
        </div>
      </div>

      {/* Linked gigs */}
      {gigLinks && gigLinks.length > 0 ? (
        <section className="space-y-3">
          <Separator />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Available at these gigs
          </h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {gigLinks.map((link: any) =>
              link.wallet_items ? (
                <Link
                  key={link.wallet_item_id}
                  href={`/app/item/${link.wallet_item_id}`}
                  className="rounded-lg border border-border bg-card p-3 transition-colors hover:border-primary/40"
                >
                  <p className="text-sm font-medium">
                    {link.wallet_items.title}
                  </p>
                  {link.wallet_items.starts_at ? (
                    <p className="text-xs text-muted-foreground">
                      <LocalDateTime
                        iso={link.wallet_items.starts_at}
                        options={{ weekday: "short", day: "numeric", month: "short" }}
                      />
                    </p>
                  ) : null}
                </Link>
              ) : null,
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}
