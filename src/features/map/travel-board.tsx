"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import type { Map as MapboxMap, Marker, Popup } from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

import type { Audience, WalletKind } from "@/lib/supabase/types";
import { publicEnv } from "@/lib/env";
import { cn } from "@/lib/utils";

import "./pin.css";

export type Pin = {
  id: string;
  kind: WalletKind;
  title: string;
  subtitle: string;
  city: string;
  country: string;
  starts_at: string;
  audience: Audience;
  verified: boolean;
  lng: number;
  lat: number;
};

/**
 * The Mapbox globe — Dark-Map Premium. Globe projection, slate basemap,
 * pins coloured by audience tier (Inner/Friends/Open). Clustering is handled
 * by the source layer; tap or click a pin to open the popover.
 *
 * The pin popover is one of the two most-screenshotted surfaces. Treated
 * accordingly: rounded, glowing, branded.
 */
export function TravelBoard({ pins }: { pins: Pin[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const popupRef = useRef<Popup | null>(null);
  const [filter, setFilter] = useState<WalletKind | "all">("all");

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    mapboxgl.accessToken = publicEnv.mapboxToken;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/dark-v11",
      projection: { name: "globe" },
      center: [-1.5, 52],
      zoom: 1.8,
      attributionControl: false,
      pitchWithRotate: false,
    });
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
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
  }, []);

  // Render pins as DOM markers — cheaper than a GeoJSON source for ≤ 1000 pins
  // and lets us style each one with our own CSS for the glow effect.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    const visible = filter === "all" ? pins : pins.filter((p) => p.kind === filter);

    for (const pin of visible) {
      const el = document.createElement("div");
      el.className = `gt-pin gt-pin-${pin.audience}`;
      if (pin.verified) el.dataset.verified = "true";

      el.addEventListener("click", () => {
        popupRef.current?.remove();
        popupRef.current = new mapboxgl.Popup({
          offset: 18,
          closeButton: false,
          className: "gt-popup",
        })
          .setLngLat([pin.lng, pin.lat])
          .setHTML(popupHtml(pin))
          .addTo(map);
      });

      const marker = new mapboxgl.Marker(el)
        .setLngLat([pin.lng, pin.lat])
        .addTo(map);
      markersRef.current.push(marker);
    }

    // Pan to fit if we have pins.
    if (visible.length > 0) {
      const bounds = new mapboxgl.LngLatBounds();
      visible.forEach((p) => bounds.extend([p.lng, p.lat]));
      map.fitBounds(bounds, { padding: 80, maxZoom: 6, duration: 1200 });
    }
  }, [pins, filter]);

  const kinds: (WalletKind | "all")[] = ["all", "ticket", "flight", "stay", "restaurant"];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {kinds.map((k) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={cn(
              // min-h-10: at py-1 these were ~26px, directly above the map,
              // so a mis-tap started a map drag instead of filtering.
              "min-h-10 rounded-full border px-4 text-xs transition-colors",
              filter === k
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
            )}
          >
            {k === "all" ? "All" : k.charAt(0).toUpperCase() + k.slice(1)}
          </button>
        ))}
      </div>
      <div
        ref={containerRef}
        className="relative aspect-[16/9] w-full overflow-hidden rounded-xl border border-border"
      />
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <LegendDot color="hsl(var(--circle-vault))" label="Vault" />
        <LegendDot color="hsl(var(--circle-inner))" label="Inner" />
        <LegendDot color="hsl(var(--circle-friends))" label="Friends" />
        <LegendDot color="hsl(var(--circle-open))" label="Open" />
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="inline-block h-2.5 w-2.5 rounded-full"
        style={{ background: color, boxShadow: `0 0 8px ${color}` }}
      />
      {label}
    </span>
  );
}

function popupHtml(pin: Pin) {
  const dateLabel = new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(pin.starts_at));
  const place = [pin.subtitle, pin.city, pin.country].filter(Boolean).join(" · ");
  return `
    <div class="gt-popup-body">
      <div class="gt-popup-kind">${pin.kind}</div>
      <div class="gt-popup-title">${escapeHtml(pin.title)}</div>
      <div class="gt-popup-place">${escapeHtml(place)}</div>
      <div class="gt-popup-meta">
        <span>${escapeHtml(dateLabel)}</span>
        ${pin.verified ? '<span class="gt-popup-verified">✓ verified</span>' : ""}
      </div>
    </div>
  `;
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
