"use client";

import { useState, useTransition } from "react";
import { Pencil, Check, X } from "lucide-react";
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

import { updateWalletItemDetails } from "./wallet-item-actions";

const KIND_OPTIONS = [
  { value: "ticket", label: "Ticket" },
  { value: "flight", label: "Flight" },
  { value: "stay", label: "Stay" },
  { value: "restaurant", label: "Restaurant" },
  { value: "other", label: "Other" },
] as const;

export function ItemDetailsEditor({
  itemId,
  title,
  kind,
  venueName,
  city,
  country,
}: {
  itemId: string;
  title: string;
  kind: string;
  venueName?: string;
  city?: string;
  country?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [titleValue, setTitleValue] = useState(title);
  const [kindValue, setKindValue] = useState(kind);
  const [venueNameValue, setVenueNameValue] = useState(venueName ?? "");
  const [cityValue, setCityValue] = useState(city ?? "");
  const [countryValue, setCountryValue] = useState(country ?? "");
  const [pending, startTransition] = useTransition();

  function onSave() {
    startTransition(async () => {
      try {
        await updateWalletItemDetails(itemId, {
          title: titleValue,
          kind: kindValue,
          venueName: venueNameValue,
          city: cityValue,
          country: countryValue,
        });
        toast.success("Details updated.");
        setEditing(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not save.");
      }
    });
  }

  function onCancel() {
    setTitleValue(title);
    setKindValue(kind);
    setVenueNameValue(venueName ?? "");
    setCityValue(city ?? "");
    setCountryValue(country ?? "");
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
        Edit details
      </Button>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Edit details
      </p>
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Title</Label>
          <Input
            type="text"
            value={titleValue}
            onChange={(e) => setTitleValue(e.target.value)}
            className="h-8 text-sm"
            placeholder="Event title"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Kind</Label>
          <Select value={kindValue} onValueChange={setKindValue}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="Select kind" />
            </SelectTrigger>
            <SelectContent>
              {KIND_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Venue</Label>
          <Input
            type="text"
            value={venueNameValue}
            onChange={(e) => setVenueNameValue(e.target.value)}
            className="h-8 text-sm"
            placeholder="Venue name (leave blank to clear)"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">City</Label>
          <Input
            type="text"
            value={cityValue}
            onChange={(e) => setCityValue(e.target.value)}
            className="h-8 text-sm"
            placeholder="City"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Country</Label>
          <Input
            type="text"
            value={countryValue}
            onChange={(e) => setCountryValue(e.target.value)}
            className="h-8 text-sm"
            placeholder="Country"
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
