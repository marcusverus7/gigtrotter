"use client";

import { useState, useTransition } from "react";
import { MapPin, Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

import { searchEvents } from "./actions";
import { EventCard, type EventSummary } from "./event-card";

export function EventSearch({
  initialEvents,
  initialCity = "",
}: {
  initialEvents: EventSummary[];
  /** The ?city= chip the page is filtered by, so searching stays in scope. */
  initialCity?: string;
}) {
  const [query, setQuery] = useState("");
  // Seeded from the active chip: searching used to drop it silently, so
  // "Fontaines" under a highlighted Dublin chip returned every city while the
  // chip still claimed Dublin.
  const [city, setCity] = useState(initialCity);
  const [results, setResults] = useState<EventSummary[]>(initialEvents);
  const [searched, setSearched] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const [pending, startTransition] = useTransition();

  // "Browse" used to be the soonest thirty and nothing more; the badge said
  // thousands. Load-more pages the same query the search uses.
  function loadMore() {
    startTransition(async () => {
      const more = await searchEvents(searched ? query : "", (searched ? city : initialCity) || undefined, results.length);
      const seen = new Set(results.map((r) => r.id));
      const fresh = (more as EventSummary[]).filter((e) => !seen.has(e.id));
      setResults((r) => [...r, ...fresh]);
      if (fresh.length < 30) setExhausted(true);
    });
  }

  function onSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearched(true);
    setExhausted(false);
    startTransition(async () => {
      const data = await searchEvents(query, city || undefined);
      setResults(data as EventSummary[]);
    });
  }

  function onReset() {
    setQuery("");
    setCity(initialCity);
    setResults(initialEvents);
    setSearched(false);
  }

  return (
    <div className="space-y-4">
      <form onSubmit={onSearch} className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            aria-label="Search events, artists and venues"
            placeholder="Search events, artists, venues..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="relative w-40">
          <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="City"
            placeholder="City"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "Searching…" : "Search"}
        </Button>
        {searched ? (
          <Button type="button" variant="ghost" onClick={onReset}>
            Clear
          </Button>
        ) : null}
      </form>

      {searched && results.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No events found. Try a different search or city.
          </p>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {results.map((event) => (
          <EventCard key={event.id} event={event} />
        ))}
      </div>
      {results.length >= 30 && !exhausted ? (
        <div className="flex justify-center">
          <Button type="button" variant="outline" onClick={loadMore} disabled={pending}>
            {pending ? "Loading…" : "Load more"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
