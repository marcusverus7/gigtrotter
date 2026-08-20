import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Bed,
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
import { CountdownShare } from "@/features/wallet/countdown-share";
import { WhoElseGoing } from "@/features/wallet/who-else-going";
import { ExperienceEditor } from "@/features/wallet/experience-editor";
import { ItemDateEditor } from "@/features/wallet/item-date-editor";
import { ItemDetailsEditor } from "@/features/wallet/item-details-editor";
import { GigMerchSection } from "@/features/merch/gig-merch-section";
import { DeleteItemButton } from "@/features/wallet/delete-item-button";

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
    .select("id, audience, verified_by, rating, review, photos")
    .eq("wallet_item_id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  const { data: merchLinks } = await supabase
    .from("merch_gig_links")
    .select("merch_item_id, merch_items(id, title, images, artist_name, price_cents, currency, fulfilment, merch_drops(title, status, total_stock, total_sold))")
    .eq("wallet_item_id", id);

  const gigMerch = (merchLinks ?? [])
    .filter((l: any) => l.merch_items)
    .map((l: any) => {
      const m = l.merch_items;
      const liveDrop = m.merch_drops?.find((d: any) => d.status === "live");
      return {
        id: m.id,
        title: m.title,
        images: m.images ?? [],
        artist_name: m.artist_name,
        price_cents: m.price_cents,
        currency: m.currency,
        fulfilment: m.fulfilment ?? [],
        drop_title: liveDrop?.title ?? null,
        drop_status: liveDrop?.status ?? null,
        drop_remaining: liveDrop?.total_stock
          ? liveDrop.total_stock - liveDrop.total_sold
          : null,
      };
    });

  // Sign URLs for any attached photos (private bucket).
  const photoKeys = Array.isArray(experience?.photos)
    ? (experience.photos as string[])
    : [];
  const photoUrls: { key: string; url: string }[] = [];
  if (photoKeys.length > 0) {
    const { data: signed } = await supabase.storage
      .from("captures")
      .createSignedUrls(photoKeys, 60 * 60);
    for (let i = 0; i < photoKeys.length; i++) {
      const url = signed?.[i]?.signedUrl;
      if (url) photoUrls.push({ key: photoKeys[i], url });
    }
  }

  const Icon = ICONS[item.kind as keyof typeof ICONS] ?? TicketIcon;
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
                {item.purchased_via_platform ? (
                  <Badge variant="verified" className="bg-primary text-primary-foreground">
                    <ShieldCheck className="mr-1 h-3 w-3 fill-current" />
                    Purchased on GigTrotter
                  </Badge>
                ) : null}
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

          <ItemDateEditor
            itemId={id}
            startsAt={item.starts_at ?? null}
            endsAt={item.ends_at ?? null}
          />

          {/* Ticket extras captured at parse time (standing/seating, entrance,
              presale type, printed price). Confirmed captures persist these in
              meta — they used to be shown on the confirm card then silently
              dropped, which a tester rightly flagged. */}
          {(() => {
            const meta = (item.meta ?? {}) as {
              details?: string[];
              price_total_cents?: number | null;
              currency?: string | null;
            };
            const extras = Array.isArray(meta.details) ? meta.details : [];
            const price =
              typeof meta.price_total_cents === "number"
                ? new Intl.NumberFormat("en-GB", {
                    style: "currency",
                    currency: meta.currency ?? "GBP",
                  }).format(meta.price_total_cents / 100)
                : null;
            if (extras.length === 0 && !price) return null;
            return (
              <div className="rounded-lg border border-border bg-muted/20 p-4">
                <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                  On the ticket
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {price ? <Badge variant="outline">{price}</Badge> : null}
                  {extras.map((d) => (
                    <Badge key={d} variant="outline" className="font-normal">
                      {d}
                    </Badge>
                  ))}
                </div>
              </div>
            );
          })()}

          <ItemDetailsEditor
            itemId={id}
            title={item.title}
            kind={item.kind}
            venueName={item.venues?.name ?? ""}
            city={item.venues?.city ?? ""}
            country={item.venues?.country ?? ""}
          />

          {item.barcode_ref || item.kind === "ticket" || item.kind === "flight" ? (
            <BarcodePanel
              hasBarcode={!!item.barcode_ref}
              eventOver={!!endsAt && endsAt.getTime() < Date.now()}
            />
          ) : null}

          {isFuture && startsAt ? (
            <CountdownShare
              walletItemId={id}
              title={item.title}
              daysUntil={Math.ceil(
                (startsAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
              )}
            />
          ) : null}

          <Separator />

          <WhoElseGoing walletItemId={id} />

          {experience ? (
            <>
              <AudienceSelector
                experienceId={experience.id}
                audience={experience.audience}
              />
              {(endsAt && endsAt.getTime() < Date.now()) || experience.rating ? (
                <ExperienceEditor
                  experienceId={experience.id}
                  initialRating={experience.rating ?? null}
                  initialReview={experience.review ?? null}
                  photoUrls={photoUrls}
                />
              ) : null}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              This becomes a pin on your map once the event has ended.
            </p>
          )}

          {gigMerch.length > 0 ? (
            <>
              <Separator />
              <GigMerchSection items={gigMerch} />
            </>
          ) : null}

          <Separator />
          <div className="flex justify-end">
            <DeleteItemButton itemId={id} />
          </div>
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
