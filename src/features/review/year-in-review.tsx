"use client";

import { useEffect, useRef, useState } from "react";
import { Globe, MapPin, Music, Plane } from "lucide-react";
import mapboxgl from "mapbox-gl";
import type { Map as MapboxMap, Marker } from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { publicEnv, isMapboxConfigured } from "@/lib/env";
import { cn } from "@/lib/utils";

import "../map/pin.css";

type Row = {
  id: string;
  /** Rows come from `experiences`, so `id` above is NOT the wallet item id. */
  wallet_item_id: string | null;
  kind: string;
  title: string;
  starts_at: string;
  city: string | null;
  country: string | null;
  venue: string | null;
  lat: number | null;
  lng: number | null;
};

type Stats = {
  gigs: number;
  flights: number;
  stays: number;
  cities: number;
  countries: number;
  km: number;
  topArtist: string | null;
};

type CityPin = {
  lat: number;
  lng: number;
  count: number;
  name: string;
};

/**
 * The cinematic itself.
 *
 * Vertical scroll triggers a sequence of dramatic full-bleed sections,
 * each pinning a number from the year. Section 2 is a live Mapbox globe
 * that flies between this year's city pins on a slow loop — the "fly-through"
 * from §8.3.
 */
export function YearInReview({
  year,
  rows,
  cityPins,
  stats,
}: {
  year: number;
  rows: Row[];
  cityPins: CityPin[];
  stats: Stats;
}) {
  return (
    <article className="space-y-12">
      {/* COVER */}
      <Cover year={year} count={rows.length} />

      {/* FLYOVER */}
      <Section
        eyebrow="The map"
        kicker="Everywhere you were"
        sub="A slow flight between every city you pinned."
      >
        {isMapboxConfigured ? (
          <Flyover pins={cityPins} />
        ) : (
          <div className="aspect-[16/9] rounded-2xl border border-dashed border-border bg-card/40" />
        )}
      </Section>

      {/* HEADLINE STATS */}
      <Section
        eyebrow="By the numbers"
        kicker="The compounding asset"
        sub="What landed on your map in twelve months."
      >
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatTile icon={Music} value={stats.gigs} label="Gigs" />
          <StatTile icon={Plane} value={stats.flights} label="Flights" />
          <StatTile icon={MapPin} value={stats.cities} label="Cities" />
          <StatTile icon={Globe} value={stats.countries} label="Countries" />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-3">
          <StatTile
            value={stats.km.toLocaleString()}
            label="Kilometres travelled"
            big
          />
          <StatTile value={stats.stays} label="Stays" />
          {stats.topArtist ? (
            <StatTile value={stats.topArtist} label="Most seen" big />
          ) : null}
        </div>
      </Section>

      {/* HIGHLIGHT REEL — chronological scroll */}
      <Section
        eyebrow="The reel"
        kicker={`A year, in order`}
        sub="Tap any item to revisit the pin."
      >
        <ol className="relative space-y-2">
          {rows.map((r, i) => (
            <Tile key={r.id} row={r} index={i} />
          ))}
        </ol>
      </Section>

      <p className="text-center text-xs text-muted-foreground">
        GigTrotter · {year} in review · {rows.length} pins
      </p>
    </article>
  );
}

/* ────────────────────────── COVER ─────────────────────────── */

function Cover({ year, count }: { year: number; count: number }) {
  return (
    <header className="relative isolate overflow-hidden rounded-3xl border border-primary/30 bg-gradient-to-br from-primary/15 via-card to-secondary/10 p-10 md:p-16">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute right-[-10%] top-[-20%] h-[60vh] w-[60vh] rounded-full bg-primary/20 blur-[120px]" />
        <div className="absolute left-[-10%] bottom-[-20%] h-[50vh] w-[50vh] rounded-full bg-secondary/15 blur-[120px]" />
      </div>
      <Badge variant="inner" className="w-fit">
        Year in review
      </Badge>
      <h1 className="mt-4 font-mono text-[15vw] font-bold leading-none tracking-tighter md:text-[160px]">
        {year}
      </h1>
      <p className="mt-4 max-w-md text-balance text-lg text-muted-foreground md:text-xl">
        {count} pins. The map filled itself. Here&apos;s how it played out.
      </p>
    </header>
  );
}

/* ────────────────────────── FLYOVER ─────────────────────────── */

