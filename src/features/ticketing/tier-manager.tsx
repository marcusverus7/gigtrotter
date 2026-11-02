"use client";

import { useState, useTransition } from "react";
import { Plus, Save, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { buyerFeeCents, eventbriteFeeCents, formatMoney, type FeeSchedule } from "@/lib/tickets/pricing";

import { deleteTier, saveTier } from "./actions";

export type TierRow = {
  id: string;
  name: string;
  description: string | null;
  price_cents: number;
  quantity: number;
  sold: number;
  reserved: number;
  max_per_order: number;
  status: string;
};

export function TierManager({ eventId, tiers, fees }: { eventId: string; tiers: TierRow[]; fees: FeeSchedule }) {
  const [adding, setAdding] = useState(tiers.length === 0);
  return (
    <div className="space-y-3">
      {tiers.map((t) => (
        <TierForm key={t.id} eventId={eventId} tier={t} fees={fees} />
      ))}
      {adding ? (
        <TierForm eventId={eventId} tier={null} fees={fees} onDone={() => setAdding(false)} />
      ) : (
        <Button type="button" variant="outline" size="sm" onClick={() => setAdding(true)}>
          <Plus /> Add a ticket type
        </Button>
      )}
    </div>
  );
}

function TierForm({ eventId, tier, fees, onDone }: { eventId: string; tier: TierRow | null; fees: FeeSchedule; onDone?: () => void }) {
  const [name, setName] = useState(tier?.name ?? "General admission");
  const [price, setPrice] = useState(tier ? (tier.price_cents / 100).toFixed(2) : "15.00");
  const [quantity, setQuantity] = useState(String(tier?.quantity ?? 100));
  const [maxPerOrder, setMaxPerOrder] = useState(String(tier?.max_per_order ?? 6));
  const [status, setStatus] = useState(tier?.status ?? "on_sale");
  const [description, setDescription] = useState(tier?.description ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const priceCents = Math.round((parseFloat(price) || 0) * 100);
  const fee = buyerFeeCents(priceCents, fees);
  const eb = eventbriteFeeCents(priceCents);

  return (
    <form
      className="space-y-3 rounded-lg border border-border bg-card p-4"
      onSubmit={(e) => {
        e.preventDefault();
        setMsg(null);
        start(async () => {
          try {
            await saveTier({
              id: tier?.id,
              eventId,
              name,
              description: description || null,
              priceCents,
              quantity: parseInt(quantity, 10) || 0,
              maxPerOrder: parseInt(maxPerOrder, 10) || 6,
              status: status as "draft" | "on_sale" | "paused" | "ended",
            });
            setMsg("Saved.");
            onDone?.();
          } catch (err) {
            setMsg(err instanceof Error ? err.message : "Could not save.");
          }
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={`n-${tier?.id ?? "new"}`}>Name</Label>
          <Input id={`n-${tier?.id ?? "new"}`} value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`p-${tier?.id ?? "new"}`}>Price (£)</Label>
          <Input id={`p-${tier?.id ?? "new"}`} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`q-${tier?.id ?? "new"}`}>Capacity</Label>
          <Input id={`q-${tier?.id ?? "new"}`} inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`m-${tier?.id ?? "new"}`}>Max per order</Label>
          <Input id={`m-${tier?.id ?? "new"}`} inputMode="numeric" value={maxPerOrder} onChange={(e) => setMaxPerOrder(e.target.value)} />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor={`d-${tier?.id ?? "new"}`}>Description (optional)</Label>
          <Input id={`d-${tier?.id ?? "new"}`} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Standing, 18+, includes a drink…" />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`s-${tier?.id ?? "new"}`}>Status</Label>
          <select
            id={`s-${tier?.id ?? "new"}`}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="on_sale">On sale</option>
            <option value="draft">Draft (hidden)</option>
            <option value="paused">Paused</option>
            <option value="ended">Ended</option>
          </select>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Buyer pays <strong className="text-foreground">{formatMoney(priceCents + fee)}</strong>
        {priceCents > 0 ? ` (${formatMoney(priceCents)} + ${formatMoney(fee)} fee). You receive ${formatMoney(priceCents)} per ticket. On Eventbrite the same ticket would cost the buyer ${formatMoney(priceCents + eb)}.` : " — free tickets carry no fee."}
      </p>
      {tier ? (
        <p className="text-xs text-muted-foreground tnum">
          Sold {tier.sold} · held in checkouts {tier.reserved} · left {Math.max(0, tier.quantity - tier.sold - tier.reserved)}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          <Save /> {pending ? "Saving…" : tier ? "Save" : "Create"}
        </Button>
        {tier && tier.sold === 0 ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="text-destructive"
            disabled={pending}
            onClick={() => start(async () => { try { await deleteTier(tier.id, eventId); } catch (err) { setMsg(err instanceof Error ? err.message : "Could not delete."); } })}
          >
            <Trash2 /> Delete
          </Button>
        ) : null}
        {msg ? <span className={`text-xs ${msg === "Saved." ? "text-muted-foreground" : "text-destructive"}`} role="status">{msg}</span> : null}
      </div>
    </form>
  );
}
