"use client";

import { useMemo, useState, useTransition } from "react";
import { Minus, Plus, Ticket } from "lucide-react";

import { Button } from "@/components/ui/button";
import { buyerFeeCents, formatMoney, type FeeSchedule } from "@/lib/tickets/pricing";

import { createCheckout } from "./actions";

export type TierView = {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  currency: string;
  remaining: number;
  maxPerOrder: number;
  status: string;
};

/**
 * Pick tickets, see the real total, go to Stripe. The fee is shown per
 * ticket up front — no surprise at checkout, which is Eventbrite's
 * most-complained-about moment.
 */
export function BuyTickets({ eventId, tiers, fees, paymentsOn }: { eventId: string; tiers: TierView[]; fees: FeeSchedule; paymentsOn: boolean }) {
  const [qty, setQty] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const currency = tiers[0]?.currency ?? "GBP";

  const total = useMemo(() => {
    let face = 0;
    let fee = 0;
    for (const t of tiers) {
      const n = qty[t.id] ?? 0;
      face += n * t.priceCents;
      fee += n * buyerFeeCents(t.priceCents, fees);
    }
    return { face, fee, all: face + fee, count: Object.values(qty).reduce((a, b) => a + b, 0) };
  }, [qty, tiers, fees]);

  const set = (id: string, n: number, max: number) => setQty((q) => ({ ...q, [id]: Math.max(0, Math.min(max, n)) }));

  return (
    <div className="rounded-xl border border-primary/40 bg-card p-4 shadow-[0_12px_40px_-20px_rgba(124,58,237,0.5)]">
      <p className="flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-muted-foreground">
        <Ticket className="h-3.5 w-3.5" /> Tickets
      </p>
      <ul className="mt-3 divide-y divide-border">
        {tiers.map((t) => {
          const n = qty[t.id] ?? 0;
          const soldOut = t.remaining === 0 || t.status === "sold_out";
          const cap = Math.min(t.maxPerOrder, t.remaining);
          return (
            <li key={t.id} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="font-medium">{t.name}</p>
                <p className="text-sm text-muted-foreground">
                  {t.priceCents === 0 ? "Free" : formatMoney(t.priceCents, t.currency)}
                  {t.priceCents > 0 ? <span className="text-xs"> + {formatMoney(buyerFeeCents(t.priceCents, fees), t.currency)} fee</span> : null}
                  {t.remaining > 0 && t.remaining <= 10 ? <span className="ml-2 text-xs text-warning">{t.remaining} left</span> : null}
                </p>
                {t.description ? <p className="text-xs text-muted-foreground">{t.description}</p> : null}
              </div>
              {soldOut ? (
                <span className="text-sm font-medium text-muted-foreground">Sold out</span>
              ) : (
                <div className="flex items-center gap-1">
                  <Button type="button" size="icon" variant="outline" aria-label={`Fewer ${t.name}`} onClick={() => set(t.id, n - 1, cap)} disabled={n === 0}>
                    <Minus />
                  </Button>
                  <span className="w-8 text-center font-mono tnum" aria-live="polite">{n}</span>
                  <Button type="button" size="icon" variant="outline" aria-label={`More ${t.name}`} onClick={() => set(t.id, n + 1, cap)} disabled={n >= cap}>
                    <Plus />
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="text-sm text-muted-foreground">
          {total.count > 0 ? (
            <>
              <span className="text-foreground">{formatMoney(total.all, currency)}</span> for {total.count} {total.count === 1 ? "ticket" : "tickets"}
              {total.fee > 0 ? <span className="block text-xs">{formatMoney(total.face, currency)} + {formatMoney(total.fee, currency)} booking fees</span> : null}
            </>
          ) : (
            "Choose your tickets"
          )}
        </div>
        <Button
          disabled={pending || total.count === 0 || !paymentsOn}
          onClick={() => {
            setError(null);
            start(async () => {
              try {
                const { url } = await createCheckout(
                  eventId,
                  Object.entries(qty).map(([tierId, quantity]) => ({ tierId, quantity })),
                );
                window.location.assign(url);
              } catch (e) {
                setError(e instanceof Error ? e.message : "Could not start checkout.");
              }
            });
          }}
        >
          {pending ? "Opening checkout…" : total.face === 0 && total.count > 0 ? "Get tickets" : "Buy tickets"}
        </Button>
      </div>
      {!paymentsOn ? <p className="mt-2 text-xs text-muted-foreground">Payments are not switched on yet.</p> : null}
      {error ? <p className="mt-2 text-sm text-destructive" role="alert">{error}</p> : null}
      <p className="mt-3 text-[11px] text-muted-foreground">Secure card, Apple Pay and Google Pay checkout by Stripe. Your tickets appear in your wallet the moment payment clears.</p>
    </div>
  );
}
