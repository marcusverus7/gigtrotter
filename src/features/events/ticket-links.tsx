"use client";

import { useTransition } from "react";
import { ExternalLink, Ticket } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { affiliateUrl } from "@/lib/affiliate";
import { trackOutboundClick } from "./actions";

type TicketLink = {
  id: string;
  provider: string;
  provider_label: string;
  url: string;
  min_price_cents: number | null;
  max_price_cents: number | null;
  currency: string;
  is_sold_out: boolean;
  is_affiliate: boolean;
};

function money(cents: number, currency: string) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function TicketLinks({
  links,
  eventId,
}: {
  links: TicketLink[];
  eventId: string;
}) {
  const [pending, startTransition] = useTransition();

  function handleClick(link: TicketLink) {
    startTransition(async () => {
      await trackOutboundClick(eventId, link.id);
    });
    window.open(affiliateUrl(link.provider, link.url), "_blank", "noopener,noreferrer");
  }

  if (links.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-6 text-center">
        <Ticket className="mx-auto h-8 w-8 text-muted-foreground/40" />
        <p className="mt-2 text-sm text-muted-foreground">
          No ticket links yet. Check back closer to the event, or search the
          venue&apos;s website directly.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        <Ticket className="h-4 w-4" />
        Get tickets
      </h3>
      <div className="space-y-2">
        {links.map((link) => (
          <Button
            key={link.id}
            variant="outline"
            className="w-full justify-between text-left h-auto py-3"
            onClick={() => handleClick(link)}
            disabled={link.is_sold_out || pending}
          >
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10">
                <Ticket className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium">{link.provider_label}</p>
                {link.min_price_cents ? (
                  <p className="text-xs text-muted-foreground">
                    {link.max_price_cents && link.max_price_cents !== link.min_price_cents
                      ? `${money(link.min_price_cents, link.currency)} – ${money(link.max_price_cents, link.currency)}`
                      : `From ${money(link.min_price_cents, link.currency)}`}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {link.is_sold_out ? (
                <Badge variant="destructive" className="text-[10px]">
                  Sold out
                </Badge>
              ) : link.is_affiliate ? (
                <Badge variant="verified" className="text-[10px]">
                  Partner
                </Badge>
              ) : null}
              <ExternalLink className="h-4 w-4 text-muted-foreground" />
            </div>
          </Button>
        ))}
      </div>
      <p className="text-[10px] text-muted-foreground text-center">
        Tickets are sold by third-party providers. GigTrotter doesn&apos;t process ticket payments.
      </p>
    </div>
  );
}
