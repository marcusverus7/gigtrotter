"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

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
import type { Audience, WalletKind } from "@/lib/supabase/types";
import { publicEnv } from "@/lib/env";

import { addManualWalletItem, type VenueSuggestion } from "./manual-actions";

/**
 * Rapid manual add — targets sub-15-second entry. Venue autocomplete uses
 * Mapbox forward geocoding (POI feature type) which we hit from the client.
 *
 * Capture row is created with source='manual' so the lifecycle behaves
 * identically to a parsed capture.
 */
export function ManualAddForm() {
  const router = useRouter();
  const [kind, setKind] = useState<WalletKind>("ticket");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [audience, setAudience] = useState<Audience>("inner");
  const [hasTicket, setHasTicket] = useState(true);
  const [venueQ, setVenueQ] = useState("");
  const [venues, setVenues] = useState<VenueSuggestion[]>([]);
  const [venue, setVenue] = useState<VenueSuggestion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Debounced Mapbox forward-geocoder lookup.
  useEffect(() => {
    if (!publicEnv.mapboxToken || venueQ.trim().length < 2) {
      setVenues([]);
      return;
    }
    const handle = setTimeout(async () => {
      const url = new URL(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(venueQ)}.json`,
      );
      url.searchParams.set("access_token", publicEnv.mapboxToken);
      url.searchParams.set("types", "poi,place");
      url.searchParams.set("limit", "5");
      const res = await fetch(url);
      if (!res.ok) return;
      const data = (await res.json()) as {
        features: Array<{
          id: string;
          text: string;
          place_name: string;
          center: [number, number];
          context?: Array<{ id: string; text: string }>;
        }>;
      };
      setVenues(
        data.features.map((f) => ({
          mapboxId: f.id,
          name: f.text,
          full: f.place_name,
          lng: f.center[0],
          lat: f.center[1],
          city:
            f.context?.find((c) => c.id.startsWith("place"))?.text ?? null,
          country:
            f.context?.find((c) => c.id.startsWith("country"))?.text ?? null,
        })),
      );
    }, 250);
    return () => clearTimeout(handle);
  }, [venueQ]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        await addManualWalletItem({
          kind,
          title,
          starts_at: date ? new Date(date).toISOString() : null,
          audience,
          hasTicket,
          venue,
        });
        router.push("/app");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save.");
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Kind">
          <Select value={kind} onValueChange={(v) => setKind(v as WalletKind)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ticket">Ticket</SelectItem>
              <SelectItem value="flight">Flight</SelectItem>
              <SelectItem value="stay">Stay</SelectItem>
              <SelectItem value="restaurant">Restaurant</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Audience">
          <Select value={audience} onValueChange={(v) => setAudience(v as Audience)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="vault">Vault</SelectItem>
              <SelectItem value="inner">Inner</SelectItem>
              <SelectItem value="friends">Friends</SelectItem>
              <SelectItem value="open">Open</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>

      {/* Without this a dated gig was always filed as "going", so there was no
          way to save one you fancy but have not bought — the most common
          question from beta testers. */}
      <div className="rounded-lg border border-border bg-card/40 p-3">
        <p className="text-sm font-medium">Have you got a ticket?</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setHasTicket(true)}
            aria-pressed={hasTicket}
            className={
              hasTicket
                ? "rounded-md border border-primary bg-primary/10 px-3 py-2 text-sm font-medium text-foreground"
                : "rounded-md border border-border px-3 py-2 text-sm text-muted-foreground hover:border-primary/40"
            }
          >
            Yes — I&apos;m going
          </button>
          <button
            type="button"
            onClick={() => setHasTicket(false)}
            aria-pressed={!hasTicket}
            className={
              !hasTicket
                ? "rounded-md border border-primary bg-primary/10 px-3 py-2 text-sm font-medium text-foreground"
                : "rounded-md border border-border px-3 py-2 text-sm text-muted-foreground hover:border-primary/40"
            }
          >
            Not yet — save it
          </button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {hasTicket
            ? "It'll sit in Upcoming, and become a pin on your map after the night."
            : "It'll sit in your Wishlist until you get a ticket. No pin until you've been."}
        </p>
      </div>

      <Field label="Title">
        <Input
          required
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Fontaines D.C., BA 1426, Hotel Manchester…"
        />
      </Field>

      <Field label="When">
        <Input
          type="datetime-local"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </Field>

      <Field label="Venue / place">
        <div className="relative">
          <Input
            value={venue ? venue.full : venueQ}
            onChange={(e) => {
              setVenue(null);
              setVenueQ(e.target.value);
            }}
            placeholder="Alexandra Palace, London…"
          />
          {venues.length > 0 && !venue ? (
            <ul className="absolute left-0 right-0 top-full z-10 mt-1 rounded-md border border-border bg-popover shadow-md">
              {venues.map((v) => (
                <li key={v.mapboxId}>
                  <button
                    type="button"
                    onClick={() => {
                      setVenue(v);
                      setVenueQ("");
                      setVenues([]);
                    }}
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-accent"
                  >
                    <span className="font-medium">{v.name}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {v.full}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </Field>

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" disabled={pending || !title}>
          {pending ? "Saving…" : "Add to wallet"}
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
