"use client";

import { useState, useTransition } from "react";
import { Pencil, Check, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { updateWalletItemDates } from "./wallet-item-actions";

// HTML datetime-local wants `YYYY-MM-DDTHH:mm`, not full ISO.
function toLocalDT(iso: string | null): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const pad = (n: number) => n.toString().padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return "";
  }
}

// Convert a datetime-local string back to ISO (treat input as local time).
function localDTtoISO(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function ItemDateEditor({
  itemId,
  startsAt,
  endsAt,
}: {
  itemId: string;
  startsAt: string | null;
  endsAt: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [starts, setStarts] = useState(toLocalDT(startsAt));
  const [ends, setEnds] = useState(toLocalDT(endsAt));
  const [pending, startTransition] = useTransition();

  function onSave() {
    startTransition(async () => {
      try {
        await updateWalletItemDates(itemId, {
          starts_at: localDTtoISO(starts),
          ends_at: localDTtoISO(ends),
        });
        toast.success("Dates updated.");
        setEditing(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not save.");
      }
    });
  }

  function onCancel() {
    setStarts(toLocalDT(startsAt));
    setEnds(toLocalDT(endsAt));
    setEditing(false);
  }

  if (!editing) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="h-7 gap-1.5 text-xs text-muted-foreground"
        onClick={() => setEditing(true)}
      >
        <Pencil className="h-3 w-3" />
        Edit dates
      </Button>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Edit dates
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Starts</Label>
          <Input
            type="datetime-local"
            value={starts}
            onChange={(e) => setStarts(e.target.value)}
            className="h-8 text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Ends</Label>
          <Input
            type="datetime-local"
            value={ends}
            onChange={(e) => setEnds(e.target.value)}
            className="h-8 text-sm"
          />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={pending}>
          <X className="h-3.5 w-3.5" />
          Cancel
        </Button>
        <Button size="sm" onClick={onSave} disabled={pending}>
          <Check className="h-3.5 w-3.5" />
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
