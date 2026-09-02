import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TravelBoard } from "@/features/map/travel-board";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { isMapboxConfigured } from "@/lib/env";

/**
 * /app/u/<username> — read-only view of a friend's map.
 *
 * The experiences SELECT policy enforces the time-shift rule, so we just
 * select what we're allowed to see — the policy does the rest. Future
 * events appear iff the viewer is in the owner's inner circle.
 */
export default async function FriendBoardPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const supabase = await createClient();
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    // Deliberately no anon_handle: it IS the /b/<handle> URL of the anonymous
    // board, so printing it beside someone's real username and avatar undoes
    // the one thing that board promises. Nobody but the owner needs it.
    .select("id, username, display_name, avatar_url")
    .eq("username", username.toLowerCase().replace(/^@/, ""))
    .maybeSingle();

  if (!profile) notFound();

  // RLS does the filtering — we ask for everything they own; we get only what we're permitted.
  const { data: experiences } = await supabase
    .from("experiences")
    .select(
      "id, kind, title, subtitle, starts_at, ends_at, audience, verified_by, venues(name, city, country, lat, lng, city_lat, city_lng)",
    )
    .eq("user_id", profile.id)
    .order("starts_at", { ascending: false })
    .limit(1000);

  const pins = (experiences ?? [])
    .map((e) => {
      const venuesRaw = (e as { venues: unknown }).venues;
      const v = (Array.isArray(venuesRaw) ? venuesRaw[0] : venuesRaw) as {
        lat: number | null;
        lng: number | null;
        city_lat: number | null;
        city_lng: number | null;
        name: string | null;
        city: string | null;
        country: string | null;
      } | null;
      const lng = v?.lng ?? v?.city_lng;
      const lat = v?.lat ?? v?.city_lat;
      if (lat == null || lng == null) return null;
      return {
        id: e.id,
        kind: e.kind,
        title: e.title,
        subtitle: v?.name ?? e.subtitle ?? "",
        city: v?.city ?? "",
        country: v?.country ?? "",
        starts_at: e.starts_at,
        audience: e.audience,
        verified: e.verified_by !== "none",
        lng,
        lat,
      };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);

  const initials = (profile.display_name ?? profile.username).slice(0, 2).toUpperCase();

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/app/discover">
          <ArrowLeft /> Back to people
        </Link>
      </Button>

      <div className="flex items-center gap-4">
        <Avatar className="h-14 w-14">
          <AvatarImage src={profile.avatar_url ?? undefined} alt="" />
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {profile.display_name ?? `@${profile.username}`}
          </h1>
          <p className="font-mono text-xs text-muted-foreground">
            @{profile.username}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Badge variant="friends">Their map</Badge>
        <Badge variant="outline">{pins.length} visible pins</Badge>
      </div>

      {isMapboxConfigured ? (
        <TravelBoard pins={pins} />
      ) : (
        <div className="aspect-[16/9] rounded-xl border border-dashed border-border bg-card/40" />
      )}

      <p className="text-xs text-muted-foreground">
        You see what their audience tiers permit you to. Future events appear
        only if you&apos;re in their Inner Circle.
      </p>
    </div>
  );
}
