import { LocalDateTime } from "@/components/local-datetime";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CalendarClock, MapPin, ShieldCheck, TriangleAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getAdminUser } from "@/lib/auth/admin";
import { createServiceClient } from "@/lib/supabase/server";
import { ModerationButtons } from "@/features/events/moderation-buttons";

export const metadata: Metadata = { title: "Admin — Event Moderation" };

type PendingEvent = {
  id: string;
  title: string;
  headliner: string | null;
  venue_name: string | null;
  venue_city: string | null;
  starts_at: string | null;
  promoter_name: string | null;
  description: string | null;
  created_at: string;
};

export default async function EventModerationPage() {
  const admin = await getAdminUser();
  if (!admin) redirect("/app");

  const service = createServiceClient();
  const { data, error } = await (service.from("events") as any)
    .select(
      "id, title, headliner, venue_name, venue_city, starts_at, promoter_name, description, created_at",
    )
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(100);

  // Migration 0011 adds `events.status`. Until it's applied the filter above
  // fails with undefined_column — show the operator what to do rather than a
  // stack trace.
  const migrationMissing = error?.code === "42703";
  const rows = (data ?? []) as PendingEvent[];

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="space-y-1">
        <p className="flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-muted-foreground">
          <ShieldCheck className="h-4 w-4" />
          Submitted events · held for review
        </p>
        <h1 className="text-2xl font-bold tracking-tight">Event moderation</h1>
        <p className="text-sm text-muted-foreground">
          User-submitted events stay invisible to everyone else until approved.
          Approving publishes the event and grants the submitter promoter
          powers over it.
        </p>
      </header>

      {migrationMissing && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="flex gap-3 py-5">
            <TriangleAlert className="h-5 w-5 shrink-0 text-amber-500" />
            <div className="space-y-1 text-sm">
              <p className="font-medium text-foreground">
                Migration not applied yet.
              </p>
              <p className="text-muted-foreground">
                Run{" "}
                <code className="rounded bg-background/60 px-1.5 py-0.5 text-xs">
                  supabase/migrations/0011_event_moderation.sql
                </code>{" "}
                to add the <code className="text-xs">status</code> column and
                tighten the public-read policy. Until then, submitted events are
                not being held for review.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {error && !migrationMissing && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="py-5 text-sm text-muted-foreground">
            Couldn&apos;t load pending events: {error.message}
          </CardContent>
        </Card>
      )}

      {!error && rows.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Nothing waiting for review.
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {rows.map((ev) => {
          // A moderator approving a gig needs the time the promoter meant,
          // not Vercel's UTC — a 19:30 BST doors read as 18:30 here.
          const when = ev.starts_at ? (
            <LocalDateTime
              iso={ev.starts_at}
              options={{
                weekday: "short",
                day: "numeric",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              }}
            />
          ) : (
            "No date given"
          );
          const where = [ev.venue_name, ev.venue_city]
            .filter(Boolean)
            .join(" · ");

          return (
            <Card key={ev.id} className="border-border/60">
              <CardContent className="flex flex-wrap items-start justify-between gap-4 py-5">
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold">{ev.title}</h2>
                    <Badge variant="outline" className="text-[10px]">
                      Pending
                    </Badge>
                  </div>
                  {ev.headliner && (
                    <p className="text-sm text-muted-foreground">
                      {ev.headliner}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <CalendarClock className="h-3.5 w-3.5" />
                      {when}
                    </span>
                    {where && (
                      <span className="flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5" />
                        {where}
                      </span>
                    )}
                  </div>
                  {ev.description && (
                    <p className="max-w-prose text-sm text-muted-foreground">
                      {ev.description.length > 220
                        ? `${ev.description.slice(0, 220)}…`
                        : ev.description}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Submitted by {ev.promoter_name ?? "unknown"}
                  </p>
                </div>
                <ModerationButtons eventId={ev.id} title={ev.title} />
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
