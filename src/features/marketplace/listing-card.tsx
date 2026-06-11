"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Calendar, MapPin, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { placeOffer, cancelListing } from "./actions";

type Listing = {
  id: string;
  asking_price_cents: number;
  face_value_cents: number;
  currency: string;
  fee_bps: number;
  notes: string | null;
  created_at: string;
  seller_id: string;
  wallet_items:
    | Array<{
        id: string;
        title: string;
        subtitle: string | null;
        starts_at: string | null;
        venues: Array<{ name: string | null; city: string | null; country: string | null }> | { name: string | null; city: string | null; country: string | null } | null;
      }>
    | {
        id: string;
        title: string;
        subtitle: string | null;
        starts_at: string | null;
        venues: Array<{ name: string | null; city: string | null; country: string | null }> | { name: string | null; city: string | null; country: string | null } | null;
      };
};

function money(cents: number, currency: string) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function ListingCard({
  listing,
  viewerId,
}: {
  listing: Listing;
  viewerId: string;
}) {
  const [pending, startTransition] = useTransition();

  const w = Array.isArray(listing.wallet_items)
    ? listing.wallet_items[0]
    : listing.wallet_items;
  if (!w) return null;
  const v = Array.isArray(w.venues) ? w.venues[0] : w.venues;
  const place = [v?.name, v?.city].filter(Boolean).join(" · ");

  const isOwn = listing.seller_id === viewerId;
  const fee = Math.round((listing.asking_price_cents * listing.fee_bps) / 10_000);
  const total = listing.asking_price_cents + fee;

  return (
    <Card className="overflow-hidden transition-colors hover:border-primary/40">
      <CardHeader className="bg-gradient-to-br from-primary/10 via-card to-secondary/5 pb-3">
        <div className="flex items-center gap-2">
          <Badge variant="verified" className="text-[10px]">
            <ShieldCheck className="mr-1 h-3 w-3" />
            Verified seller
          </Badge>
          {listing.asking_price_cents < listing.face_value_cents ? (
            <Badge variant="open" className="text-[10px]">
              Below face
            </Badge>
          ) : null}
        </div>
        <CardTitle className="mt-2 text-base leading-tight">{w.title}</CardTitle>
        {place ? (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3" />
            {place}
          </p>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-3 pt-4">
        {w.starts_at ? (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Calendar className="h-3 w-3" />
            {new Intl.DateTimeFormat(undefined, {
              weekday: "short",
              day: "numeric",
              month: "short",
              year: "numeric",
            }).format(new Date(w.starts_at))}
          </p>
        ) : null}

        <div className="flex items-baseline justify-between">
          <div>
            <p className="font-mono text-2xl font-bold tnum">
              {money(listing.asking_price_cents, listing.currency)}
            </p>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Face: {money(listing.face_value_cents, listing.currency)} · Fee:{" "}
              {money(fee, listing.currency)}
            </p>
          </div>
          <div className="text-right">
            <p className="font-mono text-xs text-muted-foreground">
              You pay
            </p>
            <p className="font-mono text-base font-medium tnum">
              {money(total, listing.currency)}
            </p>
          </div>
        </div>

        {listing.notes ? (
          <p className="text-xs italic text-muted-foreground">{listing.notes}</p>
        ) : null}

        {isOwn ? (
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() =>
              startTransition(async () => {
                await cancelListing(listing.id);
                toast.success("Listing cancelled.");
              })
            }
            disabled={pending}
          >
            {pending ? "Cancelling…" : "Cancel listing"}
          </Button>
        ) : (
          <Button
            size="sm"
            className="w-full"
            onClick={() =>
              startTransition(async () => {
                await placeOffer(listing.id);
                toast.success("Offer placed — seller will be notified.");
              })
            }
            disabled={pending}
          >
            {pending ? "Reserving…" : "Reserve"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
