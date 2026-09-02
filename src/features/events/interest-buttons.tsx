"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Heart, Star } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { toggleEventInterest } from "./actions";

export function InterestButtons({
  eventId,
  currentInterest,
}: {
  eventId: string;
  currentInterest: "interested" | "going" | null;
}) {
  const [pending, startTransition] = useTransition();

  function toggle(type: "interested" | "going") {
    startTransition(async () => {
      try {
        await toggleEventInterest(eventId, type);
        // currentInterest is the prop from BEFORE the toggle, so it describes
        // what just changed correctly — but only if the action succeeded,
        // which is why the toast lives inside the try.
        if (currentInterest === type) {
          toast.success("Removed.");
        } else {
          toast.success(type === "going" ? "Marked as going!" : "Marked as interested.");
        }
      } catch {
        toast.error("That didn't save — try again.");
      }
    });
  }

  return (
    <div className="flex gap-2">
      <Button
        variant={currentInterest === "interested" ? "default" : "outline"}
        size="sm"
        className={cn(
          "flex-1",
          currentInterest === "interested" && "bg-primary text-primary-foreground",
        )}
        onClick={() => toggle("interested")}
        disabled={pending}
      >
        <Star
          className={cn(
            "mr-1 h-4 w-4",
            currentInterest === "interested" && "fill-current",
          )}
        />
        {currentInterest === "interested" ? "Interested" : "Interested?"}
      </Button>
      <Button
        variant={currentInterest === "going" ? "default" : "outline"}
        size="sm"
        className={cn(
          "flex-1",
          currentInterest === "going" && "bg-secondary text-secondary-foreground",
        )}
        onClick={() => toggle("going")}
        disabled={pending}
      >
        <Heart
          className={cn(
            "mr-1 h-4 w-4",
            currentInterest === "going" && "fill-current",
          )}
        />
        {currentInterest === "going" ? "Going!" : "Going?"}
      </Button>
    </div>
  );
}
