"use client";

import Link from "next/link";
import { MapPin, Package, ShoppingBag, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type GigMerchItem = {
  id: string;
  title: string;
  images: string[];
  artist_name: string | null;
  price_cents: number;
  currency: string;
  fulfilment: string[];
  drop_title: string | null;
  drop_status: string | null;
  drop_remaining: number | null;
};

function money(cents: number, currency: string) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function GigMerchSection({ items }: { items: GigMerchItem[] }) {
  if (items.length === 0) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <ShoppingBag className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Merch for this gig
        </h3>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((item) => (
          <Link key={item.id} href={`/app/merch/${item.id}`}>
            <Card className="group overflow-hidden transition-all hover:border-primary/40">
              <div className="flex gap-3 p-3">
                {item.images.length > 0 ? (
                  <div className="h-20 w-20 shrink-0 overflow-hidden rounded-md bg-muted">
                    <img
                      src={item.images[0]}
                      alt={item.title}
                      className="h-full w-full object-cover transition-transform group-hover:scale-105"
                    />
                  </div>
                ) : (
                  <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-primary/10 to-secondary/10">
                    <ShoppingBag className="h-6 w-6 text-muted-foreground/40" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap gap-1">
                    {item.drop_status === "live" ? (
                      <Badge variant="inner" className="text-[9px]">
                        <Sparkles className="mr-0.5 h-2.5 w-2.5" />
                        {item.drop_title}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="mt-0.5 truncate text-sm font-medium">
                    {item.title}
                  </p>
                  {item.artist_name ? (
                    <p className="truncate text-xs text-muted-foreground">
                      {item.artist_name}
                    </p>
                  ) : null}
                  <div className="mt-1 flex items-center gap-2">
                    <p className="font-mono text-sm font-bold tnum">
                      {money(item.price_cents, item.currency)}
                    </p>
                    {item.drop_remaining !== null ? (
                      <span className="text-[10px] text-muted-foreground">
                        {item.drop_remaining} left
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1 flex gap-1">
                    {item.fulfilment?.includes("collect_at_venue") ? (
                      <Badge variant="outline" className="text-[9px] py-0 px-1">
                        <MapPin className="mr-0.5 h-2.5 w-2.5" />
                        Pickup
                      </Badge>
                    ) : null}
                    {item.fulfilment?.includes("ship_to_home") ? (
                      <Badge variant="outline" className="text-[9px] py-0 px-1">
                        <Package className="mr-0.5 h-2.5 w-2.5" />
                        Ship
                      </Badge>
                    ) : null}
                  </div>
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  );
}
