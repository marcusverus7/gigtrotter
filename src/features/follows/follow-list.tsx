"use client";

import { useTransition } from "react";
import { Building2, Disc3, Music2, X } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { unfollow } from "./actions";

type Follow = {
  id: string;
  kind: "artist" | "promoter" | "venue";
  name: string;
};

const KIND_ICON = {
  artist: Music2,
  promoter: Disc3,
  venue: Building2,
} as const;

export function FollowList({ follows }: { follows: Follow[] }) {
  if (follows.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border bg-card/30 p-4 text-center text-xs text-muted-foreground">
        Nothing followed yet. Tour announcements and on-sale alerts come
        through here.
      </p>
    );
  }
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {follows.map((f) => (
        <FollowRow key={f.id} follow={f} />
      ))}
    </ul>
  );
}

function FollowRow({ follow }: { follow: Follow }) {
  const [pending, startTransition] = useTransition();
  const Icon = KIND_ICON[follow.kind];
  const initials = follow.name.slice(0, 2).toUpperCase();
  return (
    <li className="group flex items-center justify-between gap-3 rounded-md border border-border bg-card/40 p-3">
      <div className="flex items-center gap-3">
        <Avatar className="h-9 w-9">
          <AvatarFallback className="text-xs">{initials}</AvatarFallback>
        </Avatar>
        <div>
          <p className="text-sm font-medium">{follow.name}</p>
          <Badge variant="outline" className="mt-0.5 text-[10px] capitalize">
            <Icon className="mr-1 h-3 w-3" />
            {follow.kind}
          </Badge>
        </div>
      </div>
      <Button
        size="icon"
        variant="ghost"
        onClick={() => startTransition(() => unfollow(follow.id))}
        disabled={pending}
        className="opacity-0 transition-opacity group-hover:opacity-100"
        aria-label="Unfollow"
      >
        <X className="h-4 w-4" />
      </Button>
    </li>
  );
}
