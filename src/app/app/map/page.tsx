import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Map" };

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TravelBoard } from "@/features/map/travel-board";
import { isMapboxConfigured } from "@/lib/env";
import { createClient, getSessionUser } from "@/lib/supabase/server";

/**
 * /app/map — the Travel Board. The hero surface and the most-screenshotted
 * artefact in the app. The map fills itself from confirmed experiences.
 *
 * What the viewer sees here is the owner's full set; non-owner views are
 * RLS-filtered by the time-shift rule in experiences policies.
 */
export default async function MapPage() {
  const supabase = await createClient();
  const user = await getSessionUser();
  if (!user) return null;

  const { data: experiences } = await supabase
    .from("experiences")
    .select("id, kind, title, subtitle, starts_at, ends_at, audience, verified_by, venue_id, venues(name, city, country, lat, lng, city_lat, city_lng)")
    .eq("user_id", user.id)
    .order("starts_at", { ascending: false })
    .limit(1000);

  const pins = (experiences ?? [])
    .map((e) => {
      const venuesRaw = (e as { venues: unknown }).venues;
      const v = (Array.isArray(venuesRaw) ? venuesRaw[0] : venuesRaw) as {
        lat: number | null;
        lng: number | null;
        city_lat: number | null;
        city_lng: number | null;
        name: string | null;
        city: string | null;
        country: string | null;
      } | null;
      const lng = v?.lng ?? v?.city_lng;
      const lat = v?.lat ?? v?.city_lat;
      if (lat == null || lng == null) return null;
      return {
        id: e.id,
        kind: e.kind,
        title: e.title,
        subtitle: v?.name ?? e.subtitle ?? "",
        city: v?.city ?? "",
        country: v?.country ?? "",
        starts_at: e.starts_at,
        audience: e.audience,
        verified: e.verified_by !== "none",
        lng,
        lat,
      };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);

  return (
    <div className="space-y-4">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Your map</h1>
          <p className="text-sm text-muted-foreground">
            Every confirmed pin. The reward, not the work.
          </p>
        </div>
        <p className="font-mono text-sm tnum text-muted-foreground">
          {pins.length} pin{pins.length === 1 ? "" : "s"}
        </p>
      </header>

      {isMapboxConfigured ? (
        <TravelBoard pins={pins} />
      ) : (
        <MapboxNotConfigured />
      )}

      {pins.length === 0 ? (
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="text-base">Pin zero</CardTitle>
            <CardDescription>
              The map is empty until you confirm an attended item. Run the
              backfill scan to populate years of history in one go.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/app/capture/backfill">Run backfill scan</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function MapboxNotConfigured() {
  return (
    <div className="bg-aurora relative aspect-[16/9] w-full overflow-hidden rounded-xl border border-border">
      <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
        <div className="max-w-sm space-y-2">
          <p className="font-medium">Mapbox isn&apos;t configured.</p>
          <p className="text-sm text-muted-foreground">
            Drop a <code className="font-mono text-xs">NEXT_PUBLIC_MAPBOX_TOKEN</code>{" "}
            into <code className="font-mono text-xs">.env.local</code> to render the
            live globe. The free tier is plenty for development.
          </p>
        </div>
      </div>
    </div>
  );
}