function Flyover({ pins }: { pins: CityPin[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const [activeName, setActiveName] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    mapboxgl.accessToken = publicEnv.mapboxToken;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/dark-v11",
      projection: { name: "globe" },
      center: pins[0] ? [pins[0].lng, pins[0].lat] : [0, 30],
      zoom: 4,
      attributionControl: false,
      interactive: false,
    });
    map.on("style.load", () => {
      map.setFog({
        color: "rgb(186, 210, 235)",
        "high-color": "rgb(36, 92, 223)",
        "horizon-blend": 0.02,
        "space-color": "rgb(11, 11, 25)",
        "star-intensity": 0.6,
      });
    });
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [pins]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    for (const p of pins) {
      const el = document.createElement("div");
      el.className = "gt-pin gt-pin-open";
      const scale = Math.min(1 + Math.log10(p.count + 1) * 0.5, 2.2);
      el.style.transform = `scale(${scale})`;
      const marker = new mapboxgl.Marker(el).setLngLat([p.lng, p.lat]).addTo(map);
      markersRef.current.push(marker);
    }
  }, [pins]);

  // Auto-fly between pins on a slow loop.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || pins.length === 0) return;
    let i = 0;
    let cancelled = false;
    const step = () => {
      if (cancelled || !mapRef.current) return;
      const p = pins[i % pins.length];
      setActiveName(p.name);
      map.flyTo({
        center: [p.lng, p.lat],
        zoom: 5.2,
        speed: 0.4,
        curve: 1.6,
        essential: true,
      });
      i += 1;
      setTimeout(step, 5000);
    };
    const start = setTimeout(step, 800);
    return () => {
      cancelled = true;
      clearTimeout(start);
    };
  }, [pins]);

  return (
    <div className="relative">
      <div
        ref={containerRef}
        className="aspect-[16/9] w-full overflow-hidden rounded-2xl border border-border"
      />
      {activeName ? (
        <div className="pointer-events-none absolute bottom-6 left-6 rounded-md border border-border bg-card/80 px-3 py-1.5 font-mono text-xs uppercase tracking-wider backdrop-blur-md">
          ↳ {activeName}
        </div>
      ) : null}
    </div>
  );
}

/* ────────────────────────── SECTION + TILES ─────────────────────────── */

function Section({
  eyebrow,
  kicker,
  sub,
  children,
}: {
  eyebrow: string;
  kicker: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-5">
      <header className="space-y-1">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">
          {eyebrow}
        </p>
        <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
          {kicker}
        </h2>
        {sub ? <p className="text-sm text-muted-foreground">{sub}</p> : null}
      </header>
      {children}
    </section>
  );
}

function StatTile({
  icon: Icon,
  value,
  label,
  big,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  value: number | string;
  label: string;
  big?: boolean;
}) {
  return (
    <Card className="overflow-hidden border-border/60 bg-gradient-to-br from-card to-card/40">
      <CardContent className="p-5">
        {Icon ? (
          <Icon className="mb-2 h-4 w-4 text-primary" />
        ) : null}
        <div
          className={cn(
            "font-mono font-bold tnum tracking-tighter",
            big ? "text-4xl md:text-5xl" : "text-3xl",
          )}
        >
          {value}
        </div>
        <div className="mt-1 text-xs uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
      </CardContent>
    </Card>
  );
}

function Tile({ row, index }: { row: Row; index: number }) {
  const monthLabel = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(new Date(row.starts_at));
  // A pin can outlive its wallet item (ON DELETE SET NULL). Render the tile
  // either way; only make it a link when there is somewhere for it to go.
  const inner = (
    <>
        <span className="font-mono text-xs tnum text-muted-foreground/60 w-12 shrink-0">
          #{(index + 1).toString().padStart(2, "0")}
        </span>
        <div className="flex-1 min-w-0">
          <p className="truncate text-base font-medium">{row.title}</p>
          {(row.venue || row.city) ? (
            <p className="truncate text-xs text-muted-foreground">
              {[row.venue, row.city, row.country].filter(Boolean).join(" · ")}
            </p>
          ) : null}
        </div>
        <span className="font-mono text-xs tnum text-muted-foreground shrink-0" suppressHydrationWarning>
          {monthLabel}
        </span>
    </>
  );

  const className =
    "group flex items-center gap-4 rounded-xl border border-border/60 bg-card/30 p-4 backdrop-blur transition-all hover:-translate-x-0.5 hover:border-primary/40 hover:bg-card/70";

  return (
    <li>
      {row.wallet_item_id ? (
        <a href={`/app/item/${row.wallet_item_id}`} className={className}>
          {inner}
        </a>
      ) : (
        <div className={className}>{inner}</div>
      )}
    </li>
  );
}
