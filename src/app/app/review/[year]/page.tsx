import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Share2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { YearInReview } from "@/features/review/year-in-review";

/**
 * /app/review/[year] — Year-in-Review cinematic.
 *
 * The January moment (§8.3). Animated map fly-through stitched with
 * stat-reveal cards: gigs, flights, cities, km, longest trip, top artist.
 * Premium-tier flagship — shareable to social with the redaction-safe
 * share card pipeline.
 */
export default async function YearInReviewPage({
  params,
}: {
  params: Promise<{ year: string }>;
}) {
  const { year } = await params;
  const y = parseInt(year, 10);
  const currentYear = new Date().getFullYear();
  if (!Number.isFinite(y) || y < 2000 || y > currentYear) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const start = `${y}-01-01T00:00:00.000Z`;
  const end = `${y + 1}-01-01T00:00:00.000Z`;

  const { data: experiences } = await supabase
    .from("experiences")
    .select(
      "id, wallet_item_id, kind, title, subtitle, starts_at, ends_at, venues(name, city, country, lat, lng)",
    )
    .eq("user_id", user.id)
    .gte("starts_at", start)
    .lt("starts_at", end)
    .order("starts_at", { ascending: true });

  const rows = (experiences ?? []).map((e) => {
    const venuesRaw = (e as { venues: unknown }).venues;
    const v = (Array.isArray(venuesRaw) ? venuesRaw[0] : venuesRaw) as {
      name: string | null;
      city: string | null;
      country: string | null;
      lat: number | null;
      lng: number | null;
    } | null;
    return {
      id: e.id,
      wallet_item_id: e.wallet_item_id ?? null,
      kind: e.kind as string,
      title: e.title as string,
      starts_at: e.starts_at as string,
      city: v?.city ?? null,
      country: v?.country ?? null,
      venue: v?.name ?? null,
      lat: v?.lat ?? null,
      lng: v?.lng ?? null,
    };
  });

  // Aggregates
  const cities = Array.from(new Set(rows.map((r) => r.city).filter(Boolean) as string[]));
  const countries = Array.from(new Set(rows.map((r) => r.country).filter(Boolean) as string[]));
  const gigs = rows.filter((r) => r.kind === "ticket").length;
  const flights = rows.filter((r) => r.kind === "flight").length;
  const stays = rows.filter((r) => r.kind === "stay").length;

  // Distance: sum great-circle distances between consecutive geo points.
  const km = (() => {
    const geo = rows.filter((r) => r.lat != null && r.lng != null);
    let total = 0;
    for (let i = 1; i < geo.length; i++) {
      total += haversine(geo[i - 1].lat!, geo[i - 1].lng!, geo[i].lat!, geo[i].lng!);
    }
    return Math.round(total);
  })();

  // Top "artist" — for ticket kind, group by title; not perfect but it reads.
  const topArtist = (() => {
    const counts: Record<string, number> = {};
    for (const r of rows) {
      if (r.kind !== "ticket") continue;
      counts[r.title] = (counts[r.title] ?? 0) + 1;
    }
    const list = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    return list[0]?.[0] ?? null;
  })();

  // Cluster pins by city for the map flyover
  const cityPins = (() => {
    const byCity = new Map<
      string,
      { lat: number; lng: number; count: number; name: string }
    >();
    for (const r of rows) {
      if (r.lat == null || r.lng == null || !r.city) continue;
      const k = `${r.city}-${r.country}`;
      const cur = byCity.get(k);
      if (cur) cur.count += 1;
      else byCity.set(k, { lat: r.lat, lng: r.lng, count: 1, name: r.city });
    }
    return Array.from(byCity.values());
  })();

  if (rows.length === 0) {
    return (
      <div className="mx-auto max-w-xl space-y-6 py-16 text-center">
        <Button asChild variant="ghost" size="sm">
          <Link href="/app">
            <ArrowLeft /> Back to wallet
          </Link>
        </Button>
        <h1 className="text-3xl font-bold">No pins in {y}</h1>
        <p className="text-muted-foreground">
          Nothing landed on your map that year. Capture more, or pick another:
        </p>
        <div className="flex justify-center gap-2">
          {[y - 1, currentYear].map((other) => (
            <Button key={other} asChild variant="outline">
              <Link href={`/app/review/${other}`}>{other}</Link>
            </Button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Button asChild variant="ghost" size="sm">
          <Link href="/app">
            <ArrowLeft /> Back
          </Link>
        </Button>
        <Button variant="outline" size="sm" disabled>
          <Share2 /> Share (V1)
        </Button>
      </div>

      <YearInReview
        year={y}
        rows={rows}
        cityPins={cityPins}
        stats={{
          gigs,
          flights,
          stays,
          cities: cities.length,
          countries: countries.length,
          km,
          topArtist,
        }}
      />
    </div>
  );
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
