"use client";

import Link from "next/link";
import {
  Calendar,
  MapPin,
  Music,
  Tag,
  Ticket,
  Users,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export type EventSummary = {
  id: string;
  title: string;
  headliner: string | null;
  artist_names: string[];
  category: string;
  venue_name: string | null;
  venue_city: string | null;
  venue_country: string | null;
  starts_at: string | null;
  image_url: string | null;
  min_price_cents: number | null;
  currency: string;
  is_sold_out: boolean;
  tags: string[];
  interested_count?: number;
  going_count?: number;
  friends_going?: string[];
};

const CATEGORY_ICONS: Record<string, typeof Music> = {
  concert: Music,
  festival: Music,
  club_night: Music,
  theatre: Ticket,
  comedy: Ticket,
  sport: Ticket,
  other: Ticket,
};

const CATEGORY_LABELS: Record<string, string> = {
  concert: "Concert",
  festival: "Festival",
  club_night: "Club night",
  theatre: "Theatre",
  comedy: "Comedy",
  sport: "Sport",
  other: "Event",
};

function money(cents: number, currency: string) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function EventCard({ event }: { event: EventSummary }) {
  const Icon = CATEGORY_ICONS[event.category] ?? Music;
  const place = [event.venue_name, event.venue_city]
    .filter(Boolean)
    .join(" · ");

  return (
    <Link href={`/app/events/${event.id}`}>
      <Card className="group overflow-hidden transition-all hover:border-primary/40 hover:shadow-lg">
        {event.image_url ? (
          <div className="relative aspect-[16/9] overflow-hidden bg-muted">
            <img
              src={event.image_url}
              alt={event.title}
              className="h-full w-full object-cover transition-transform group-hover:scale-105"
            />
            {event.is_sold_out ? (
              <div className="absolute inset-0 flex items-center justify-center bg-background/70">
                <Badge variant="destructive" className="text-sm">
                  Sold out
                </Badge>
              </div>
            ) : null}
            <div className="absolute bottom-2 left-2 flex gap-1.5">
              <Badge
                variant="secondary"
                className="bg-background/80 text-[10px] backdrop-blur-sm"
              >
                <Icon className="mr-1 h-3 w-3" />
                {CATEGORY_LABELS[event.category] ?? "Event"}
              </Badge>
            </div>
          </div>
        ) : (
          <div className="flex aspect-[16/9] items-center justify-center bg-gradient-to-br from-primary/15 to-secondary/10">
            <Icon className="h-12 w-12 text-muted-foreground/30" />
          </div>
        )}

        <CardHeader className="pb-2 pt-3">
          <CardTitle className="text-base leading-tight">
            {event.title}
          </CardTitle>
          {event.headliner && event.headliner !== event.title ? (
            <p className="text-xs text-muted-foreground">{event.headliner}</p>
          ) : null}
        </CardHeader>

        <CardContent className="space-y-2 pb-4">
          {place ? (
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="h-3 w-3" />
              {place}
            </p>
          ) : null}
          {event.starts_at ? (
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <Calendar className="h-3 w-3" />
              {new Intl.DateTimeFormat(undefined, {
                weekday: "short",
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              }).format(new Date(event.starts_at))}
            </p>
          ) : null}

          <div className="flex items-center justify-between">
            {event.min_price_cents ? (
              <p className="flex items-center gap-1 text-xs">
                <Tag className="h-3 w-3 text-muted-foreground" />
                <span className="font-mono font-medium tnum">
                  From {money(event.min_price_cents, event.currency)}
                </span>
              </p>
            ) : (
              <span />
            )}

            <div className="flex items-center gap-2">
              {event.friends_going && event.friends_going.length > 0 ? (
                <Badge variant="friends" className="text-[10px]">
                  <Users className="mr-1 h-3 w-3" />
                  {event.friends_going.length} friend
                  {event.friends_going.length > 1 ? "s" : ""} going
                </Badge>
              ) : null}
              {event.going_count ? (
                <span className="text-[10px] text-muted-foreground">
                  {event.going_count} going
                </span>
              ) : null}
            </div>
          </div>

          {event.tags.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {event.tags.slice(0, 3).map((tag) => (
                <Badge
                  key={tag}
                  variant="outline"
                  className="text-[9px] font-normal"
                >
                  {tag}
                </Badge>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </Link>
  );
}
