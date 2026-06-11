"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { addWishlistItem } from "./actions";

export function WishlistAdder() {
  const [kind, setKind] = useState<"artist" | "destination" | "venue" | "hotel">(
    "artist",
  );
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        await addWishlistItem({ kind, name });
        setName("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save.");
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex gap-2">
      <Select value={kind} onValueChange={(v) => setKind(v as typeof kind)}>
        <SelectTrigger className="w-36 shrink-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="artist">Artist</SelectItem>
          <SelectItem value="destination">Destination</SelectItem>
          <SelectItem value="venue">Venue</SelectItem>
          <SelectItem value="hotel">Hotel</SelectItem>
        </SelectContent>
      </Select>
      <Input
        placeholder={
          kind === "artist"
            ? "Fontaines D.C., Phoebe Bridgers…"
            : kind === "destination"
              ? "Lisbon, Kyoto, Buenos Aires…"
              : kind === "hotel"
                ? "Hotel Manchester, Casa Cook…"
                : "Alexandra Palace, Brixton Academy…"
        }
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <Button type="submit" disabled={pending || !name}>
        <Plus />
      </Button>
      {error ? (
        <p className="absolute mt-12 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
