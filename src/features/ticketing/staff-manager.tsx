"use client";

import { useState, useTransition } from "react";
import { UserMinus, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { addDoorStaff, removeDoorStaff } from "./actions";

export type StaffRow = { user_id: string; username: string | null; display_name: string | null };

/**
 * Door staff for one event (PAY-04). The promoter names people on GigTrotter
 * who may open the scanner for this event only; they see no sales, payouts
 * or buyer details, and lose access the moment they are removed.
 */
export function StaffManager({ eventId, staff }: { eventId: string; staff: StaffRow[] }) {
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="space-y-3">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          start(async () => {
            try {
              await addDoorStaff(eventId, username);
              setUsername("");
            } catch (err) {
              setError(err instanceof Error ? err.message : "Could not add them.");
            }
          });
        }}
      >
        <Input
          aria-label="Username of the person working the door"
          placeholder="@username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoCapitalize="none"
          autoCorrect="off"
          className="h-11"
        />
        <Button type="submit" className="h-11" disabled={pending || !username.trim()}>
          <UserPlus /> Add to the door
        </Button>
      </form>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {staff.length > 0 ? (
        <ul className="divide-y divide-border text-sm">
          {staff.map((s) => (
            <li key={s.user_id} className="flex items-center justify-between py-2">
              <span>
                {s.display_name ?? (s.username ? `@${s.username}` : "Someone")}
                {s.username && s.display_name ? <span className="text-muted-foreground"> · @{s.username}</span> : null}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="min-h-[44px]"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    try {
                      await removeDoorStaff(eventId, s.user_id);
                    } catch (err) {
                      setError(err instanceof Error ? err.message : "Could not remove them.");
                    }
                  })
                }
              >
                <UserMinus /> Remove
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Nobody yet. Only you can open the scanner.</p>
      )}
    </div>
  );
}
