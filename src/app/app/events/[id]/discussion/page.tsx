import { LocalDateTime } from "@/components/local-datetime";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  ArrowLeft,
  Calendar,
  Lock,
  MapPin,
  Shield,
  Users,
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
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { PostFeed, type DiscussionPost } from "@/features/discussions/post-feed";
import { PostComposer } from "@/features/discussions/post-composer";
import {
  AnnouncementsList,
  PromoterAnnouncementForm,
} from "@/features/discussions/promoter-panel";

export const metadata: Metadata = { title: "Discussion" };

export default async function EventDiscussionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const user = await getSessionUser();
  if (!user) redirect("/login");

  // Load event
  const { data: event } = await supabase
    .from("events")
    .select("id, title, headliner, venue_name, venue_city, starts_at, category, promoter_id, image_url")
    .eq("id", id)
    .maybeSingle();

  if (!event) notFound();

  // Check user's access: do they have a wallet_item matching this event?
  const { data: walletItem } = await supabase
    .from("wallet_items")
    .select("id, purchased_via_platform")
    .eq("user_id", user.id)
    .eq("title", event.title)
    .eq("starts_at", event.starts_at)
    .maybeSingle();

  const isPromoter = event.promoter_id === user.id;
  const hasAccess = !!walletItem || isPromoter;
  const canPost = (walletItem?.purchased_via_platform === true) || isPromoter;

  if (!hasAccess) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <Button asChild variant="ghost" size="sm">
          <Link href={`/app/events/${id}`}>
            <ArrowLeft /> Back to event
          </Link>
        </Button>
        <Card className="border-dashed text-center">
          <CardHeader>
            <Lock className="mx-auto h-10 w-10 text-muted-foreground/30" />
            <CardTitle className="text-lg">Discussion locked</CardTitle>
            <CardDescription>
              You need a ticket for <strong>{event.title}</strong> in your
              wallet to access this discussion. Add the event to your wallet
              or buy a ticket through GigTrotter to join.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href={`/app/events/${id}`}>View event</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Load posts with authors
  const { data: rawPosts } = await supabase
    .from("discussion_posts")
    .select("*")
    .eq("event_id", id)
    .eq("is_hidden", false)
    .order("created_at", { ascending: false })
    .limit(50);

  // Load author profiles
  const authorIds = [...new Set((rawPosts ?? []).map((p) => p.author_id))];
  const authorMap: Record<string, any> = {};
  if (authorIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name, username, avatar_url")
      .in("id", authorIds);
    for (const p of profiles ?? []) {
      authorMap[p.id] = p;
    }
  }

  // Check which authors purchased via platform
  const purchaseMap: Record<string, boolean> = {};
  if (authorIds.length > 0) {
    const { data: walletItems } = await supabase
      .from("wallet_items")
      .select("user_id, purchased_via_platform")
      .eq("title", event.title)
      .eq("starts_at", event.starts_at)
      .in("user_id", authorIds);
    for (const w of walletItems ?? []) {
      purchaseMap[w.user_id] = w.purchased_via_platform;
    }
  }

  // Load reactions for current user
  const postIds = (rawPosts ?? []).map((p) => p.id);
  const myReactions = new Set<string>();
  if (postIds.length > 0) {
    const { data: reactions } = await supabase
      .from("discussion_reactions")
      .select("post_id")
      .eq("user_id", user.id)
      .in("post_id", postIds);
    for (const r of reactions ?? []) {
      myReactions.add(r.post_id);
    }
  }

  // Load replies
  const repliesMap: Record<string, any[]> = {};
  if (postIds.length > 0) {
    const { data: replies } = await supabase
      .from("discussion_replies")
      .select("*")
      .in("post_id", postIds)
      .eq("is_hidden", false)
      .order("created_at", { ascending: true })
      .limit(200);

    const replyAuthorIds = [...new Set((replies ?? []).map((r) => r.author_id))];
    const replyAuthorMap: Record<string, any> = {};
    if (replyAuthorIds.length > 0) {
      const { data: rProfiles } = await supabase
        .from("profiles")
        .select("id, display_name, username, avatar_url")
        .in("id", replyAuthorIds);
      for (const p of rProfiles ?? []) {
        replyAuthorMap[p.id] = p;
      }
    }

    for (const reply of replies ?? []) {
      if (!repliesMap[reply.post_id]) repliesMap[reply.post_id] = [];
      repliesMap[reply.post_id].push({
        ...reply,
        author: {
          ...(replyAuthorMap[reply.author_id] ?? {
            display_name: null,
            username: "anon",
            avatar_url: null,
          }),
          purchased_via_platform: purchaseMap[reply.author_id] ?? false,
        },
      });
    }
  }

  // Assemble posts
  const posts: DiscussionPost[] = (rawPosts ?? []).map((p) => ({
    ...p,
    author: {
      id: p.author_id,
      ...(authorMap[p.author_id] ?? {
        display_name: null,
        username: "anon",
        avatar_url: null,
      }),
      purchased_via_platform: purchaseMap[p.author_id] ?? false,
    },
    user_reacted: myReactions.has(p.id),
    replies: repliesMap[p.id] ?? [],
  }));

  // Load promoter announcements
  const { data: announcements } = await supabase
    .from("promoter_announcements")
    .select("*")
    .eq("event_id", id)
    .order("is_pinned", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(10);

  // Stats
  const { count: memberCount } = await supabase
    .from("wallet_items")
    .select("id", { count: "exact", head: true })
    .eq("title", event.title)
    .eq("starts_at", event.starts_at);

  const { count: verifiedCount } = await supabase
    .from("wallet_items")
    .select("id", { count: "exact", head: true })
    .eq("title", event.title)
    .eq("starts_at", event.starts_at)
    .eq("purchased_via_platform", true);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href={`/app/events/${id}`}>
          <ArrowLeft /> Back to event
        </Link>
      </Button>

      {/* Event header */}
      <Card className="overflow-hidden">
        <div className="flex items-center gap-4 p-4">
          {event.image_url ? (
            <img
              src={event.image_url}
              alt=""
              className="h-16 w-16 rounded-lg object-cover"
            />
          ) : null}
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-bold leading-tight">{event.title}</h1>
            <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
              {event.venue_name ? (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {event.venue_name}, {event.venue_city}
                </span>
              ) : null}
              {event.starts_at ? (
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  <LocalDateTime
                    iso={event.starts_at}
                    options={{ weekday: "short", day: "numeric", month: "short" }}
                  />
                </span>
              ) : null}
            </div>
          </div>
          <div className="text-right">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Users className="h-3 w-3" />
              {memberCount ?? 0}
            </div>
            <div className="flex items-center gap-1 text-xs text-primary">
              <Shield className="h-3 w-3 fill-current" />
              {verifiedCount ?? 0}
            </div>
          </div>
        </div>
      </Card>

      {/* Access tier indicator */}
      {canPost ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="verified" className="gap-0.5 text-[9px]">
            <Shield className="h-2.5 w-2.5 fill-current" />
            Full access
          </Badge>
          You can post, share photos, and react.
        </div>
      ) : (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="outline" className="gap-0.5 text-[9px]">
            <Lock className="h-2.5 w-2.5" />
            View only
          </Badge>
          Purchase through GigTrotter to unlock full access and the purple tick.
        </div>
      )}

      {/* Promoter tools */}
      {isPromoter ? (
        <PromoterAnnouncementForm eventId={id} />
      ) : null}

      {/* Pinned announcements */}
      <AnnouncementsList announcements={announcements ?? []} />

      <Separator />

      {/* Composer */}
      <PostComposer eventId={id} canPost={canPost} />

      {/* Feed */}
      <PostFeed posts={posts} viewerId={user.id} canInteract={canPost} />
    </div>
  );
}
