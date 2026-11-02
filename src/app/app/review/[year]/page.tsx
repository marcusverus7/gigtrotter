import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { YearInReview } from "@/features/review/year-in-review";
import { ReviewShare } from "@/features/review/review-share";
import { computeYearStats, REVIEW_SELECT, toReviewRows } from "@/lib/review/year-stats";
import { reviewToken } from "@/lib/share/review-token";

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
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const start = `${y}-01-01T00:00:00.000Z`;
  const end = `${y + 1}-01-01T00:00:00.000Z`;

  const { data: experiences } = await supabase
    .from("experiences")
    .select(REVIEW_SELECT)
    .eq("user_id", user.id)
    .gte("starts_at", start)
    .lt("starts_at", end)
    .order("starts_at", { ascending: true });

  const rows = toReviewRows(experiences as Array<Record<string, unknown>> | null);
  const stats = computeYearStats(y, rows);
  const cities = stats.cities;
  const countries = stats.countries;
  const { gigs, flights, stays, km, topArtist } = stats;

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
        <ReviewShare
          year={y}
          cardUrl={`/api/review/${y}?u=${encodeURIComponent(user.id)}&t=${reviewToken(user.id, y)}`}
        />
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
