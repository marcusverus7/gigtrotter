import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Bed,
  Globe2,
  Plane,
  ShieldCheck,
  Ticket as TicketIcon,
  UtensilsCrossed,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { createClient } from "@/lib/supabase/server";
import { AudienceSelector } from "@/features/wallet/audience-selector";

const ICONS = {
  ticket: TicketIcon,
  flight: Plane,
  stay: Bed,
  restaurant: UtensilsCrossed,
  other: TicketIcon,
} as const;

export default async function WalletItemDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: item } = await supabase
    .from("wallet_items")
    .select("*, venues(name, city, country, lat, lng), captures(parse_json, vendor)")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!item) notFound();

  const { data: experience } = await supabase
    .from("experiences")
    .select("id, audience, verified_by, rating, review")
    .eq("wallet_item_id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  const Icon = ICONS[item.kind] ?? TicketIcon;
  const venue = item.venues?.name
    ? [item.venues.name, item.venues.city, item.venues.country]
        .filter(Boolean)
        .join(" · ")
    : (item.subtitle ?? "");

  const startsAt = item.starts_at ? new Date(item.starts_at) : null;
  const endsAt = item.ends_at ? new Date(item.ends_at) : null;
  const isFuture = startsAt ? startsAt.getTime() > Date.now() : false;
  const isLive =
    startsAt &&
    startsAt.getTime() <= Date.now() &&
    (endsAt ?? startsAt).getTime() > Date.now();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/app">
          <ArrowLeft /> Back to wallet
        </Link>
      </Button>

      <Card className="overflow-hidden border-primary/30">
        <CardHeader className="bg-gradient-to-br from-primary/15 via-card to-secondary/10">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-background text-primary">
              <Icon className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="capitalize">
                  {item.kind}
                </Badge>
                <Badge variant={isLive ? "inner" : isFuture ? "friends" : "verified"}>
                  {isLive ? "Live now" : isFuture ? "Upcoming" : "Attended"}
                </Badge>
                {experience?.verified_by && experience.verified_by !== "none" ? (
                  <Badge variant="verified">
                    <ShieldCheck className="mr-1 h-3 w-3" />
                    Verified · {experience.verified_by}
                  </Badge>
                ) : null}
              </div>
              <CardTitle className="mt-2 text-2xl leading-tight">
                {item.title}
              </CardTitle>
              {venue ? (
                <CardDescription className="text-base">{venue}</CardDescription>
              ) : null}
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6 pt-6">
          {startsAt ? (
            <div className="grid grid-cols-2 gap-4">
              <Stat label="When">
                {new Intl.DateTimeFormat(undefined, {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                }).format(startsAt)}
              </Stat>
              {endsAt ? (
                <Stat label="Ends">
                  {new Intl.DateTimeFormat(undefined, {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  }).format(endsAt)}
                </Stat>
              ) : null}
            </div>
          ) : null}

          {item.barcode_ref || item.kind === "ticket" || item.kind === "flight" ? (
            <BarcodePanel
              hasBarcode={!!item.barcode_ref}
              eventOver={!!endsAt && endsAt.getTime() < Date.now()}
            />
          ) : null}

          <Separator />

          {experience ? (
            <AudienceSelector
              experienceId={experience.id}
              audience={experience.audience}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              This becomes a pin on your map once the event has ended.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 text-base font-medium">{children}</p>
    </div>
  );
}

/**
 * Offline ticket / barcode pane. Per §3.3 — barcodes stored encrypted, shown
 * to the owner only, auto-blurred everywhere the share sheet can reach until
 * the event has ended. For phase 3 we render a placeholder; the live decrypt
 * flow lands in V1 alongside the native mobile build.
 */
function BarcodePanel({
  hasBarcode,
  eventOver,
}: {
  hasBarcode: boolean;
  eventOver: boolean;
}) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/30 p-6 text-center">
      {hasBarcode ? (
        <>
          <div
            className={eventOver ? "" : "select-none"}
            aria-label="Ticket barcode"
          >
            <div
              className="mx-auto h-24 w-full max-w-xs rounded bg-foreground/90"
              style={{
                maskImage:
                  "linear-gradient(90deg, #000 1px, transparent 1px, transparent 4px, #000 4px, #000 5px, transparent 5px, transparent 9px, #000 9px, #000 12px, transparent 12px)",
                WebkitMaskImage:
                  "linear-gradient(90deg, #000 1px, transparent 1px, transparent 4px, #000 4px, #000 5px, transparent 5px, transparent 9px, #000 9px, #000 12px, transparent 12px)",
              }}
            />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            {eventOver
              ? "Barcode revealed (event has ended)."
              : "Encrypted barcode. Shown live in the native app only."}
          </p>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          No live barcode captured for this item.
        </p>
      )}
    </div>
  );
}
