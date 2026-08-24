"use client";

import { useMemo } from "react";
import {
  Bed,
  Plane,
  Ticket as TicketIcon,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type {
  Database,
  WalletKind,
  WalletStatus,
} from "@/lib/supabase/types";
import { endDisplay } from "@/lib/dates";
import { cn } from "@/lib/utils";

type Item = Database["public"]["Tables"]["wallet_items"]["Row"] & {
  venues: { name: string | null; city: string | null; country: string | null } | null;
};

const ICON: Record<WalletKind, LucideIcon> = {
  ticket: TicketIcon,
  flight: Plane,
  stay: Bed,
  restaurant: UtensilsCrossed,
  other: TicketIcon,
};

/**
 * The wallet — partitioned into Tonight / Upcoming / Wishlist / Attended.
 * Tonight first because that's the necessity that earns the home screen.
 */
export function Wallet({ items }: { items: Item[] }) {
  const groups = useMemo(() => groupItems(items), [items]);

  return (
    <Tabs defaultValue="tonight">
      <TabsList>
        <TabsTrigger value="tonight">
          Tonight {groups.tonight.length > 0 ? `· ${groups.tonight.length}` : ""}
        </TabsTrigger>
        <TabsTrigger value="upcoming">
          Upcoming {groups.upcoming.length > 0 ? `· ${groups.upcoming.length}` : ""}
        </TabsTrigger>
        <TabsTrigger value="wishlist">
          Wishlist {groups.wishlist.length > 0 ? `· ${groups.wishlist.length}` : ""}
        </TabsTrigger>
        <TabsTrigger value="past">
          Past {groups.past.length > 0 ? `· ${groups.past.length}` : ""}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="tonight" className="space-y-3">
        {groups.tonight.length === 0 ? (
          <EmptyBucket label="Nothing tonight. Take a breath." />
        ) : (
          groups.tonight.map((i) => <ItemCard key={i.id} item={i} hero />)
        )}
      </TabsContent>
      <TabsContent value="upcoming" className="space-y-3">
        {groups.upcoming.length === 0 ? (
          <EmptyBucket
            label="Nothing upcoming. Screenshot a ticket and it lands here automatically."
            action={{ href: "/app/capture", label: "Capture a ticket" }}
          />
        ) : (
          groups.upcoming.map((i) => <ItemCard key={i.id} item={i} />)
        )}
      </TabsContent>
      <TabsContent value="wishlist" className="space-y-3">
        {groups.wishlist.length === 0 ? (
          <EmptyBucket
            label="Nothing saved yet. Add a gig you fancy but have not bought a ticket for — it waits here until you do."
            action={{ href: "/app/capture/manual", label: "Save a gig" }}
          />
        ) : (
          groups.wishlist.map((i) => <ItemCard key={i.id} item={i} />)
        )}
      </TabsContent>
      <TabsContent value="past" className="space-y-3">
        {groups.past.length === 0 ? (
          <EmptyBucket
            label="No past gigs yet. Scan your camera roll and years of old tickets fill this in minutes."
            action={{ href: "/app/capture/backfill", label: "Run backfill scan" }}
          />
        ) : (
          groups.past.map((i) => <ItemCard key={i.id} item={i} muted />)
        )}
      </TabsContent>
    </Tabs>
  );
}

function ItemCard({
  item,
  hero,
  muted,
}: {
  item: Item;
  hero?: boolean;
  muted?: boolean;
}) {
  const Icon = ICON[item.kind];
  const venue = item.venues?.name ?? item.subtitle ?? "";
  const city = item.venues?.city ?? "";
  const subtitle = [venue, city].filter(Boolean).join(" · ");

  return (
    <Link href={`/app/item/${item.id}`} className="block">
      <Card
        className={cn(
          "transition-colors hover:border-primary/40",
          hero && "border-primary/50 bg-gradient-to-br from-primary/10 via-card to-secondary/5",
          muted && "opacity-70",
        )}
      >
        <CardHeader className="flex flex-row items-start justify-between gap-3 pb-2">
          <div className="flex items-start gap-3">
            <div
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-lg",
                hero
                  ? "bg-primary text-primary-foreground"
                  : "bg-primary/10 text-primary",
              )}
            >
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base leading-tight">{item.title}</CardTitle>
              {subtitle ? (
                <p className="text-sm text-muted-foreground">{subtitle}</p>
              ) : null}
            </div>
          </div>
          <StatusBadge status={item.status} />
        </CardHeader>
        <CardContent className="flex items-center justify-between pt-1">
          <DateLine startsAt={item.starts_at} endsAt={item.ends_at} hero={hero} />
          {hero && item.starts_at ? (
            <Countdown isoTime={item.starts_at} />
          ) : null}
        </CardContent>
      </Card>
    </Link>
  );
}

function StatusBadge({ status }: { status: WalletStatus }) {
  switch (status) {
    case "tonight":
      return <Badge variant="inner">Tonight</Badge>;
    case "going":
      return <Badge variant="friends">Going</Badge>;
    case "wishlist":
      return <Badge variant="outline">Wishlist</Badge>;
    case "attended":
      return <Badge variant="verified">Attended</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function DateLine({
  startsAt,
  endsAt,
  hero,
}: {
  startsAt: string | null;
  endsAt: string | null;
  hero?: boolean;
}) {
  if (!startsAt) return <span className="text-xs text-muted-foreground">No date</span>;
  const start = new Date(startsAt);
  const fmt = new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const timeOnly = new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });

  const end = endDisplay(startsAt, endsAt);

  return (
    <span
      className={cn(
        "text-sm",
        hero ? "font-medium" : "text-muted-foreground",
      )}
      suppressHydrationWarning
    >
      {fmt.format(start)}
      {end.show
        ? ` – ${end.sameDay ? timeOnly.format(end.end) : fmt.format(end.end)}`
        : null}
    </span>
  );
}

function Countdown({ isoTime }: { isoTime: string }) {
  const target = new Date(isoTime).getTime();
  const diff = target - Date.now();
  if (diff <= 0) {
    return <Badge variant="inner">Now</Badge>;
  }
  const hours = Math.floor(diff / 3600_000);
  const mins = Math.floor((diff % 3600_000) / 60_000);
  return (
    <span className="font-mono text-sm tnum text-primary">
      {hours}h {mins}m
    </span>
  );
}

function EmptyBucket({
  label,
  action,
}: {
  label: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="rounded-md border border-dashed border-border bg-card/40 p-6 text-center">
      <p className="text-sm text-muted-foreground">{label}</p>
      {action ? (
        <Link
          href={action.href}
          className="mt-3 inline-block text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}

function groupItems(items: Item[]) {
  const now = Date.now();
  const twelveHours = 12 * 3600_000;
  const groups = {
    tonight: [] as Item[],
    upcoming: [] as Item[],
    wishlist: [] as Item[],
    past: [] as Item[],
  };
  for (const item of items) {
    const start = item.starts_at ? new Date(item.starts_at).getTime() : null;
    const end = item.ends_at ? new Date(item.ends_at).getTime() : null;
    if (item.status === "wishlist" || !start) {
      groups.wishlist.push(item);
    } else if (start - now < twelveHours && (end ?? start) >= now - twelveHours) {
      groups.tonight.push(item);
    } else if (start > now) {
      groups.upcoming.push(item);
    } else {
      groups.past.push(item);
    }
  }
  groups.past.sort((a, b) =>
    new Date(b.starts_at ?? 0).getTime() - new Date(a.starts_at ?? 0).getTime(),
  );
  return groups;
}
