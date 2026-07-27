"use client";

import { useTransition } from "react";
import { Check, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { setEventModerationStatus } from "./admin-actions";

export function ModerationButtons({
  eventId,
  title,
}: {
  eventId: string;
  title: string;
}) {
  const [pending, startTransition] = useTransition();

  function decide(status: "approved" | "rejected") {
    startTransition(async () => {
      try {
        await setEventModerationStatus(eventId, status);
        toast.success(
          status === "approved"
            ? `Published "${title}".`
            : `Rejected "${title}".`,
        );
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : "Couldn't update this event.",
        );
      }
    });
  }

  return (
    <div className="flex shrink-0 gap-2">
      <Button size="sm" disabled={pending} onClick={() => decide("approved")}>
        <Check className="h-4 w-4" />
        Approve
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => decide("rejected")}
      >
        <X className="h-4 w-4" />
        Reject
      </Button>
    </div>
  );
}
