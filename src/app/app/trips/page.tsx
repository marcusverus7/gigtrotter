import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Bed, Plane, Ticket as TicketIcon } from "lucide-react";

export const metadata: Metadata = { title: "Trips" };

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { assembleTrips } from "@/features/trips/actions";

/**
 * /app/trips — list view. Auto-assembled trips first, hand-made later.
 */
export default async function TripsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: trips } = await supabase
    .from("trips")
    .select("*, wallet_items(id, kind, title, starts_at, venues(city, country))")
    .eq("user_id", user.id)
    .order("starts_at", { ascending: false });

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Trips</h1>
          <p className="text-sm text-muted-foreground">
            Flights, stays, and the gig inside — clustered automatically.
          </p>
        </div>
        <form action={assembleTrips}>
          <Button type="submit" size="sm" variant="outline">
            Re-cluster
          </Button>
        </form>
      </header>

      {!trips || trips.length === 0 ? (
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="text-base">No trips yet</CardTitle>
            <CardDescription>
              When two or more wallet items overlap — a flight, a hotel, a gig —
              they cluster into one trip with a day-by-day timeline. Click
              re-cluster after you&apos;ve added some.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {trips.map((t) => {
            const items =
              ((t as { wallet_items: unknown }).wallet_items as Array<{
                kind: string;
                title: string;
                venues: { city: string | null; country: string | null }[] | null;
              }>) ?? [];
            const cities = Array.from(
              new Set(
                items.flatMap((i) => {
                  const v = i.venues;
                  const list = Array.isArray(v) ? v : [];
                  return list.map((x) => x.city).filter(Boolean) as string[];
                }),
              ),
            );
            return (
              <Link key={t.id} href={`/app/trips/${t.id}`}>
                <Card className="h-full overflow-hidden border-border/60 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[0_20px_60px_-15px_rgba(124,58,237,0.25)]">
                  <CardHeader className="bg-gradient-to-br from-primary/10 via-card to-secondary/5">
                    <Badge variant="inner" className="w-fit text-xs">
                      Auto-assembled
                    </Badge>
                    <CardTitle className="mt-2 text-xl">{t.title}</CardTitle>
                    <CardDescription>
                      {new Intl.DateTimeFormat(undefined, {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      }).format(new Date(t.starts_at))}
                      {" → "}
                      {new Intl.DateTimeFormat(undefined, {
                        day: "numeric",
                        month: "short",
                      }).format(new Date(t.ends_at))}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3 pt-5">
                    {cities.length > 0 ? (
                      <p className="text-sm text-muted-foreground">
                        {cities.join(" · ")}
                      </p>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      {items.slice(0, 8).map((i, idx) => {
                        const Icon =
                          i.kind === "flight"
                            ? Plane
                            : i.kind === "stay"
                              ? Bed
                              : TicketIcon;
                        return (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1 rounded-md border border-border bg-card/40 px-2 py-1 text-xs"
                          >
                            <Icon className="h-3 w-3" />
                            <span className="max-w-[120px] truncate">
                              {i.title}
                            </span>
                          </span>
                        );
                      })}
                    </div>
                    <div className="flex items-center gap-1 pt-1 text-xs text-primary">
                      View timeline <ArrowRight className="h-3 w-3" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
