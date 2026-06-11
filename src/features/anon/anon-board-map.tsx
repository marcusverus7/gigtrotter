"use client";

import { useEffect, useRef } from "react";
import mapboxgl, { type Map, type Marker } from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

import { publicEnv } from "@/lib/env";

import "../map/pin.css";

type AnonPin = {
  id: string;
  kind: string;
  title: string;
  subtitle: string | null;
  month: string;
  city: string | null;
  country: string | null;
  city_lat: number | null;
  city_lng: number | null;
};

/**
 * Anon board globe. City-fuzzed only — never reads venue lat/lng.
 * Per §3.2 the board proves the life without exposing the pattern.
 */
export function AnonBoardMap({ pins }: { pins: AnonPin[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const markersRef = useRef<Marker[]>([]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    mapboxgl.accessToken = publicEnv.mapboxToken;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/dark-v11",
      projection: { name: "globe" },
      center: [0, 30],
      zoom: 1.5,
      attributionControl: false,
    });
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    // Cluster by city so 8 gigs in London render as one bigger marker.
    const byCity = new Map<string, { lat: number; lng: number; count: number }>();
    for (const p of pins) {
      if (p.city_lat == null || p.city_lng == null) continue;
      const key = `${p.city ?? "?"}-${p.country ?? "?"}`;
      const cur = byCity.get(key);
      if (cur) cur.count += 1;
      else byCity.set(key, { lat: p.city_lat, lng: p.city_lng, count: 1 });
    }

    const bounds = new mapboxgl.LngLatBounds();
    for (const { lat, lng, count } of byCity.values()) {
      const el = document.createElement("div");
      el.className = "gt-pin gt-pin-open";
      const scale = Math.min(1 + Math.log10(count + 1) * 0.4, 2.2);
      el.style.transform = `scale(${scale})`;
      const marker = new mapboxgl.Marker(el).setLngLat([lng, lat]).addTo(map);
      markersRef.current.push(marker);
      bounds.extend([lng, lat]);
    }
    if (byCity.size > 0) {
      map.fitBounds(bounds, { padding: 60, maxZoom: 4, duration: 1200 });
    }
  }, [pins]);

  return (
    <div
      ref={containerRef}
      className="relative aspect-[16/9] w-full overflow-hidden rounded-xl border border-border"
    />
  );
}
