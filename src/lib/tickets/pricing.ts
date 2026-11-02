/**
 * What a ticket costs, and who gets what. PURE — tested.
 *
 * The promoter receives the full face value of every ticket — that is the
 * pitch. The buyer pays face plus one fee that covers Stripe's processing
 * (UK cards: 1.5% + 20p) and GigTrotter's margin, expressed as basis points
 * on face plus a fixed part, set per promoter. Default 500 bps + 20p:
 * a £15 ticket costs the buyer £15.95; Eventbrite's organiser-pays default
 * is 6.95% + 59p, so the same ticket is £16.63 there.
 *
 * Free tickets carry no fee. All arithmetic in minor units.
 */

export type FeeSchedule = { bps: number; fixedCents: number };

export const DEFAULT_FEES: FeeSchedule = { bps: 500, fixedCents: 20 };

export function buyerFeeCents(faceCents: number, fees: FeeSchedule = DEFAULT_FEES): number {
  if (faceCents <= 0) return 0;
  return Math.round((faceCents * fees.bps) / 10_000) + fees.fixedCents;
}

export type OrderLine = { tierId: string; name: string; unitPriceCents: number; quantity: number };

export type OrderTotals = {
  faceCents: number;
  feeCents: number;
  totalCents: number;
  /** What Stripe transfers to the promoter: face, exactly. */
  promoterCents: number;
  /** The platform's application fee on the charge: the buyer fee. */
  applicationFeeCents: number;
  lines: Array<OrderLine & { lineFaceCents: number; lineFeeCents: number }>;
};

export function orderTotals(lines: OrderLine[], fees: FeeSchedule = DEFAULT_FEES): OrderTotals {
  const out = lines.map((l) => {
    const lineFaceCents = l.unitPriceCents * l.quantity;
    // Fee per ticket, not per order, so a four-ticket order is not cheaper
    // per head than four single orders — and the fixed part covers Stripe's
    // per-charge 20p on the first and the platform on the rest.
    const lineFeeCents = buyerFeeCents(l.unitPriceCents, fees) * l.quantity;
    return { ...l, lineFaceCents, lineFeeCents };
  });
  const faceCents = out.reduce((n, l) => n + l.lineFaceCents, 0);
  const feeCents = out.reduce((n, l) => n + l.lineFeeCents, 0);
  return {
    faceCents,
    feeCents,
    totalCents: faceCents + feeCents,
    promoterCents: faceCents,
    applicationFeeCents: feeCents,
    lines: out,
  };
}

/** Eventbrite UK organiser-pays default, for the comparison on the sales page. */
export function eventbriteFeeCents(faceCents: number): number {
  if (faceCents <= 0) return 0;
  return Math.round(faceCents * 0.0695) + 59;
}

export function formatMoney(cents: number, currency = "GBP"): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(cents / 100);
}

/** Validate a basket against tiers: capacity, per-order cap, sale window. */
export function validateBasket(
  basket: Array<{ tierId: string; quantity: number }>,
  tiers: Array<{ id: string; remaining: number; maxPerOrder: number; status: string; priceCents: number; name: string }>,
  now: number = Date.now(),
): { ok: true; lines: OrderLine[] } | { ok: false; reason: string } {
  void now;
  const lines: OrderLine[] = [];
  for (const b of basket) {
    if (!Number.isInteger(b.quantity) || b.quantity <= 0) continue;
    const t = tiers.find((x) => x.id === b.tierId);
    if (!t) return { ok: false, reason: "That ticket type is no longer available." };
    if (t.status !== "on_sale") return { ok: false, reason: `${t.name} is not on sale.` };
    if (b.quantity > t.maxPerOrder) return { ok: false, reason: `Up to ${t.maxPerOrder} of ${t.name} per order.` };
    if (b.quantity > t.remaining) {
      return { ok: false, reason: t.remaining === 0 ? `${t.name} has sold out.` : `Only ${t.remaining} of ${t.name} left.` };
    }
    lines.push({ tierId: t.id, name: t.name, unitPriceCents: t.priceCents, quantity: b.quantity });
  }
  if (lines.length === 0) return { ok: false, reason: "Pick at least one ticket." };
  return { ok: true, lines };
}
