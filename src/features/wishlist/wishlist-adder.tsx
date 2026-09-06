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

  // `absolute mt-12` with no positioned ancestor painted the message 48px
  // down, ON TOP of the first wishlist row, taking no layout space — two
  // unreadable lines on top of each other. It gets its own line now.
  return (
    <form onSubmit={onSubmit} className="flex flex-wrap gap-2">
      <Select value={kind} onValueChange={(v) => setKind(v as typeof kind)}>
        <SelectTrigger className="w-36 shrink-0" aria-label="What kind of thing">
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
        aria-label="Name"
      />
      <Button type="submit" disabled={pending || !name} aria-label="Add to wishlist">
        <Plus />
      </Button>
      {error ? (
        <p className="w-full text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
