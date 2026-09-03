/**
 * The normalised event shape every feed provider maps into.
 *
 * One contract, many `map.ts` files: Ticketmaster today, Bandsintown next,
 * Skiddle whenever independent-venue coverage matters more than setup time.
 * The upsert layer only ever sees this shape, so adding a provider never
 * touches the database code.
 *
 * No `server-only` here — the mappers are pure and the test runner imports
 * them.
 */

import type { EventCategory } from "@/lib/supabase/types";

export type FeedTicketLink = {
  provider: string;
  label: string;
  url: string;
  minPriceCents: number | null;
  maxPriceCents: number | null;
  currency: string;
  isSoldOut: boolean;
};

export type FeedVenue = {
  name: string;
  city: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
};

export type FeedEvent = {
  source: "ticketmaster" | "bandsintown";
  externalId: string;
  title: string;
  headliner: string | null;
  artistNames: string[];
  category: EventCategory;
  venue: FeedVenue | null;
  /** UTC ISO. */
  startsAt: string | null;
  endsAt: string | null;
  doorsAt: string | null;
  /** IANA zone from the provider, for same-local-date dedupe. */
  timezone: string | null;
  /** UTC ISO. */
  onSaleAt: string | null;
  imageUrl: string | null;
  minPriceCents: number | null;
  maxPriceCents: number | null;
  currency: string;
  isSoldOut: boolean;
  externalUrl: string | null;
  ticketLinks: FeedTicketLink[];
  tags: string[];
};
