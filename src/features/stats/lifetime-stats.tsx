import { Globe, MapPin, Music, Plane } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

/**
 * The lifetime stats card. Promoted from V1 in v2 → MVP in v3 because sparse
 * maps need stats to feel impressive (§8.1).
 *
 * Counts are all RLS-scoped to the current user.
 */
export async function LifetimeStats({ userId }: { userId: string }) {
  const supabase = await createClient();

  const [{ count: gigs }, { count: flights }, { data: venuesRows }, { data: countryRows }] =
    await Promise.all([
      supabase
        .from("experiences")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("kind", "ticket"),
      supabase
        .from("experiences")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("kind", "flight"),
      supabase
        .from("experiences")
        .select("venue_id")
        .eq("user_id", userId)
        .not("venue_id", "is", null),
      supabase
        .from("experiences")
        .select("venues(country)")
        .eq("user_id", userId),
    ]);

  const venues = new Set(venuesRows?.map((r) => r.venue_id)).size;
  const countries = new Set(
    (countryRows ?? [])
      .map((r) => (r as { venues: { country: string | null } | null }).venues?.country)
      .filter(Boolean),
  ).size;

  const items = [
    { label: "Gigs", value: gigs ?? 0, icon: Music },
    { label: "Flights", value: flights ?? 0, icon: Plane },
    { label: "Venues", value: venues, icon: MapPin },
    { label: "Countries", value: countries, icon: Globe },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Lifetime</CardTitle>
        <CardDescription>The compounding asset.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {items.map((s) => (
            <div key={s.label} className="space-y-1">
              <div className="flex items-center gap-1 text-xs uppercase tracking-wider text-muted-foreground">
                <s.icon className="h-3.5 w-3.5" />
                {s.label}
              </div>
              <div className="font-mono text-3xl tnum">{s.value}</div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
