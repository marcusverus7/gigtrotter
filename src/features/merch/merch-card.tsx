"use client";

import Link from "next/link";
import { Clock, MapPin, Package, ShoppingBag, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export type MerchItem = {
  id: string;
  title: string;
  description: string | null;
  images: string[];
  artist_name: string | null;
  price_cents: number;
  currency: string;
  fulfilment: string[];
  published: boolean;
  venues: { name: string | null; city: string | null } | null;
  merch_drops: Array<{
    id: string;
    title: string;
    status: string;
    opens_at: string;
    closes_at: string | null;
    total_stock: number | null;
    total_sold: number;
  }>;
  merch_variants: Array<{
    id: string;
    label: string;
    price_cents: number | null;
    stock: number | null;
    sold_count: number;
  }>;
};

function money(cents: number, currency: string) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function MerchCard({ item }: { item: MerchItem }) {
  const liveDrop = item.merch_drops?.find((d) => d.status === "live");
  const hasCollect = item.fulfilment?.includes("collect_at_venue");
  const hasShip = item.fulfilment?.includes("ship_to_home");
  const lowestVariantPrice = item.merch_variants
    ?.filter((v) => v.price_cents !== null)
    .reduce((min, v) => Math.min(min, v.price_cents!), Infinity);
  const displayPrice =
    lowestVariantPrice !== Infinity && lowestVariantPrice < item.price_cents
      ? lowestVariantPrice
      : item.price_cents;

  return (
    <Link href={`/app/merch/${item.id}`}>
      <Card className="group overflow-hidden transition-all hover:border-primary/40 hover:shadow-lg">
        {item.images.length > 0 ? (
          <div className="aspect-square overflow-hidden bg-muted">
            <img
              src={item.images[0]}
              alt={item.title}
              className="h-full w-full object-cover transition-transform group-hover:scale-105"
            />
          </div>
        ) : (
          <div className="flex aspect-square items-center justify-center bg-gradient-to-br from-primary/10 to-secondary/10">
            <ShoppingBag className="h-12 w-12 text-muted-foreground/40" />
          </div>
        )}
        <CardHeader className="pb-2 pt-3">
          <div className="flex flex-wrap gap-1.5">
            {liveDrop ? (
              <Badge variant="inner" className="text-[10px]">
                <Sparkles className="mr-1 h-3 w-3" />
                {liveDrop.title}
              </Badge>
            ) : null}
            {hasCollect ? (
              <Badge variant="outline" className="text-[10px]">
                <MapPin className="mr-1 h-3 w-3" />
                Venue pickup
              </Badge>
            ) : null}
            {hasShip ? (
              <Badge variant="outline" className="text-[10px]">
                <Package className="mr-1 h-3 w-3" />
                Ships home
              </Badge>
            ) : null}
          </div>
          <CardTitle className="mt-1 text-base leading-tight">
            {item.title}
          </CardTitle>
          {item.artist_name ? (
            <p className="text-xs text-muted-foreground">{item.artist_name}</p>
          ) : null}
        </CardHeader>
        <CardContent className="pb-4">
          <div className="flex items-baseline justify-between">
            <p className="font-mono text-lg font-bold tnum">
              {lowestVariantPrice !== Infinity && lowestVariantPrice < item.price_cents
                ? `From ${money(displayPrice, item.currency)}`
                : money(displayPrice, item.currency)}
            </p>
            {liveDrop?.total_stock ? (
              <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Clock className="h-3 w-3" />
                {liveDrop.total_stock - liveDrop.total_sold} left
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
