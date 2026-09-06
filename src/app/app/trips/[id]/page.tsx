import { LocalDateTime } from "@/components/local-datetime";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

export const metadata: Metadata = { title: "Trip" };
import {
  ArrowLeft,
  Bed,
  Calendar,
  MapPin,
  Plane,
  Ticket as TicketIcon,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient, getSessionUser } from "@/lib/supabase/server";

const KIND_ICON: Record<string, LucideIcon> = {
  flight: Plane,
  stay: Bed,
  ticket: TicketIcon,
  restaurant: TicketIcon,
  other: TicketIcon,
};

type Item = {
  id: string;
  kind: string;
  title: string;
  subtitle: string | null;
  starts_at: string | null;
  ends_at: string | null;
  venues: { name: string | null; city: string | null; country: string | null } | null;
};

export default async function TripDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const { data: trip } = await supabase
    .from("trips")
    .select("*, wallet_items(id, kind, title, subtitle, starts_at, ends_at, venues(name, city, country))")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!trip) notFound();

  const itemsRaw = ((trip as { wallet_items: unknown }).wallet_items ?? []) as Array<{
    id: string;
    kind: string;
    title: string;
    subtitle: string | null;
    starts_at: string | null;
    ends_at: string | null;
    venues: Array<{ name: string | null; city: string | null; country: string | null }> | { name: string | null; city: string | null; country: string | null } | null;
  }>;

  const items: Item[] = itemsRaw
    .map((i) => ({
      id: i.id,
      kind: i.kind,
      title: i.title,
      subtitle: i.subtitle,
      starts_at: i.starts_at,
      ends_at: i.ends_at,
      venues: Array.isArray(i.venues) ? i.venues[0] ?? null : i.venues,
    }))
    .sort(
      (a, b) =>
        new Date(a.starts_at ?? 0).getTime() -
        new Date(b.starts_at ?? 0).getTime(),
    );

  // Group items by day for the timeline.
  const byDay = new Map<string, Item[]>();
  for (const item of items) {
    if (!item.starts_at) continue;
    const day = item.starts_at.slice(0, 10);
    const list = byDay.get(day) ?? [];
    list.push(item);
    byDay.set(day, list);
  }
  const days = Array.from(byDay.entries()).sort(([a], [b]) => a.localeCompare(b));

  const cities = Array.from(
    new Set(items.map((i) => i.venues?.city).filter(Boolean) as string[]),
  );
  const dayCount = Math.max(
    1,
    Math.ceil(
      (new Date(trip.ends_at).getTime() - new Date(trip.starts_at).getTime()) /
        86400_000,
    ),
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/app/trips">
          <ArrowLeft /> Back to trips
        </Link>
      </Button>

      <Card className="overflow-hidden border-primary/30">
        <CardHeader className="bg-gradient-to-br from-primary/15 via-card to-secondary/10 pb-8">
          <Badge variant="inner" className="w-fit">
            {trip.auto_assembled ? "Auto-assembled" : "Custom"}
          </Badge>
          <CardTitle className="mt-3 text-3xl">{trip.title}</CardTitle>
          <p className="mt-2 text-muted-foreground">
            <LocalDateTime
              iso={trip.starts_at}
              options={{ day: "numeric", month: "long", year: "numeric" }}
            />
            {" → "}
            <LocalDateTime
              iso={trip.ends_at}
              options={{ day: "numeric", month: "long", year: "numeric" }}
            />
          </p>
        </CardHeader>
        <CardContent className="grid grid-cols-3 gap-4 pt-6">
          <Stat icon={Calendar} label="Days" value={dayCount} />
          <Stat icon={MapPin} label="Cities" value={cities.length} />
          <Stat icon={TicketIcon} label="Items" value={items.length} />
        </CardContent>
      </Card>

      {/* Day-by-day timeline */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Timeline</h2>
        <ol className="relative space-y-0">
          {days.map(([day, list]) => (
            <li key={day} className="relative pl-8 pb-6">
              <span className="absolute left-0 top-2 flex h-3 w-3 -translate-x-1/2 items-center justify-center rounded-full bg-primary shadow-[0_0_12px_hsl(var(--primary)/0.7)]" />
              <span className="absolute left-0 top-5 h-full w-px -translate-x-1/2 bg-border" />
              <div>
                <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                  {/* `day` is a UTC date KEY (starts_at.slice(0,10)), not an
                      instant, so it is formatted in UTC on purpose — reading
                      it in the viewer's zone would print a different day from
                      the one the items were grouped into. */}
                  {new Intl.DateTimeFormat(undefined, {
                    weekday: "long",
                    day: "numeric",
                    month: "short",
                    timeZone: "UTC",
                  }).format(new Date(day))}
                </p>
                <div className="mt-2 space-y-2">
                  {list.map((it) => {
                    const Icon = KIND_ICON[it.kind] ?? TicketIcon;
                    const place = [it.venues?.name, it.venues?.city]
                      .filter(Boolean)
                      .join(" · ");
                    const time = it.starts_at ? (
                      <LocalDateTime
                        iso={it.starts_at}
                        options={{ hour: "2-digit", minute: "2-digit" }}
                      />
                    ) : (
                      "—"
                    );
                    return (
                      <Link
                        key={it.id}
                        href={`/app/item/${it.id}`}
                        className="flex items-center gap-3 rounded-lg border border-border bg-card/40 p-3 transition-colors hover:border-primary/40 hover:bg-card/80"
                      >
                        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {it.title}
                          </p>
                          {place ? (
                            <p className="truncate text-xs text-muted-foreground">
                              {place}
                            </p>
                          ) : null}
                        </div>
                        <span className="font-mono text-xs text-muted-foreground tnum">
                          {time}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: number | string;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <div className="mt-1 font-mono text-3xl tnum">{value}</div>
    </div>
  );
}
