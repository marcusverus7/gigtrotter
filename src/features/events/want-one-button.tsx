"use client";

import { useState, useTransition } from "react";
import { Bell } from "lucide-react";

import { Button } from "@/components/ui/button";

import { toggleWaitlist } from "./waitlist-actions";

/**
 * "Want one" on a sold-out event. Joins a per-event waitlist; the count is
 * public, the names are not. When the resale side opens, a spare for this
 * event notifies the waitlist — inner circle first.
 */
export function WantOneButton({
  eventId,
  initialWanted,
  initialCount,
}: {
  eventId: string;
  initialWanted: boolean;
  initialCount: number;
}) {
  const [wanted, setWanted] = useState(initialWanted);
  const [count, setCount] = useState(initialCount);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-1">
      <Button
        variant={wanted ? "default" : "outline"}
        aria-pressed={wanted}
        disabled={pending}
        className="w-full"
        onClick={() => {
          setError(null);
          start(async () => {
            try {
              const next = !wanted;
              await toggleWaitlist(eventId, next);
              setWanted(next);
              setCount((c) => Math.max(0, c + (next ? 1 : -1)));
            } catch (e) {
              setError(e instanceof Error ? e.message : "Could not update.");
            }
          });
        }}
      >
        <Bell className={wanted ? "fill-current" : ""} />
        {wanted ? "On the list — we'll tell you about spares" : "Want one? Join the list"}
      </Button>
      <p className="text-xs text-muted-foreground">
        {count === 0 ? "Be the first to ask." : `${count} ${count === 1 ? "person wants" : "people want"} a ticket.`}
      </p>
      {error ? <p className="text-xs text-destructive" role="alert">{error}</p> : null}
    </div>
  );
}
