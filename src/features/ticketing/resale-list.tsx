"use client";

import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { buyerFeeCents, formatMoney, type FeeSchedule } from "@/lib/tickets/pricing";

import { createResaleCheckout } from "./resale-actions";

export type ListingView = { id: string; tierName: string; priceCents: number; currency: string };

/**
 * Fan-to-fan tickets on the event page, at face value, through the same
 * checkout as a primary sale. Shown whenever a listing is open — the point is
 * a sold-out night that still fills.
 */
export function ResaleList({
  listings,
  fees,
  paymentsOn,
}: {
  listings: ListingView[];
  fees: FeeSchedule;
  paymentsOn: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [buying, setBuying] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-muted-foreground">
        <RefreshCw className="h-3.5 w-3.5" /> Fan resale · face value
      </p>
      <ul className="mt-3 divide-y divide-border">
        {listings.map((l) => (
          <li key={l.id} className="flex items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="font-medium">{l.tierName}</p>
              <p className="text-sm text-muted-foreground">
                {formatMoney(l.priceCents, l.currency)}
                <span className="text-xs">
                  {" "}
                  + {formatMoney(buyerFeeCents(l.priceCents, fees), l.currency)} fee
                </span>
              </p>
            </div>
            <Button
              size="sm"
              disabled={pending || !paymentsOn}
              onClick={() => {
                setError(null);
                setBuying(l.id);
                start(async () => {
                  try {
                    const { url } = await createResaleCheckout(l.id);
                    window.location.assign(url);
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Could not start checkout.");
                    setBuying(null);
                  }
                });
              }}
            >
              {pending && buying === l.id ? "Opening…" : "Buy"}
            </Button>
          </li>
        ))}
      </ul>
      {!paymentsOn ? (
        <p className="mt-2 text-xs text-muted-foreground">Payments are not switched on yet.</p>
      ) : null}
      {error ? (
        <p className="mt-2 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <p className="mt-3 text-[11px] text-muted-foreground">
        Another fan can&apos;t go. You pay what they paid; their old QR stops working the moment
        yours is issued.
      </p>
    </div>
  );
}
