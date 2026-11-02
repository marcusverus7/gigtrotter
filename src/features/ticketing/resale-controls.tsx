"use client";

import { useState, useTransition } from "react";
import { Tag } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/tickets/pricing";

import { listTicketForResale, withdrawListing } from "./resale-actions";

export type OwnListing = { id: string; priceCents: number; currency: string; status: string };

/**
 * The seller's side of face-value resale, on their own ticket. Listing is one
 * tap; the price is never a choice. While a buyer is mid-checkout the listing
 * is locked and says so.
 */
export function ResaleControls({
  ticketId,
  listing,
}: {
  ticketId: string;
  listing: OwnListing | null;
}) {
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (listing?.status === "reserved") {
    return (
      <p className="text-xs text-muted-foreground" role="status">
        Someone is buying this ticket right now. If they do not finish within 30 minutes it goes
        back on sale.
      </p>
    );
  }

  if (listing) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm">
          Listed for resale at <strong>{formatMoney(listing.priceCents, listing.currency)}</strong>
        </p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => {
            setMsg(null);
            start(async () => {
              try {
                await withdrawListing(listing.id);
              } catch (e) {
                setMsg(e instanceof Error ? e.message : "Could not withdraw.");
              }
            });
          }}
        >
          {pending ? "Withdrawing…" : "Withdraw listing"}
        </Button>
        {msg ? (
          <p className="w-full text-xs text-destructive" role="alert">
            {msg}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => {
          setMsg(null);
          start(async () => {
            try {
              await listTicketForResale(ticketId);
            } catch (e) {
              setMsg(e instanceof Error ? e.message : "Could not list the ticket.");
            }
          });
        }}
      >
        <Tag /> {pending ? "Listing…" : "Sell at face value"}
      </Button>
      <p className="w-full text-xs text-muted-foreground">
        Exactly what you paid comes back to your card when another fan buys it. Anyone on the
        want-one list is told straight away.
      </p>
      {msg ? (
        <p className="w-full text-xs text-destructive" role="alert">
          {msg}
        </p>
      ) : null}
    </div>
  );
}
