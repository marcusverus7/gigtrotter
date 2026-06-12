"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import {
  Camera,
  Flame,
  Heart,
  MessageCircle,
  MoreHorizontal,
  Shield,
  Trash2,
} from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

import { toggleReaction, deleteDiscussionPost } from "./actions";

export type PostAuthor = {
  id: string;
  display_name: string | null;
  username: string;
  avatar_url: string | null;
  purchased_via_platform: boolean;
};

export type DiscussionPost = {
  id: string;
  event_id: string;
  author_id: string;
  body: string | null;
  photos: string[];
  post_type: string;
  reaction_count: number;
  reply_count: number;
  created_at: string;
  author: PostAuthor;
  user_reacted: boolean;
  replies: {
    id: string;
    body: string;
    created_at: string;
    author: PostAuthor;
  }[];
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
  }).format(new Date(dateStr));
}

function PostItem({
  post,
  viewerId,
  canInteract,
}: {
  post: DiscussionPost;
  viewerId: string;
  canInteract: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const initials = (post.author.display_name ?? post.author.username)
    .slice(0, 2)
    .toUpperCase();
  const isOwn = post.author_id === viewerId;

  function onReact() {
    if (!canInteract) {
      toast.error("Purchase through GigTrotter to react to posts.");
      return;
    }
    startTransition(async () => {
      await toggleReaction({
        postId: post.id,
        eventId: post.event_id,
      });
    });
  }

  function onDelete() {
    startTransition(async () => {
      await deleteDiscussionPost(post.id, post.event_id);
      toast.success("Post deleted.");
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        <Avatar className="h-9 w-9">
          <AvatarImage src={post.author.avatar_url ?? undefined} alt="" />
          <AvatarFallback className="text-xs">{initials}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">
              {post.author.display_name ?? post.author.username}
            </span>
            {post.author.purchased_via_platform ? (
              <Badge
                variant="verified"
                className="gap-0.5 px-1.5 py-0 text-[9px]"
              >
                <Shield className="h-2.5 w-2.5 fill-current" />
                Verified
              </Badge>
            ) : null}
            <span className="text-[10px] text-muted-foreground" suppressHydrationWarning>
              {timeAgo(post.created_at)}
            </span>
            {isOwn ? (
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto h-6 w-6 p-0"
                onClick={onDelete}
                disabled={pending}
              >
                <Trash2 className="h-3 w-3 text-muted-foreground" />
              </Button>
            ) : null}
          </div>

          {post.body ? (
            <p className="mt-1 whitespace-pre-line text-sm">{post.body}</p>
          ) : null}

          {post.photos.length > 0 ? (
            <div
              className={`mt-2 grid gap-1.5 ${
                post.photos.length === 1
                  ? "grid-cols-1"
                  : post.photos.length === 2
                    ? "grid-cols-2"
                    : "grid-cols-2 sm:grid-cols-3"
              }`}
            >
              {post.photos.slice(0, 6).map((url, i) => (
                <div
                  key={i}
                  className="overflow-hidden rounded-lg border border-border"
                >
                  <img
                    src={url}
                    alt=""
                    className="aspect-square w-full object-cover"
                  />
                </div>
              ))}
            </div>
          ) : null}

          {/* Reactions + reply count */}
          <div className="mt-2 flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-xs"
              onClick={onReact}
              disabled={pending}
            >
              <Flame
                className={`h-3.5 w-3.5 ${
                  post.user_reacted
                    ? "fill-orange-500 text-orange-500"
                    : "text-muted-foreground"
                }`}
              />
              {post.reaction_count > 0 ? post.reaction_count : null}
            </Button>
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <MessageCircle className="h-3 w-3" />
              {post.reply_count > 0 ? `${post.reply_count} replies` : "Reply"}
            </span>
          </div>
        </div>
      </div>

      {/* Replies */}
      {post.replies.length > 0 ? (
        <div className="ml-12 space-y-2 border-l-2 border-border/40 pl-4">
          {post.replies.map((reply) => {
            const rInitials = (
              reply.author.display_name ?? reply.author.username
            )
              .slice(0, 2)
              .toUpperCase();
            return (
              <div key={reply.id} className="flex items-start gap-2">
                <Avatar className="h-6 w-6">
                  <AvatarImage
                    src={reply.author.avatar_url ?? undefined}
                    alt=""
                  />
                  <AvatarFallback className="text-[8px]">
                    {rInitials}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium">
                      {reply.author.display_name ?? reply.author.username}
                    </span>
                    {reply.author.purchased_via_platform ? (
                      <Shield className="h-2.5 w-2.5 fill-primary text-primary" />
                    ) : null}
                    <span className="text-[9px] text-muted-foreground" suppressHydrationWarning>
                      {timeAgo(reply.created_at)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{reply.body}</p>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export function PostFeed({
  posts,
  viewerId,
  canInteract,
}: {
  posts: DiscussionPost[];
  viewerId: string;
  canInteract: boolean;
}) {
  if (posts.length === 0) {
    return (
      <div className="py-8 text-center">
        <Camera className="mx-auto h-10 w-10 text-muted-foreground/30" />
        <p className="mt-3 text-sm text-muted-foreground">
          No posts yet. Be the first to share your experience!
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {posts.map((post, i) => (
        <div key={post.id}>
          <PostItem
            post={post}
            viewerId={viewerId}
            canInteract={canInteract}
          />
          {i < posts.length - 1 ? <Separator className="mt-4" /> : null}
        </div>
      ))}
    </div>
  );
}
