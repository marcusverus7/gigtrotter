"use client";

import { useTransition } from "react";
import Link from "next/link";
import { Check, Eye, X } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { Database } from "@/lib/supabase/types";

import { acceptFriendRequest, removeFriend } from "./actions";

type Friendship = Database["public"]["Tables"]["friendships"]["Row"];
type Profile = Pick<
  Database["public"]["Tables"]["profiles"]["Row"],
  "id" | "username" | "display_name" | "avatar_url" | "anon_handle"
>;

export function FriendsList({
  currentUserId,
  accepted,
  pendingIncoming,
  pendingOutgoing,
  profileById,
}: {
  currentUserId: string;
  accepted: Friendship[];
  pendingIncoming: Friendship[];
  pendingOutgoing: Friendship[];
  profileById: Record<string, Profile>;
}) {
  const other = (f: Friendship) =>
    profileById[f.user_a === currentUserId ? f.user_b : f.user_a];

  return (
    <div className="space-y-6">
      {pendingIncoming.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Requests</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {pendingIncoming.map((f) => (
              <FriendRow
                key={f.id}
                profile={other(f)}
                actions={<IncomingActions friendshipId={f.id} />}
              />
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Friends · {accepted.length}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {accepted.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nobody yet. Add by username above — accepted bilaterally.
            </p>
          ) : (
            accepted.map((f) => (
              <FriendRow
                key={f.id}
                profile={other(f)}
                actions={<AcceptedActions profile={other(f)} friendshipId={f.id} />}
              />
            ))
          )}
        </CardContent>
      </Card>

      {pendingOutgoing.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Awaiting them</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {pendingOutgoing.map((f) => (
              <FriendRow
                key={f.id}
                profile={other(f)}
                actions={
                  <Badge variant="outline" className="text-xs">
                    Pending
                  </Badge>
                }
              />
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function FriendRow({
  profile,
  actions,
}: {
  profile?: Profile;
  actions: React.ReactNode;
}) {
  const initials = (profile?.display_name ?? profile?.username ?? "?")
    .slice(0, 2)
    .toUpperCase();
  // A row can arrive before its profile does. Without this the name line read
  // "@undefined" on both lines rather than degrading to something sensible.
  const handle = profile?.username ? `@${profile.username}` : null;
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-card/40 p-3">
      <div className="flex items-center gap-3">
        <Avatar className="h-9 w-9">
          <AvatarImage src={profile?.avatar_url ?? undefined} alt="" />
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
        <div>
          <p className="text-sm font-medium">
            {profile?.display_name ?? handle ?? "Unknown"}
          </p>
          {handle ? (
            <p className="font-mono text-xs text-muted-foreground">{handle}</p>
          ) : null}
        </div>
      </div>
      <div className="flex items-center gap-2">{actions}</div>
    </div>
  );
}

function IncomingActions({ friendshipId }: { friendshipId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <>
      <Button
        size="sm"
        onClick={() => startTransition(() => acceptFriendRequest(friendshipId))}
        disabled={pending}
      >
        <Check /> Accept
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => startTransition(() => removeFriend(friendshipId))}
        disabled={pending}
      >
        <X />
      </Button>
    </>
  );
}

function AcceptedActions({
  profile,
  friendshipId,
}: {
  profile?: Profile;
  friendshipId: string;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <>
      {profile?.username ? (
        <Button size="sm" variant="outline" asChild>
          <Link href={`/app/u/${profile.username}`}>
            <Eye /> Map
          </Link>
        </Button>
      ) : null}
      <Button
        size="sm"
        variant="ghost"
        onClick={() => startTransition(() => removeFriend(friendshipId))}
        disabled={pending}
      >
        <X />
      </Button>
    </>
  );
}
