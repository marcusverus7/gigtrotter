import { ArrowRightLeft } from "lucide-react";

import type { IssuerInfo } from "@/lib/tickets/issuer";

/**
 * "Can't go?" — routed by issuer, because the right answer depends on who
 * sold the ticket: DICE has a face-value returns waiting list (with a
 * cut-off), Ticketmaster has Transfer, most others let you forward the PDF.
 * A listing on GigTrotter's own marketplace comes back here once that is
 * open; until then the honest options are the issuer's.
 */
const ROUTES: Record<string, { label: string; url: string; note: string }> = {
  dice: {
    label: "Return it on DICE",
    url: "https://dice.fm/account/tickets",
    note: "DICE's Waiting List resells it at face value — usually up to the day before. After the cut-off it can't be returned.",
  },
  ticketmaster: {
    label: "Transfer on Ticketmaster",
    url: "https://www.ticketmaster.co.uk/member/tickets",
    note: "Ticket Transfer sends it to a friend's account; Fan-to-Fan resale lists it at face value where the event allows.",
  },
  axs: {
    label: "Transfer on AXS",
    url: "https://www.axs.com/my-account/tickets",
    note: "AXS lets you transfer or list for resale from the ticket itself, where the event allows.",
  },
  seetickets: {
    label: "Resell on See Tickets",
    url: "https://www.seetickets.com/customerservice",
    note: "See Tickets offers face-value resale through its Fan-to-Fan service for many events.",
  },
  skiddle: {
    label: "Resell on Skiddle",
    url: "https://www.skiddle.com/orders/",
    note: "Skiddle's Re:Sell lists it at face value and refunds you when it goes.",
  },
};

export function CantGo({ issuer }: { issuer: IssuerInfo }) {
  const route = issuer.issuer ? ROUTES[issuer.issuer] : null;
  return (
    <div className="rounded-lg border border-border bg-muted/20 p-4">
      <p className="flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-muted-foreground">
        <ArrowRightLeft className="h-3.5 w-3.5" /> Can&apos;t go?
      </p>
      {route ? (
        <>
          <p className="mt-2 text-sm">{route.note}</p>
          <a
            href={route.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex min-h-[44px] items-center gap-2 rounded-md border border-border px-4 text-sm font-medium"
          >
            {route.label}
          </a>
        </>
      ) : (
        <p className="mt-2 text-sm">
          Forward the ticket email or PDF to whoever is going instead — most e-tickets are static barcodes and scan
          for whoever holds them. Face-value listing here is coming.
        </p>
      )}
    </div>
  );
}
