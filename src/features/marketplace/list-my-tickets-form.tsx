"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

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

import { createListing } from "./actions";

type Item = {
  id: string;
  title: string;
  starts_at: string | null;
  subtitle: string | null;
};

export function ListMyTicketsForm({ items }: { items: Item[] }) {
  const [walletItemId, setWalletItemId] = useState(items[0]?.id ?? "");
  const [face, setFace] = useState("");
  const [ask, setAsk] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const faceN = Math.round(parseFloat(face) * 100);
    const askN = Math.round(parseFloat(ask) * 100);
    if (!Number.isFinite(faceN) || !Number.isFinite(askN)) {
      setError("Enter numeric prices.");
      return;
    }
    if (askN > faceN) {
      setError("Asking price can't exceed face value.");
      return;
    }
    startTransition(async () => {
      try {
        await createListing({
          walletItemId,
          faceValueCents: faceN,
          askingPriceCents: askN,
          notes: notes.trim() || null,
        });
        setFace("");
        setAsk("");
        setNotes("");
        toast.success("Ticket listed on the marketplace.");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't list.");
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr]">
        <div className="space-y-1.5">
          <Label>Ticket</Label>
          <Select value={walletItemId} onValueChange={setWalletItemId}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {items.map((i) => (
                <SelectItem key={i.id} value={i.id}>
                  {i.title}
                  {i.starts_at
                    ? ` · ${new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" }).format(new Date(i.starts_at))}`
                    : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Face value (£)</Label>
          <Input
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            value={face}
            onChange={(e) => setFace(e.target.value)}
            placeholder="48.50"
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label>Asking (£)</Label>
          <Input
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            value={ask}
            onChange={(e) => setAsk(e.target.value)}
            placeholder="48.50"
            required
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Notes (optional)</Label>
        <Input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={280}
          placeholder="Standing, near the front, can transfer via app, etc."
        />
      </div>
      <div className="flex items-center justify-between">
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Cap is face value — enforced in the database.
          </p>
        )}
        <Button type="submit" disabled={pending}>
          {pending ? "Listing…" : "List it"}
        </Button>
      </div>
    </form>
  );
}
