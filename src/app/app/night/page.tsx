import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Moon } from "lucide-react";

export const metadata: Metadata = { title: "Tonight" };

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { NightCard } from "@/features/wallet/night-card";
import { createClient, getSessionUser } from "@/lib/supabase/server";

/**
 * /app/night — Night Mode (§8.2).
 *
 * Lock-screen-style ticket surface for tonight's items. Doors/set times,
 * countdown, pinned meet spot, last-train reminder. The thing that makes
 * gig night unthinkable without GigTrotter.
 */
export default async function NightModePage() {
  const supabase = await createClient();
  const user = await getSessionUser();
  if (!user) redirect("/login");

  // "Tonight" = anything starting in the next 12h or live now.
  const horizon = new Date(Date.now() + 12 * 3600_000).toISOString();
  const floor = new Date(Date.now() - 6 * 3600_000).toISOString();

  const { data: items } = await supabase
    .from("wallet_items")
    .select("*, venues(name, city, country, lat, lng)")
    .eq("user_id", user.id)
    // A wishlist item is a gig the user has NO ticket for; it must not render
    // as tonight's ticket with a countdown and a barcode section.
    .neq("status", "wishlist")
    .gte("starts_at", floor)
    .lte("starts_at", horizon)
    .order("starts_at", { ascending: true });

  return (
    <div className="relative mx-auto max-w-2xl space-y-6">
      {/* Ambient pull */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute left-1/2 top-[10%] h-[60vh] w-[60vh] -translate-x-1/2 rounded-full bg-primary/20 blur-[140px]" />
      </div>

      <header className="space-y-1 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-xs text-primary">
          <Moon className="h-3 w-3" />
          Night Mode
        </div>
        <h1 className="mt-3 text-3xl font-bold tracking-tight">Tonight</h1>
        <p className="text-sm text-muted-foreground">
          Everything you need for the next 12 hours, in one place.
        </p>
      </header>

      {items && items.length > 0 ? (
        <div className="space-y-5">
          {items.map((i) => (
            <NightCard key={i.id} item={i} />
          ))}
        </div>
      ) : (
        <Card className="border-dashed text-center">
          <CardHeader>
            <CardTitle className="text-base">Nothing tonight</CardTitle>
            <CardDescription>
              Night Mode lights up when something starts in the next 12 hours.
              Capture your next ticket and come back.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/app/capture">Open Capture</Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
