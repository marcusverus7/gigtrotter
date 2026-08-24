"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { MapPin, Package, QrCode, ShoppingBag } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { placeMerchOrder } from "./actions";

type Variant = {
  id: string;
  label: string;
  price_cents: number | null;
  stock: number | null;
  sold_count: number;
};

type Drop = {
  id: string;
  title: string;
  status: string;
  total_stock: number | null;
  total_sold: number;
  collection_venue_id: string | null;
};

type Props = {
  merchItemId: string;
  basePriceCents: number;
  currency: string;
  variants: Variant[];
  drops: Drop[];
  fulfilmentModes: string[];
};

function money(cents: number, currency: string) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

export function OrderForm({
  merchItemId,
  basePriceCents,
  currency,
  variants,
  drops,
  fulfilmentModes,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [variantId, setVariantId] = useState<string>(variants[0]?.id ?? "");
  const [dropId, setDropId] = useState<string>(drops.find((d) => d.status === "live")?.id ?? "");
  const [quantity, setQuantity] = useState(1);
  const [fulfilment, setFulfilment] = useState<"ship_to_home" | "collect_at_venue">(
    fulfilmentModes.includes("collect_at_venue") ? "collect_at_venue" : "ship_to_home",
  );
  const [error, setError] = useState<string | null>(null);
  const [orderResult, setOrderResult] = useState<{
    orderId: string;
    collectionCode: string | null;
  } | null>(null);

  // Shipping fields
  const [shippingName, setShippingName] = useState("");
  const [shippingLine1, setShippingLine1] = useState("");
  const [shippingLine2, setShippingLine2] = useState("");
  const [shippingCity, setShippingCity] = useState("");
  const [shippingPostcode, setShippingPostcode] = useState("");
  const [shippingCountry, setShippingCountry] = useState("GB");

  const selectedVariant = variants.find((v) => v.id === variantId);
  const unitPrice = selectedVariant?.price_cents ?? basePriceCents;
  const total = unitPrice * quantity;

  const selectedDrop = drops.find((d) => d.id === dropId);
  const stockLeft =
    selectedVariant?.stock !== null && selectedVariant?.stock !== undefined
      ? selectedVariant.stock - selectedVariant.sold_count
      : selectedDrop?.total_stock !== null && selectedDrop?.total_stock !== undefined
        ? selectedDrop.total_stock - (selectedDrop?.total_sold ?? 0)
        : null;
  const soldOut = stockLeft !== null && stockLeft <= 0;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const result = await placeMerchOrder({
          items: [
            {
              merchItemId,
              variantId: variantId || null,
              dropId: dropId || null,
              quantity,
            },
          ],
          fulfilment,
          shippingName: fulfilment === "ship_to_home" ? shippingName : undefined,
          shippingLine1: fulfilment === "ship_to_home" ? shippingLine1 : undefined,
          shippingLine2: fulfilment === "ship_to_home" ? shippingLine2 : undefined,
          shippingCity: fulfilment === "ship_to_home" ? shippingCity : undefined,
          shippingPostcode: fulfilment === "ship_to_home" ? shippingPostcode : undefined,
          shippingCountry: fulfilment === "ship_to_home" ? shippingCountry : undefined,
          collectionVenueId: selectedDrop?.collection_venue_id ?? undefined,
        });
        setOrderResult(result);
        toast.success(
          fulfilment === "collect_at_venue"
            ? "Order placed! Show your QR code at the merch stand."
            : "Order placed! We'll send shipping updates.",
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't place order.");
      }
    });
  }

  if (orderResult) {
    return (
      <div className="space-y-4 rounded-lg border border-secondary/30 bg-secondary/5 p-6 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-secondary/20">
          {orderResult.collectionCode ? (
            <QrCode className="h-8 w-8 text-secondary" />
          ) : (
            <Package className="h-8 w-8 text-secondary" />
          )}
        </div>
        <h3 className="text-lg font-semibold">Order confirmed</h3>
        {orderResult.collectionCode ? (
          <>
            <p className="text-sm text-muted-foreground">
              Show this code at the merch stand to collect your order.
            </p>
            <div className="mx-auto max-w-xs rounded-lg border border-border bg-background p-4">
              <p className="break-all font-mono text-sm font-bold tracking-wider">
                {orderResult.collectionCode.toUpperCase()}
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              This code is also saved in your order history.
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Shipping details confirmed. You&apos;ll receive updates when it ships.
          </p>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {variants.length > 0 ? (
        <div className="space-y-1.5">
          <Label>Size / variant</Label>
          <Select value={variantId} onValueChange={setVariantId}>
            <SelectTrigger>
              <SelectValue placeholder="Choose a variant" />
            </SelectTrigger>
            <SelectContent>
              {variants.map((v) => {
                const remaining =
                  v.stock !== null ? v.stock - v.sold_count : null;
                const out = remaining !== null && remaining <= 0;
                return (
                  <SelectItem key={v.id} value={v.id} disabled={out}>
                    {v.label}
                    {v.price_cents !== null
                      ? ` — ${money(v.price_cents, currency)}`
                      : ""}
                    {out ? " (Sold out)" : remaining !== null ? ` (${remaining} left)` : ""}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {drops.length > 0 ? (
        <div className="space-y-1.5">
          <Label>Drop</Label>
          <Select value={dropId} onValueChange={setDropId}>
            <SelectTrigger>
              <SelectValue placeholder="Select a drop" />
            </SelectTrigger>
            <SelectContent>
              {drops
                .filter((d) => d.status === "live")
                .map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.title}
                    {d.total_stock
                      ? ` · ${d.total_stock - d.total_sold} left`
                      : ""}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Quantity</Label>
          <Select
            value={String(quantity)}
            onValueChange={(v) => setQuantity(Number(v))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: Math.min(stockLeft ?? 10, 10) }, (_, i) => (
                <SelectItem key={i + 1} value={String(i + 1)}>
                  {i + 1}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {fulfilmentModes.length > 1 ? (
          <div className="space-y-1.5">
            <Label>Fulfilment</Label>
            <Select
              value={fulfilment}
              onValueChange={(v) =>
                setFulfilment(v as "ship_to_home" | "collect_at_venue")
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {fulfilmentModes.includes("ship_to_home") ? (
                  <SelectItem value="ship_to_home">
                    <span className="flex items-center gap-2">
                      <Package className="h-3 w-3" /> Ship to home
                    </span>
                  </SelectItem>
                ) : null}
                {fulfilmentModes.includes("collect_at_venue") ? (
                  <SelectItem value="collect_at_venue">
                    <span className="flex items-center gap-2">
                      <MapPin className="h-3 w-3" /> Collect at venue
                    </span>
                  </SelectItem>
                ) : null}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <div className="flex items-end">
            <Badge variant="outline" className="mb-1">
              {fulfilment === "collect_at_venue" ? (
                <>
                  <MapPin className="mr-1 h-3 w-3" /> Venue collection
                </>
              ) : (
                <>
                  <Package className="mr-1 h-3 w-3" /> Home delivery
                </>
              )}
            </Badge>
          </div>
        )}
      </div>

      {fulfilment === "ship_to_home" ? (
        <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Shipping address
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="ship-name">Full name</Label>
              <Input
                id="ship-name"
                value={shippingName}
                onChange={(e) => setShippingName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="ship-line1">Address line 1</Label>
              <Input
                id="ship-line1"
                value={shippingLine1}
                onChange={(e) => setShippingLine1(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="ship-line2">Address line 2</Label>
              <Input
                id="ship-line2"
                value={shippingLine2}
                onChange={(e) => setShippingLine2(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ship-city">City</Label>
              <Input
                id="ship-city"
                value={shippingCity}
                onChange={(e) => setShippingCity(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ship-postcode">Postcode</Label>
              <Input
                id="ship-postcode"
                value={shippingPostcode}
                onChange={(e) => setShippingPostcode(e.target.value)}
                required
              />
            </div>
            {/* Country had no input at all: the field was fixed at GB and sent
                to the server regardless of where the buyer actually lives,
                which is a strange default for an app about going to gigs
                abroad. */}
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="ship-country">Country</Label>
              <Input
                id="ship-country"
                value={shippingCountry}
                onChange={(e) =>
                  setShippingCountry(e.target.value.toUpperCase().slice(0, 2))
                }
                placeholder="GB"
                maxLength={2}
                autoComplete="country"
                className="uppercase"
                required
              />
              <p className="text-xs text-muted-foreground">
                Two-letter country code — GB, IE, DE, and so on.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-secondary/30 bg-secondary/5 p-4">
          <div className="flex items-start gap-3">
            <QrCode className="mt-0.5 h-5 w-5 text-secondary" />
            <div>
              <p className="text-sm font-medium">Venue collection</p>
              <p className="text-xs text-muted-foreground">
                After ordering, you&apos;ll get a unique code. Show it at the
                merch stand to collect your items.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between border-t border-border pt-4">
        <div>
          <p className="font-mono text-xs text-muted-foreground">Total</p>
          <p className="font-mono text-2xl font-bold tnum">
            {money(total, currency)}
          </p>
        </div>
        <div className="text-right">
          {error ? (
            <p className="mb-2 text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <Button type="submit" disabled={pending || soldOut} size="lg">
            <ShoppingBag className="mr-2 h-4 w-4" />
            {soldOut
              ? "Sold out"
              : pending
                ? "Placing order…"
                : fulfilment === "collect_at_venue"
                  ? "Order for pickup"
                  : "Order now"}
          </Button>
        </div>
      </div>
    </form>
  );
}
