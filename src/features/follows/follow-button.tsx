"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Heart } from "lucide-react";

import { Button } from "@/components/ui/button";

import { follow, unfollow } from "./actions";

/**
 * Follow / unfollow where you actually meet the artist or venue.
 *
 * The artist page used to say "Follow this artist on the Discover page" —
 * which the nav calls People, and where the name had to be retyped exactly.
 * One tap here is what feeds "For you" on Events and the tour/on-sale alerts.
 */
export function FollowButton({
  kind,
  name,
  followId,
}: {
  kind: "artist" | "venue" | "promoter";
  name: string;
  /** The caller's existing follow row, if any. */
  followId: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const following = !!followId;

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        size="sm"
        variant={following ? "default" : "outline"}
        aria-pressed={following}
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            try {
              if (followId) await unfollow(followId);
              else await follow({ kind, name });
              // The actions revalidate /app/discover; this page's `followId`
              // prop only changes when it re-renders.
              router.refresh();
            } catch (e) {
              setError(e instanceof Error ? e.message : "Could not update follow.");
            }
          });
        }}
      >
        <Heart className={following ? "fill-current" : ""} />
        {following ? "Following" : "Follow"}
      </Button>
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {!following && !error ? (
        <p className="text-xs text-muted-foreground">
          Get an alert when new dates are announced or tickets go on sale.
        </p>
      ) : null}
    </div>
  );
}
