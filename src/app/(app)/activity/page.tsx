import Link from "next/link";
import { redirect } from "next/navigation";
import { Bookmark, MapPin, Music, Sparkles } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

/**
 * /app/activity — the Tuesday answer (§8.2 demoted from v2's hero).
 *
 * Surfaces what accepted friends added to their wishlist and what new pins
 * landed on their public-tier maps (audience='open' OR 'friends' for accepted
 * bilateral relations). All filtering happens via RLS on the underlying
 * tables — we just ask for what we want and accept what comes back.
 */
export default async function ActivityPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: friendships } = await supabase
    .from("friendships")
    .select("user_a, user_b")
    .or(`user_a.eq.${user.id},user_b.eq.${user.id}`)
    .eq("state", "accepted");

  const friendIds = (friendships ?? []).map((f) =>
    f.user_a === user.id ? f.user_b : f.user_a,
  );

  if (friendIds.length === 0) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <EmptyHeader />
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="text-base">No friends yet</CardTitle>
            <CardDescription>
              The activity feed lights up once you&apos;ve added at least one
              bilateral friend. Open the{" "}
              <Link href="/app/discover" className="text-primary underline">
                People page
              </Link>{" "}
              and send a request by username.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // Get the latest activity from friends. Profiles map for display names.
  const [{ data: pins }, { data: wishes }, { data: profiles }] =
    await Promise.all([
      supabase
        .from("experiences")
        .select("id, kind, title, subtitle, starts_at, user_id")
        .in("user_id", friendIds)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("wishlist")
        .select("id, kind, name, subtitle, created_at, user_id")
        .in("user_id", friendIds)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url")
        .in("id", friendIds),
    ]);

  const profileById = new Map(
    (profiles ?? []).map((p) => [p.id, p as { id: string; username: string; display_name: string | null; avatar_url: string | null }]),
  );

  type FeedItem =
    | {
        kind: "pin";
        id: string;
        userId: string;
        title: string;
        subtitle: string | null;
        date: string;
        pinKind: string;
      }
    | {
        kind: "wishlist";
        id: string;
        userId: string;
        name: string;
        subtitle: string | null;
        wishKind: string;
        created_at: string;
      };

  const feed: FeedItem[] = [
    ...((pins ?? []) as Array<{
      id: string;
      kind: string;
      title: string;
      subtitle: string | null;
      starts_at: string;
      user_id: string;
    }>).map(
      (p): FeedItem => ({
        kind: "pin",
        id: p.id,
        userId: p.user_id,
        title: p.title,
        subtitle: p.subtitle,
        date: p.starts_at,
        pinKind: p.kind,
      }),
    ),
    ...((wishes ?? []) as Array<{
      id: string;
      kind: string;
      name: string;
      subtitle: string | null;
      created_at: string;
      user_id: string;
    }>).map(
      (w): FeedItem => ({
        kind: "wishlist",
        id: w.id,
        userId: w.user_id,
        name: w.name,
        subtitle: w.subtitle,
        wishKind: w.kind,
        created_at: w.created_at,
      }),
    ),
  ].sort((a, b) => {
    const ad = a.kind === "pin" ? a.date : a.created_at;
    const bd = b.kind === "pin" ? b.date : b.created_at;
    return new Date(bd).getTime() - new Date(ad).getTime();
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <EmptyHeader />

      {feed.length === 0 ? (
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="text-base">All quiet</CardTitle>
            <CardDescription>
              Your friends haven&apos;t added anything visible to you. Activity
              respects audience tiers — future pins are Inner-only.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <ol className="space-y-3">
          {feed.slice(0, 30).map((item) => {
            const profile = profileById.get(item.userId);
            const name = profile?.display_name ?? profile?.username ?? "?";
            const initials = name.slice(0, 2).toUpperCase();
            return (
              <li
                key={`${item.kind}-${item.id}`}
                className="rounded-xl border border-border bg-card/50 p-4 transition-colors hover:border-primary/30"
              >
                <div className="flex items-start gap-3">
                  <Link
                    href={
                      profile?.username
                        ? `/app/u/${profile.username}`
                        : "/app/discover"
                    }
                  >
                    <Avatar className="h-9 w-9">
                      <AvatarImage src={profile?.avatar_url ?? undefined} alt="" />
                      <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                    </Avatar>
                  </Link>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">
                      <span className="font-medium">{name}</span>{" "}
                      {item.kind === "pin" ? (
                        <span className="text-muted-foreground">
                          pinned a {item.pinKind}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">
                          added a {item.wishKind} to their wishlist
                        </span>
                      )}
                    </p>
                    <p className="mt-1 truncate text-base font-medium">
                      {item.kind === "pin" ? item.title : item.name}
                    </p>
                    {item.subtitle ? (
                      <p className="truncate text-xs text-muted-foreground">
                        {item.subtitle}
                      </p>
                    ) : null}
                    <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                      {item.kind === "pin" ? (
                        <Badge variant="friends" className="text-[10px]">
                          <MapPin className="mr-1 h-3 w-3" />
                          Pin
                        </Badge>
                      ) : (
                        <Badge variant="inner" className="text-[10px]">
                          <Bookmark className="mr-1 h-3 w-3" />
                          Wishlist
                        </Badge>
                      )}
                      <span className="font-mono tnum">
                        {new Intl.DateTimeFormat(undefined, {
                          day: "numeric",
                          month: "short",
                        }).format(
                          new Date(
                            item.kind === "pin" ? item.date : item.created_at,
                          ),
                        )}
                      </span>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function EmptyHeader() {
  return (
    <header>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Sparkles className="h-4 w-4 text-primary" />
        What your circle is up to.
      </div>
      <h1 className="mt-1 text-2xl font-bold tracking-tight">Activity</h1>
      <p className="text-sm text-muted-foreground">
        Friends&apos; new pins and wishlist adds — filtered by audience tier.
      </p>
    </header>
  );
}
