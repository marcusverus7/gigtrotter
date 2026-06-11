"use client";

import { useEffect, useState } from "react";
import {
  Bed,
  Clock,
  MapPin,
  Plane,
  Ticket as TicketIcon,
  Train,
  Users,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
} from "@/components/ui/card";

type NightItem = {
  id: string;
  kind: string;
  title: string;
  subtitle: string | null;
  starts_at: string | null;
  ends_at: string | null;
  meta?: Record<string, unknown> | null;
  venues?:
    | {
        name: string | null;
        city: string | null;
        country: string | null;
        lat: number | null;
        lng: number | null;
      }
    | Array<{ name: string | null; city: string | null; country: string | null; lat: number | null; lng: number | null }>
    | null;
};

const KIND_ICON: Record<string, LucideIcon> = {
  flight: Plane,
  stay: Bed,
  ticket: TicketIcon,
  restaurant: TicketIcon,
  other: TicketIcon,
};

/**
 * Night Mode hero card. Lock-screen-style: dark, glowing, calm typography.
 * Countdown ticks every second client-side. Designed to look great in a
 * screenshot — Night Mode is high-trust territory.
 */
export function NightCard({ item }: { item: NightItem }) {
  const Icon = KIND_ICON[item.kind] ?? TicketIcon;
  const venue = Array.isArray(item.venues) ? item.venues[0] ?? null : item.venues ?? null;
  const place = [venue?.name, venue?.city].filter(Boolean).join(" · ");

  const startMs = item.starts_at ? new Date(item.starts_at).getTime() : null;
  const endMs = item.ends_at ? new Date(item.ends_at).getTime() : null;
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const isLive = startMs != null && startMs <= now && (endMs ?? startMs) >= now;
  const isPast = endMs != null && endMs < now;
  const remaining = startMs != null ? startMs - now : null;
  const status = isLive ? "Live now" : isPast ? "Just ended" : "Upcoming";

  // Extras the parser may have stuffed into meta.
  const doorsAt = (item.meta?.doors_at as string | undefined) ?? null;
  const setTimes = (item.meta?.set_times as Array<{ artist: string; time: string }> | undefined) ?? [];
  const meetSpot = (item.meta?.meet_spot as string | undefined) ?? null;
  const lastTrain = (item.meta?.last_train as string | undefined) ?? null;

  return (
    <Card className="overflow-hidden border-primary/40 bg-gradient-to-br from-primary/15 via-card to-secondary/10 shadow-[0_24px_80px_-30px_rgba(124,58,237,0.55)]">
      <CardContent className="space-y-6 p-7">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-background/70 text-primary backdrop-blur">
              <Icon className="h-6 w-6" />
            </div>
            <div>
              <div className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                {item.kind}
              </div>
              <Badge
                variant={isLive ? "inner" : isPast ? "outline" : "verified"}
                className="mt-1"
              >
                {status}
              </Badge>
            </div>
          </div>
          {startMs ? (
            <div className="text-right">
              <div className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                {isLive ? "ends in" : isPast ? "ended" : "starts in"}
              </div>
              <Countdown ms={remaining ?? 0} isLive={isLive} />
            </div>
          ) : null}
        </div>

        {/* Title block — generously sized */}
        <div className="space-y-1">
          <h2 className="text-3xl font-bold leading-tight tracking-tight md:text-4xl">
            {item.title}
          </h2>
          {place ? (
            <p className="flex items-center gap-1.5 text-base text-muted-foreground">
              <MapPin className="h-4 w-4" />
              {place}
            </p>
          ) : null}
        </div>

        {/* Schedule strip */}
        {startMs ? (
          <div className="rounded-xl border border-border/60 bg-background/30 p-4 backdrop-blur">
            <div className="grid grid-cols-2 gap-4">
              <ScheduleRow
                icon={Clock}
                label="Starts"
                value={fmtTime(startMs)}
              />
              {doorsAt ? (
                <ScheduleRow
                  icon={Clock}
                  label="Doors"
                  value={fmtTime(new Date(doorsAt).getTime())}
                />
              ) : endMs ? (
                <ScheduleRow icon={Clock} label="Ends" value={fmtTime(endMs)} />
              ) : null}
              {meetSpot ? (
                <ScheduleRow
                  icon={Users}
                  label="Meet spot"
                  value={meetSpot}
                  fullWidth
                />
              ) : null}
              {lastTrain ? (
                <ScheduleRow
                  icon={Train}
                  label="Last train"
                  value={lastTrain}
                />
              ) : null}
            </div>
            {setTimes.length > 0 ? (
              <div className="mt-4 border-t border-border/60 pt-4">
                <p className="mb-2 font-mono text-xs uppercase tracking-wider text-muted-foreground">
                  Set times
                </p>
                <ul className="grid gap-1 text-sm">
                  {setTimes.map((s, i) => (
                    <li key={i} className="flex justify-between">
                      <span>{s.artist}</span>
                      <span className="font-mono tnum text-muted-foreground">
                        {s.time}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Barcode placeholder — the actual encrypted barcode renders only
            in the native app per the security model. Web shows a stylised
            placeholder so the share-sheet can't lift the live code. */}
        {item.kind === "ticket" || item.kind === "flight" ? (
          <div className="rounded-xl border border-dashed border-border/60 bg-background/30 p-6 text-center backdrop-blur">
            <div className="mx-auto h-20 w-full max-w-xs rounded bg-foreground/80 [mask-image:repeating-linear-gradient(90deg,_#000_0,_#000_1px,_transparent_1px,_transparent_4px,_#000_4px,_#000_5px,_transparent_5px,_transparent_9px,_#000_9px,_#000_12px,_transparent_12px)]" />
            <p className="mt-3 text-xs text-muted-foreground">
              Encrypted ticket — open in the native app to scan.
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Countdown({ ms, isLive }: { ms: number; isLive: boolean }) {
  if (isLive) {
    return (
      <div className="flex items-center justify-end gap-2 font-mono text-primary">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
        </span>
        <span className="text-lg">NOW</span>
      </div>
    );
  }
  if (ms <= 0) return <span className="font-mono text-muted-foreground">—</span>;
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  const parts =
    days > 0
      ? [days + "d", hours + "h", mins + "m"]
      : hours > 0
        ? [hours + "h", mins + "m", secs.toString().padStart(2, "0") + "s"]
        : [mins + "m", secs.toString().padStart(2, "0") + "s"];
  return (
    <div className="font-mono text-2xl tnum text-primary">{parts.join(" ")}</div>
  );
}

function ScheduleRow({
  icon: Icon,
  label,
  value,
  fullWidth,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  fullWidth?: boolean;
}) {
  return (
    <div className={fullWidth ? "col-span-2" : ""}>
      <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <div className="mt-0.5 text-base font-medium">{value}</div>
    </div>
  );
}

function fmtTime(ms: number): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ms));
}
